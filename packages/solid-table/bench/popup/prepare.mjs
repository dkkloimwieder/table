import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const input = join(root, '.input')
const dependencies =
  process.env.KOBALTE_DEPS ?? join(tmpdir(), 'table-kobalte-popup-deps')
const revision = 'e9d426d438b7c9ea0cc81bd1133831a20cd5fcae'
const archiveSha =
  'c07f47331a9aee20f69e2e55d81454f0b48976e2e6e98551da2b27a9169c6f70'
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
await mkdir(input, { recursive: true })
await mkdir(dependencies, { recursive: true })
const lock = await readFile(join(root, 'dependencies-lock.json'))
const previous = await readFile(join(dependencies, 'package-lock.json')).catch(
  () => Buffer.alloc(0),
)
await writeFile(
  join(dependencies, 'package.json'),
  await readFile(join(root, 'dependencies.json')),
)
await writeFile(join(dependencies, 'package-lock.json'), lock)
if (
  digest(previous) !== digest(lock) ||
  !(await readFile(
    join(dependencies, 'node_modules/@kobalte/core/package.json'),
  ).catch(() => undefined))
) {
  execFileSync(
    'npm',
    [
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--cache',
      join(tmpdir(), 'table-kobalte-popup-npm-cache'),
    ],
    { cwd: dependencies, stdio: 'inherit' },
  )
}
const cached = join(tmpdir(), 'table-kobalte-popup-source.tgz')
let archive = await readFile(cached).catch(() => undefined)
if (!archive) {
  const response = await fetch(
    `https://codeload.github.com/kobaltedev/kobalte/tar.gz/${revision}`,
  )
  assert.ok(response.ok, `Kobalte download failed: ${response.status}`)
  archive = Buffer.from(await response.arrayBuffer())
}
assert.equal(digest(archive), archiveSha, 'Kobalte source archive hash changed')
await writeFile(cached, archive)
const source = join(input, 'kobalte')
await rm(source, { recursive: true, force: true })
await mkdir(source, { recursive: true })
execFileSync('tar', [
  '-xzf',
  cached,
  '--strip-components=1',
  '--exclude=*.test.*',
  '--exclude=*.stories.*',
  '-C',
  source,
  `kobalte-${revision}/packages/core/src`,
  `kobalte-${revision}/packages/utils/src`,
  `kobalte-${revision}/LICENSE.md`,
  `kobalte-${revision}/packages/core/LICENSE.md`,
  `kobalte-${revision}/packages/utils/LICENSE.md`,
])
await rm(join(input, 'node_modules'), { force: true })
await symlink(
  join(dependencies, 'node_modules'),
  join(input, 'node_modules'),
  'dir',
)
await writeFile(
  join(input, 'provenance.json'),
  JSON.stringify(
    { revision, archiveSha, lockSha: digest(lock), solid: '2.0.0-rc.13' },
    null,
    2,
  ) + '\n',
)
console.log(`Prepared Kobalte ${revision} with Solid rc.13 under ${input}`)
