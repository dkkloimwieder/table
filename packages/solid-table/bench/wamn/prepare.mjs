import { createHash } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const here = dirname(fileURLToPath(import.meta.url))
const wamn = resolve(process.env.WAMN_ROOT ?? join(homedir(), 'dev/wamn'))
const scratch = join(tmpdir(), 'table-wamn-codegen')
const output = join(here, '.input')
const execute = promisify(execFile)
await mkdir(scratch, { recursive: true })
await rm(output, { recursive: true, force: true })
const dependencies = {
  'wamn-schema-generator': 'crates/schema/generator',
  'wamn-schema-introspection': 'crates/schema/introspection',
  'wamn-fixture-package': 'test-support/fixture-package',
}
await writeFile(
  join(scratch, 'Cargo.toml'),
  `
[package]
name = "table-wamn-fixture"
version = "0.0.0"
edition = "2024"
[workspace]
[[bin]]
name = "emit"
path = ${JSON.stringify(join(here, 'emit.rs'))}
[dependencies]
anyhow = "1"
serde_json = "1"
${Object.entries(dependencies)
  .map(
    ([name, path]) =>
      `${name} = { path = ${JSON.stringify(join(wamn, path))} }`,
  )
  .join('\n')}
`,
)
await cp(join(wamn, 'Cargo.lock'), join(scratch, 'Cargo.lock'), { force: true })
const toolchain = (
  await readFile(join(wamn, 'rust-toolchain.toml'), 'utf8')
).match(/channel = "([^"]+)"/)[1]
execFileSync(
  'cargo',
  [
    `+${toolchain}`,
    'run',
    '--offline',
    '--manifest-path',
    join(scratch, 'Cargo.toml'),
    '--jobs',
    '2',
    '--bin',
    'emit',
  ],
  {
    cwd: scratch,
    stdio: 'inherit',
    env: {
      ...process.env,
      RUSTC_WRAPPER: '',
      CARGO_TARGET_DIR: join(scratch, 'target'),
      WAMN_FIXTURE_RS: join(
        wamn,
        'crates/schema/generator/tests/support/platform_fixture.rs',
      ),
      WAMN_OUTPUT: output,
    },
  },
)
// Copy the actual framework-free runtime byte for byte. This keeps the browser
// input portable and prevents external Solid 1 dependencies entering its graph.
await cp(join(wamn, 'web/runtime/src'), join(output, 'runtime'), {
  recursive: true,
  force: true,
})
const require = createRequire(import.meta.url)
const zodPath = dirname(
  require.resolve('zod/package.json', { paths: [join(wamn, 'web/runtime')] }),
)
await cp(zodPath, join(output, 'node_modules/zod'), {
  recursive: true,
  force: true,
})
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function hashes(directory, prefix = '') {
  const result = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    const name = prefix + entry.name
    if (entry.isDirectory())
      Object.assign(result, await hashes(path, `${name}/`))
    else if (entry.name !== 'provenance.json')
      result[name] = hash(await readFile(path))
  }
  return result
}
await writeFile(
  join(output, 'provenance.json'),
  JSON.stringify(
    {
      repository: wamn,
      revision: (
        await execute('git', ['rev-parse', 'HEAD'], { cwd: wamn })
      ).stdout.trim(),
      sourceDiffSha256: hash(
        (
          await execute(
            'git',
            [
              'diff',
              'HEAD',
              '--',
              'crates/schema',
              'test-support/fixture-package',
              'apps/platform_fixture',
              'web/runtime',
            ],
            { cwd: wamn },
          )
        ).stdout,
      ),
      rustToolchain: toolchain,
      zod: JSON.parse(await readFile(join(zodPath, 'package.json'), 'utf8'))
        .version,
      files: await hashes(output),
    },
    null,
    2,
  ) + '\n',
)
console.log(`WAMN browser inputs: ${output}`)
