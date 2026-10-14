import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'test-results/solid-ui-vendor-audit' },
    bundles: { type: 'boolean', default: false },
    'kobalte-upstream': { type: 'string' },
    'virtual-upstream': { type: 'string' },
  },
})
const output = resolve(root, values.output)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = async (path) => JSON.parse(await readFile(path, 'utf8'))
const core = resolve(root, 'packages/solid-ui-core')
const ui = resolve(root, 'packages/solid-ui')
const kobalte = resolve(core, 'src/vendor/kobalte')
const virtual = resolve(ui, 'src/virtual/vendor/virtual-core')
const origins = {
  kobalte: await json(resolve(kobalte, 'provenance.json')),
  virtual: await json(resolve(virtual, 'provenance.json')),
}
const packages = [core, ui]
const manifests = await Promise.all(
  packages.map((path) => json(resolve(path, 'package.json'))),
)
const report = {
  origins,
  sources: [],
  dependencies: {},
  comparisons: {},
  bundles: [],
}
await mkdir(output, { recursive: true })

for (const script of [
  'packages/solid-ui-core/scripts/check-vendor.mjs',
  'packages/solid-ui/scripts/check-virtual-vendor.mjs',
]) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
}

async function files(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) result.push(...(await files(path)))
    else if (/\.(tsx?|css)$/.test(entry.name)) result.push(path)
  }
  return result.sort()
}
const sourceFiles = (
  await Promise.all(packages.map((path) => files(resolve(path, 'src'))))
).flat()
const sourcePaths = new Set(sourceFiles)
const packageName = (name) =>
  name
    .split('/')
    .slice(0, name.startsWith('@') ? 2 : 1)
    .join('/')
