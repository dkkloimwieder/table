import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = resolve(root, 'src/vendor/kobalte')
const provenance = JSON.parse(
  readFileSync(resolve(vendor, 'provenance.json'), 'utf8'),
)
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const dependencies = new Set([
  ...Object.keys(manifest.dependencies),
  ...Object.keys(manifest.peerDependencies),
])
const paths = readdirSync(vendor, { recursive: true }).filter(
  (path) => /\.(tsx?|md)$/.test(path) && !path.endsWith('README.md'),
)
assert.deepEqual(
  paths.sort(),
  Object.keys(provenance.sources).sort(),
  'vendor file inventory',
)
for (const [path, expected] of Object.entries(provenance.sources)) {
  const file = resolve(vendor, path)
  const bytes = readFileSync(file)
  const digest = createHash('sha256').update(bytes).digest('hex')
  assert.equal(digest, expected.localSha256, `local source hash: ${path}`)
  assert.match(
    expected.upstreamSha256,
    /^[a-f0-9]{64}$/,
    `upstream hash: ${path}`,
  )
  if (path.endsWith('LICENSE.md'))
    assert.equal(digest, expected.upstreamSha256, `unchanged license: ${path}`)
  if (!/\.tsx?$/.test(path)) continue
  for (const { fileName: imported } of ts.preProcessFile(bytes.toString(), true)
    .importedFiles) {
    if (imported.startsWith('.')) {
      const base = resolve(dirname(file), imported)
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
      ].find(existsSync)
      assert.ok(target, `resolved relative import: ${path}: ${imported}`)
      assert.ok(
        !relative(resolve(root, 'src'), target).startsWith('..'),
        `library-owned import: ${path}`,
      )
    } else {
      assert.ok(
        dependencies.has(imported),
        `declared external dependency: ${path}: ${imported}`,
      )
      assert.ok(
        !imported.startsWith('@kobalte/'),
        `no installed Kobalte implementation: ${path}`,
      )
    }
  }
}
console.log(
  `Checked ${paths.length} vendor files, licenses, and import ownership`,
)
