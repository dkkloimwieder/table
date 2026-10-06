import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

export function selectsSolidQualification(paths) {
  return paths.some((path) =>
    /^(packages\/(solid-table|table-core)\/|examples\/solid\/|scripts\/(run-solid-qualification|rewrite-table-core-dts)\.mjs$|scripts\/tests\/solid-qualification\.test\.mjs$|\.github\/workflows\/pr\.yml$|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|nx\.json$|tsconfig\.json$|eslint\.config\.js$)/.test(
      path,
    ),
  )
}

export function qualificationStages(output, { wamn = false } = {}) {
  const pkg = ['--filter', '@tanstack/solid-table']
  const stage = (name, args, env = {}) => ({ name, args, env })
  const stages = [
    stage('core-build', ['--filter', '@tanstack/table-core', 'run', 'build']),
    stage('solid-build', [...pkg, 'run', 'build']),
    stage('popup-prepare', [...pkg, 'exec', 'node', 'bench/popup/prepare.mjs']),
    stage('fixture-types', [...pkg, 'run', 'test:fixtures:types']),
    stage('fixture-lint', [...pkg, 'run', 'test:fixtures:eslint']),
    stage('server-rendering', [...pkg, 'run', 'test:ssr']),
    stage('hydration', [...pkg, 'exec', 'node', 'bench/hydration/run.mjs'], {
      BENCH_OUTPUT: resolve(output, 'hydration.json'),
    }),
  ]
  for (const mode of ['source', 'distribution']) {
    const env = { BENCH_DISTRIBUTION: mode === 'distribution' ? '1' : '' }
    for (const fixture of ['editing', 'popup']) {
      stages.push(
        stage(
          `${fixture}-${mode}-build`,
          [
            ...pkg,
            'exec',
            'vite',
            'build',
            '--config',
            `bench/${fixture}/vite.config.ts`,
          ],
          env,
        ),
      )
      stages.push(
        stage(
          `${fixture}-${mode}-browser`,
          [...pkg, 'exec', 'node', `bench/${fixture}/run.mjs`],
          {
            ...env,
            BENCH_OUTPUT: resolve(output, `${fixture}-${mode}.json`),
          },
        ),
      )
    }
  }
  if (wamn) {
    stages.push(
      stage('wamn-inputs', [
        ...pkg,
        'exec',
        'node',
        'bench/wamn/check-inputs.mjs',
      ]),
      stage('wamn-types', [
        ...pkg,
        'exec',
        'tsc',
        '--project',
        'bench/wamn/tsconfig.json',
      ]),
      stage('wamn-lint', [
        ...pkg,
        'exec',
        'eslint',
        ...[
          'App.tsx',
          'createWamnTable.ts',
          'transport.ts',
          'main.tsx',
          'vite.config.ts',
        ].map((file) => `bench/wamn/${file}`),
      ]),
    )
    for (const mode of ['source', 'distribution', 'development']) {
      const env = {
        NODE_ENV: mode === 'development' ? 'development' : 'production',
        BENCH_DISTRIBUTION: mode === 'distribution' ? '1' : '',
        BENCH_DEVELOPMENT: mode === 'development' ? '1' : '',
      }
      stages.push(
        stage(
          `wamn-${mode}-build`,
          [
            ...pkg,
            'exec',
            'vite',
            'build',
            '--config',
            'bench/wamn/vite.config.ts',
          ],
          env,
        ),
        stage(
          `wamn-${mode}-browser`,
          [...pkg, 'exec', 'node', 'bench/wamn/run.mjs'],
          {
            ...env,
            BENCH_OUTPUT: resolve(output, `wamn-${mode}.json`),
          },
        ),
      )
    }
  }
  return stages
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--affected')) {
    const base = process.env.NX_BASE
    if (!base) throw new Error('--affected requires NX_BASE')
    const paths = execFileSync(
      'git',
      ['diff', '--name-only', '-z', `${base}...HEAD`],
      { cwd: root, encoding: 'utf8' },
    ).split('\0')
    const selected = selectsSolidQualification(paths)
    if (args.includes('--select')) {
      if (process.env.GITHUB_OUTPUT)
        await appendFile(process.env.GITHUB_OUTPUT, `selected=${selected}\n`)
      console.log(`Solid qualification selected: ${selected}`)
      return
    }
    if (!selected) return
  }
  const output = resolve(
    root,
    process.env.SOLID_QUALIFICATION_OUTPUT ??
      'test-results/solid-qualification',
  )
  const stages = qualificationStages(output, { wamn: args.includes('--wamn') })
  if (args.includes('--plan')) {
    console.log(JSON.stringify(stages, null, 2))
    return
  }
  await mkdir(output, { recursive: true })
  const report = { stages: [] }
  // Never inherit scenario selectors, external review URLs, or profiling flags.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('BENCH_')),
  )
  if (process.env.BENCH_EXECUTABLE_PATH)
    env.BENCH_EXECUTABLE_PATH = process.env.BENCH_EXECUTABLE_PATH
  Object.assign(env, {
    BENCH_WORKLOADS: '0',
    BENCH_WORKLOAD: '0',
    BENCH_SCENARIOS: '1',
  })
  for (const stage of stages) {
    console.log(`Solid qualification: ${stage.name}`)
    const log = createWriteStream(resolve(output, `${stage.name}.log`))
    const result = await new Promise((done) => {
      const child = spawn('pnpm', stage.args, {
        cwd: root,
        env: { ...env, ...stage.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      child.stdout.on('data', (bytes) => {
        process.stdout.write(bytes)
        log.write(bytes)
      })
      child.stderr.on('data', (bytes) => {
        process.stderr.write(bytes)
        log.write(bytes)
      })
      child.on('error', (error) => {
        log.write(`${error.stack}\n`)
        done({ status: 1, error: error.message })
      })
      child.on('close', (status, signal) => done({ status, signal }))
    })
    await new Promise((done) => log.end(done))
    report.stages.push({ ...stage, ...result })
    await writeFile(
      resolve(output, 'summary.json'),
      JSON.stringify(report, null, 2) + '\n',
    )
    if (result.status !== 0) {
      process.exitCode = 1
      break
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main()
}