function localTarget(path, name) {
  const base = resolve(dirname(path), name)
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ].find((candidate) => sourcePaths.has(candidate))
}
function imports(path, text) {
  if (path.endsWith('.css')) {
    return [...text.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => ({
      name: match[1],
      typeOnly: false,
    }))
  }
  const result = []
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        assert.ok(ts.isStringLiteral(node.moduleSpecifier), path)
        const clause = node.importClause
        const bindings = clause?.namedBindings ?? node.exportClause
        const namedTypes =
          bindings &&
          (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
          bindings.elements.length > 0 &&
          bindings.elements.every((element) => element.isTypeOnly)
        result.push({
          name: node.moduleSpecifier.text,
          typeOnly: Boolean(
            node.isTypeOnly ||
            clause?.isTypeOnly ||
            (!clause?.name && namedTypes),
          ),
        })
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      assert.ok(
        ts.isStringLiteral(node.arguments[0]),
        `${path}: dynamic import needs a literal`,
      )
      result.push({ name: node.arguments[0].text, typeOnly: false })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}
for (const path of sourceFiles) {
  const owner = path.startsWith(core + '/') ? 0 : 1
  const manifest = manifests[owner]
  const bytes = await readFile(path)
  const imported = imports(path, bytes.toString())
  for (const item of imported) {
    if (item.name.startsWith('.')) {
      const target = localTarget(path, item.name)
      assert.ok(target, `${path}: unresolved import ${item.name}`)
      item.target = relative(root, target)
    } else {
      const name = packageName(item.name)
      const declared =
        manifest.dependencies?.[name] ?? manifest.peerDependencies?.[name]
      assert.ok(
        declared,
        `${path}: undeclared runtime or peer dependency ${name}`,
      )
      item.package = name
      const entry = (report.dependencies[name] ??= {
        declarations: {},
        runtimeImporters: [],
        typeImporters: [],
      })
      entry.declarations[manifest.name] = declared
      entry[item.typeOnly ? 'typeImporters' : 'runtimeImporters'].push(
        relative(root, path),
      )
      const workspace = manifests.findIndex(
        (candidate) => candidate.name === name,
      )
      if (workspace >= 0) {
        const subpath =
          item.name === name ? '.' : './' + item.name.slice(name.length + 1)
        const exported = manifests[workspace].exports[subpath]
        assert.equal(
          typeof exported,
          'string',
          `${item.name}: exported workspace entry`,
        )
        item.target = relative(root, resolve(packages[workspace], exported))
      }
    }
  }
  const upstream = path.startsWith(kobalte + '/')
    ? 'kobalte'
    : path.startsWith(virtual + '/')
      ? 'virtual'
      : 'repository'
  const name = relative(
    upstream === 'kobalte' ? kobalte : upstream === 'virtual' ? virtual : root,
    path,
  )
  const upstreamSha256 =
    upstream === 'kobalte'
      ? origins.kobalte.sources[name].upstreamSha256
      : upstream === 'virtual'
        ? origins.virtual.upstreamSha256[name]
        : undefined
  if (upstream !== 'repository') {
    assert.match(
      upstreamSha256,
      /^[a-f0-9]{64}$/,
      `${path}: recorded upstream hash`,
    )
  }
  report.sources.push({
    path: relative(root, path),
    origin: upstream,
    upstreamPath:
      upstream === 'kobalte'
        ? 'packages/' + name
        : upstream === 'virtual'
          ? 'src/' + name
          : undefined,
    localSha256: hash(bytes),
    upstreamSha256,
    imports: imported,
  })
}
for (const entry of Object.values(report.dependencies)) {
  entry.runtimeImporters = [...new Set(entry.runtimeImporters)].sort()
  entry.typeImporters = [...new Set(entry.typeImporters)].sort()
}

async function compare(name, originalRoot, inventory, localRoot, upstreamPath) {
  await mkdir(resolve(output, 'comparisons'), { recursive: true })
  const directory = await mkdtemp(resolve(output, 'comparisons', name + '-'))
  const stage = resolve(directory, 'upstream')
  await mkdir(directory, { recursive: true })
  const changed = []
  for (const [path, expected] of Object.entries(inventory)) {
    const bytes = await readFile(resolve(originalRoot, upstreamPath(path)))
    assert.equal(
      hash(bytes),
      expected.upstreamSha256,
      `${name}: original hash ${path}`,
    )
    await mkdir(dirname(resolve(stage, path)), { recursive: true })
    await writeFile(resolve(stage, path), bytes)
    const local = await readFile(resolve(localRoot, path))
    assert.equal(
      hash(local),
      expected.localSha256,
      `${name}: local hash ${path}`,
    )
    await mkdir(dirname(resolve(directory, 'local', path)), { recursive: true })
    await writeFile(resolve(directory, 'local', path), local)
    if (expected.upstreamSha256 !== expected.localSha256) changed.push(path)
  }
  const diff = spawnSync(
    'git',
    ['diff', '--no-index', '--no-ext-diff', '--', 'upstream', 'local'],
    { cwd: directory, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  )
  assert.ok(diff.status === 0 || diff.status === 1, diff.stderr)
  const patch = resolve(directory, 'local.patch')
  await writeFile(patch, diff.stdout)
  await cp(stage, resolve(directory, 'replayed'), {
    recursive: true,
    force: true,
  })
  if (changed.length) {
    for (const extra of [['--check'], []]) {
      const applied = spawnSync(
        'git',
        ['apply', ...extra, '-p2', '--directory=replayed', 'local.patch'],
        {
          cwd: directory,
          encoding: 'utf8',
          env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(directory) },
        },
      )
      assert.equal(applied.status, 0, applied.stderr)
    }
  }
  for (const [path, expected] of Object.entries(inventory)) {
    assert.equal(
      hash(await readFile(resolve(directory, 'replayed', path))),
      expected.localSha256,
      `${name}: replay hash ${path}`,
    )
  }
  report.comparisons[name] = {
    originalRoot,
    changed,
    patch: relative(root, patch),
    replay: 'passed',
  }
}
if (values['kobalte-upstream']) {
  await compare(
    'kobalte',
    resolve(values['kobalte-upstream']),
    origins.kobalte.sources,
    kobalte,
    (path) => (path === 'LICENSE.md' ? path : 'packages/' + path),
  )
}
if (values['virtual-upstream']) {
  const inventory = Object.fromEntries(
    Object.keys(origins.virtual.localSha256).map((path) => [
      path,
      {
        upstreamSha256: origins.virtual.upstreamSha256[path],
        localSha256: origins.virtual.localSha256[path],
      },
    ]),
  )
  await compare(
    'virtual',
    resolve(values['virtual-upstream']),
    inventory,
    virtual,
    (path) => (path === 'LICENSE' ? path : 'src/' + path),
  )
}

function group(id) {
  if (id.includes('/solid-ui-core/src/vendor/kobalte/')) return 'kobalte'
  if (id.includes('/solid-ui/src/virtual/vendor/virtual-core/'))
    return 'virtual'
  if (id.includes('/solid-ui-core/src/')) return 'owned-core'
  if (id.includes('/solid-ui/src/')) return 'owned-ui'
  return id.includes('/node_modules/')
    ? 'external'
    : 'application-and-native-table'
}
async function externalPackages(modules) {
  const found = new Map()
  const visited = new Set()
  for (const module of modules.filter(
    (entry) => entry.group === 'external' && entry.renderedCharacters > 0,
  )) {
    let directory = dirname(resolve(root, module.path.split('?')[0]))
    while (directory !== dirname(directory) && !visited.has(directory)) {
      visited.add(directory)
      let manifest
      try {
        manifest = await json(resolve(directory, 'package.json'))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      if (manifest?.name && manifest.version) {
        found.set(`${manifest.name}@${manifest.version}`, {
          name: manifest.name,
          version: manifest.version,
          license: manifest.license,
          manifest: relative(root, resolve(directory, 'package.json')),
        })
        break
      }
      directory = dirname(directory)
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )
}
if (values.bundles) {
  for (const name of [
    'BENCH_DEVELOPMENT',
    'BENCH_DISTRIBUTION',
    'BENCH_PROFILE',
  ]) {
    assert.ok(
      !process.env[name],
      `${name} must be unset for the source production audit`,
    )
  }
  const { build } = await import('vite')
  for (const fixture of ['read-only', 'editing', 'analytics', 'popup']) {
    let measured
    await build({
      configFile: resolve(
        root,
        `packages/solid-table/bench/${fixture}/vite.config.ts`,
      ),
      logLevel: 'error',
      build: { write: false, sourcemap: false },
      plugins: [
        {
          name: 'owned-vendor-cost-audit',
          generateBundle(_options, bundle) {
            const chunks = Object.values(bundle).filter(
              (item) => item.type === 'chunk',
            )
            const modules = chunks.flatMap((chunk) =>
              Object.entries(chunk.modules).map(([id, entry]) => ({
                path: relative(root, id),
                group: group(id),
                renderedCharacters: entry.renderedLength,
                imports:
                  this.getModuleInfo(id)?.importedIds.map((target) =>
                    relative(root, target),
                  ) ?? [],
              })),
            )
            assert.ok(
              modules.every((entry) =>
                Number.isFinite(entry.renderedCharacters),
              ),
              'bundler exposes per-module rendered lengths',
            )
            const totals = {}
            for (const entry of modules) {
              const total = (totals[entry.group] ??= {
                modules: 0,
                renderedCharacters: 0,
              })
              if (entry.renderedCharacters > 0) total.modules++
              total.renderedCharacters += entry.renderedCharacters
            }
            const assets = Object.values(bundle).filter(
              (item) => item.type === 'asset' && item.fileName.endsWith('.css'),
            )
            const costs = [
              ...chunks.map((chunk) => ({
                file: chunk.fileName,
                bytes: Buffer.byteLength(chunk.code),
                gzipBytes: gzipSync(chunk.code).length,
              })),
              ...assets.map((asset) => ({
                file: asset.fileName,
                bytes: Buffer.byteLength(asset.source),
                gzipBytes: gzipSync(asset.source).length,
              })),
            ]
            measured = {
              fixture,
              mode: 'source-production',
              totals,
              assets: costs,
              modules,
            }
          },
        },
      ],
    })
    assert.ok(measured, `${fixture}: bundle measurement`)
    measured.externalPackages = await externalPackages(measured.modules)
    report.bundles.push(measured)
  }
}
await writeFile(
  resolve(output, 'audit.json'),
  JSON.stringify(report, null, 2) + '\n',
)
console.log(
  `Audited ${report.sources.length} source files, ${Object.keys(report.dependencies).length} declared imports, and ${report.bundles.length} fixture bundles`,
)
for (const [name, comparison] of Object.entries(report.comparisons))
  console.log(
    `${name}: ${comparison.changed.length} changed files, exact patch replay passed`,
  )
