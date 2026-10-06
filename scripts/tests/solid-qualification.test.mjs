import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  qualificationStages,
  selectsSolidQualification,
} from '../run-solid-qualification.mjs'

test('qualification selects shared toolchain and package changes', () => {
  for (const path of [
    'packages/solid-table/src/native.ts',
    'packages/table-core/src/index.ts',
    'examples/solid/virtualized-rows/src/nativeEvents.ts',
    'scripts/rewrite-table-core-dts.mjs',
    'pnpm-lock.yaml',
    '.github/workflows/pr.yml',
  ]) {
    assert.equal(selectsSolidQualification([path]), true, path)
  }
  assert.equal(
    selectsSolidQualification([
      'docs/guide/intro.md',
      'packages/vue-table/src/index.ts',
    ]),
    false,
  )
})

test('qualification covers both browser inputs and keeps heap work separate', () => {
  const stages = qualificationStages('/tmp/solid-gates')
  for (const fixture of ['editing', 'popup']) {
    for (const mode of ['source', 'distribution']) {
      const browser = stages.find(
        ({ name }) => name === `${fixture}-${mode}-browser`,
      )
      assert.equal(
        browser.env.BENCH_DISTRIBUTION,
        mode === 'distribution' ? '1' : '',
      )
      assert.equal(
        browser.env.BENCH_OUTPUT,
        `/tmp/solid-gates/${fixture}-${mode}.json`,
      )
      assert.ok(
        stages.findIndex(({ name }) => name === `${fixture}-${mode}-build`) <
          stages.indexOf(browser),
      )
    }
  }
  assert.ok(stages.some(({ name }) => name === 'hydration'))
  assert.ok(stages.every(({ env }) => !env.BENCH_HEAPS && !env.BENCH_WORKLOAD))
})

test('failed stages retain logs and ignore inherited review and profiling controls', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'table-qualification-test-'))
  try {
    const bin = join(scratch, 'bin')
    const output = join(scratch, 'reports')
    await mkdir(bin)
    await writeFile(
      join(bin, 'pnpm'),
      `#!${process.execPath}
require('node:fs').writeSync(1, JSON.stringify({args: process.argv.slice(2), env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('BENCH_')))}) + '\\n')
process.exitCode = process.argv.includes('test:ssr') ? 7 : 0
`,
      { mode: 0o755 },
    )
    const result = spawnSync(
      process.execPath,
      ['scripts/run-solid-qualification.mjs'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          SOLID_QUALIFICATION_OUTPUT: output,
          BENCH_URL: 'http://existing-review-server.invalid',
          BENCH_SCENARIOS: '0',
          BENCH_CASE_PATTERN: 'one-case-only',
          BENCH_HEAPS: '/tmp/unwanted-heaps',
          BENCH_WORKLOAD: '1',
        },
      },
    )
    assert.equal(result.status, 1, result.stderr)
    const report = JSON.parse(
      await readFile(join(output, 'summary.json'), 'utf8'),
    )
    assert.equal(report.stages.at(-1).name, 'server-rendering')
    assert.equal(report.stages.at(-1).status, 7)
    const stage = JSON.parse(
      await readFile(join(output, 'server-rendering.log'), 'utf8'),
    )
    assert.equal(stage.env.BENCH_URL, undefined)
    assert.equal(stage.env.BENCH_CASE_PATTERN, undefined)
    assert.equal(stage.env.BENCH_HEAPS, undefined)
    assert.equal(stage.env.BENCH_SCENARIOS, '1')
    assert.equal(stage.env.BENCH_WORKLOAD, '0')
    assert.equal(stage.env.BENCH_WORKLOADS, '0')
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
