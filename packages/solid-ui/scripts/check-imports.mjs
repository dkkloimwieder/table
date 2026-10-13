import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)
const allowed = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
])
let count = 0
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) await visit(path)
    else if (/\.tsx?$/.test(entry.name)) {
      count++
      const source = ts.createSourceFile(
        path,
        await readFile(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      )
      function inspect(node) {
        const specifier =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined
        if (specifier) {
          assert.ok(
            ts.isStringLiteral(specifier),
            `${path}: imports must have explicit module paths`,
          )
          const name = specifier.text
          if (name.startsWith('.')) {
            assert.ok(
              resolve(dirname(path), name).startsWith(
                root.replace(/\/$/, '') + sep,
              ),
              `${path}: import escapes UI source: ${name}`,
            )
          } else {
            const packageName = name
              .split('/')
              .slice(0, name.startsWith('@') ? 2 : 1)
              .join('/')
            assert.ok(
              allowed.has(packageName),
              `${path}: undeclared UI dependency: ${name}`,
            )
            if (packageName === '@tanstack/solid-table')
              assert.equal(
                name,
                '@tanstack/solid-table/native',
                `${path}: UI must use the native engine`,
              )
          }
        }
        ts.forEachChild(node, inspect)
      }
      inspect(source)
    }
  }
}
await visit(root)
console.log(`Checked import ownership for ${count} UI source files`)
