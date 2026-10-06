import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('.input/', import.meta.url))
const provenance = JSON.parse(
  await readFile(resolve(directory, 'provenance.json'), 'utf8'),
)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
for (const name of [
  'widget.ts',
  'widget_maker.ts',
  'definition.json',
  'runtime/transport.ts',
])
  assert.ok(provenance.files[name], `Missing generated input hash: ${name}`)
for (const [name, expected] of Object.entries(provenance.files)) {
  const path = resolve(directory, name)
  const scoped = relative(directory, path)
  assert.ok(
    !isAbsolute(scoped) && scoped !== '..' && !scoped.startsWith(`..${sep}`),
    `Generated input escapes its directory: ${name}`,
  )
  assert.equal(
    hash(await readFile(path)),
    expected,
    `Input hash mismatch: ${name}`,
  )
}
const zod = JSON.parse(
  await readFile(resolve(directory, 'node_modules/zod/package.json'), 'utf8'),
)
assert.equal(
  zod.version,
  provenance.zod,
  'Generated input Zod version mismatch',
)
if (process.argv.includes('--current-source')) {
  const cwd = process.env.WAMN_ROOT ?? provenance.repository
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(
    git(['rev-parse', 'HEAD']).trim(),
    provenance.revision,
    'Prepared inputs differ from the current WAMN revision',
  )
  assert.equal(
    hash(
      git([
        'diff',
        'HEAD',
        '--',
        'crates/schema',
        'test-support/fixture-package',
        'apps/platform_fixture',
        'web/runtime',
      ]),
    ),
    provenance.sourceDiffSha256,
    'Prepared inputs differ from current WAMN source changes',
  )
}
console.log(
  JSON.stringify({
    revision: provenance.revision,
    sourceDiffSha256: provenance.sourceDiffSha256,
    rustToolchain: provenance.rustToolchain,
    zod: provenance.zod,
    files: Object.keys(provenance.files).length,
  }),
)
