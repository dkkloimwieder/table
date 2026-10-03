import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { cpus, loadavg, platform, release, totalmem } from 'node:os'
import { dirname } from 'node:path'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const repeats = Number(process.env.BENCH_REPEATS ?? 5)
const warmups = Number(process.env.BENCH_WARMUPS ?? 2)
const sizes = (process.env.BENCH_SIZES ?? '1000,10000,50000')
  .split(',')
  .map(Number)
const modes = (
  process.env.BENCH_MODES ?? 'array,deep,store,keyed,native'
).split(',')
const output =
  process.env.BENCH_OUTPUT ??
  fileURLToPath(new URL('../.bench-results/latest.json', import.meta.url))
const assets = fileURLToPath(
  new URL(
    process.env.BENCH_DISTRIBUTION
      ? '../.bench-package-dist/'
      : '../.bench-dist/',
    import.meta.url,
  ),
)
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path.includes('..')) throw new Error('Invalid path')
    const file = path === '/' ? '/index.html' : path
    response.setHeader(
      'Content-Type',
      file.endsWith('.js') ? 'text/javascript' : 'text/html',
    )
    response.end(await readFile(assets + file))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
const actions = [
  'append',
  'edit',
  'unrelated',
  'replace',
  'filter',
  'sort',
  'activeEdit',
  'refresh',
]
const samples = []
const metrics = async (client) =>
  Object.fromEntries(
    (await client.send('Performance.getMetrics')).metrics.map(
      ({ name, value }) => [name, value],
    ),
  )
const delta = (after, before) =>
  Object.fromEntries(
    [
      'ScriptDuration',
      'LayoutDuration',
      'RecalcStyleDuration',
      'TaskDuration',
    ].map((key) => [key, (after[key] - before[key]) * 1000]),
  )
function countDelta(after, before) {
  return {
    ...Object.fromEntries(
      [
        'rows',
        'cells',
        'mounts',
        'unmounts',
        'comparators',
        'filters',
        'idReads',
      ].map((key) => [key, after[key] - before[key]]),
    ),
    accessors: Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(before.accessors),
          ...Object.keys(after.accessors),
        ]),
      ].map((key) => [
        key,
        (after.accessors[key] ?? 0) - (before.accessors[key] ?? 0),
      ]),
    ),
  }
}
function quantile(values, q) {
  const sorted = values.toSorted((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]
}
try {
  browser = await chromium.launch()
  for (const size of sizes) {
    for (let repeat = -warmups; repeat < repeats; repeat++) {
      // Alternate order to reduce systematic first-run and temperature bias.
      const offset = (repeat + warmups) % modes.length
      const order = [...modes.slice(offset), ...modes.slice(0, offset)]
      for (const mode of order) {
        const loadBefore = loadavg()
        const page = await browser.newPage({
          viewport: { width: 1200, height: 800 },
        })
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        const client = await page.context().newCDPSession(page)
        await client.send('Performance.enable')
        await page.goto(`http://127.0.0.1:${server.address().port}`)
        await (await page.waitForFunction(() => window.benchmark)).dispose()
        await client.send('HeapProfiler.collectGarbage')
        const empty = await metrics(client)
        const initial = await page.evaluate(
          ({ mode, size }) => window.benchmark.start(mode, size),
          { mode, size },
        )
        if (mode === 'native') {
          assert.equal(initial.counts.rows, Math.min(size, 40))
          assert.equal(initial.counts.cells, Math.min(size, 40) * 8)
        }
        await page.evaluate(() => window.benchmark.inspect())
        const steps = {}
        for (const action of actions) {
          const before = await metrics(client)
          const result = await page.evaluate(
            (action) => window.benchmark.action(action),
            action,
          )
          const after = await metrics(client)
          steps[action] = {
            duration: result.duration,
            frameLatency: result.frameLatency,
            frameGap: result.frameGap,
            counts: countDelta(result.after, result.before),
            browser: delta(after, before),
          }
          if (mode === 'store' || mode === 'keyed') {
            const counts = steps[action].counts
            assert.equal(
              counts.rows,
              action === 'append' ? 100 : 0,
              `${mode}/${action}: row construction`,
            )
            if (['append', 'edit', 'unrelated', 'replace'].includes(action)) {
              assert.equal(
                counts.cells,
                0,
                `${mode}/${action}: cell construction`,
              )
              assert.equal(counts.mounts, 0, `${mode}/${action}: DOM mounts`)
              assert.equal(
                counts.unmounts,
                0,
                `${mode}/${action}: DOM unmounts`,
              )
            }
            if (action === 'edit' || action === 'unrelated') {
              assert.equal(
                Object.values(counts.accessors).reduce((a, b) => a + b, 0),
                action === 'edit' ? 1 : 0,
              )
              assert.equal(counts.filters, 0)
              assert.equal(counts.comparators, 0)
              assert.equal(counts.idReads, action === 'edit' ? 1 : 0)
            }
            if (mode === 'keyed' && action === 'replace')
              assert.equal(counts.idReads, 8)
          }
          if (
            mode === 'native' &&
            ['append', 'edit', 'unrelated', 'replace'].includes(action)
          ) {
            const counts = steps[action].counts
            for (const key of [
              'rows',
              'cells',
              'mounts',
              'unmounts',
              'idReads',
              'filters',
              'comparators',
            ])
              assert.equal(counts[key], 0, `${mode}/${action}: ${key}`)
            const accesses = Object.values(counts.accessors).reduce(
              (a, b) => a + b,
              0,
            )
            assert.equal(
              accesses,
              action === 'edit' ? 1 : action === 'replace' ? 8 : 0,
              `${mode}/${action}: accessors`,
            )
          }
          await page.evaluate(() => window.benchmark.inspect())
        }
        const scrollBefore = await metrics(client)
        const scroll = await page.evaluate(() => window.benchmark.scroll())
        const scrollAfter = await metrics(client)
        await page.evaluate(() => window.benchmark.inspect())
        await client.send('HeapProfiler.collectGarbage')
        const populated = await metrics(client)
        await page.evaluate(() => window.benchmark.dispose())
        await client.send('HeapProfiler.collectGarbage')
        const immediateCleanup = await metrics(client)
        await page.evaluate(() => window.benchmark.settle())
        await client.send('HeapProfiler.collectGarbage')
        const cleaned = await metrics(client)
        if (mode === 'native') {
          assert.ok(
            cleaned.JSHeapUsedSize - empty.JSHeapUsedSize <
              Math.max(
                5 * 2 ** 20,
                (populated.JSHeapUsedSize - empty.JSHeapUsedSize) * 0.05,
              ),
            `${mode}/${size}: retained heap after disposal`,
          )
        }
        assert.deepEqual(errors, [], `${mode}/${size} browser errors`)
        const sample = {
          mode,
          size,
          repeat,
          loadBefore,
          loadAfter: loadavg(),
          initial,
          steps,
          scroll: {
            intervals: scroll.intervals,
            counts: countDelta(scroll.after, scroll.before),
            browser: delta(scrollAfter, scrollBefore),
          },
          heap: {
            empty: empty.JSHeapUsedSize,
            populated: populated.JSHeapUsedSize,
            immediateCleanup: immediateCleanup.JSHeapUsedSize,
            cleaned: cleaned.JSHeapUsedSize,
            retained: cleaned.JSHeapUsedSize - empty.JSHeapUsedSize,
          },
          nodesAfterCleanup: cleaned.Nodes,
        }
        if (repeat >= 0) samples.push(sample)
        await page.close()
        console.log(
          `${mode} ${size} ${repeat < 0 ? 'warmup' : 'sample'} ${repeat + 1}: edit ${steps.edit.duration.toFixed(2)} ms, ${steps.edit.counts.rows} rows`,
        )
      }
    }
  }
  const summary = []
  for (const size of sizes)
    for (const mode of modes)
      for (const action of actions) {
        const group = samples.filter(
          (sample) => sample.size === size && sample.mode === mode,
        )
        summary.push({
          size,
          mode,
          action,
          p50: quantile(
            group.map((sample) => sample.steps[action].duration),
            0.5,
          ),
          p95: quantile(
            group.map((sample) => sample.steps[action].duration),
            0.95,
          ),
          min: Math.min(
            ...group.map((sample) => sample.steps[action].duration),
          ),
          max: Math.max(
            ...group.map((sample) => sample.steps[action].duration),
          ),
          counts: group[0].steps[action].counts,
        })
      }
  const sourceHashes = {}
  for (const file of [
    'main.tsx',
    'store-row-model.ts',
    'native-table.ts',
    '../src/native-table.ts',
    '../src/native-state.ts',
    '../src/native-types.ts',
    '../src/native-filtering.ts',
    '../src/native.ts',
    'run.mjs',
    'vite.config.ts',
    '../src/createTable.ts',
    '../src/reactivity.ts',
    '../package.json',
  ]) {
    sourceHashes[file] = createHash('sha256')
      .update(await readFile(new URL(file, import.meta.url)))
      .digest('hex')
  }
  const result = {
    timestamp: new Date().toISOString(),
    browser: browser.version(),
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      memory: totalmem(),
      node: process.version,
    },
    parameters: {
      repeats,
      warmups,
      sizes,
      modes,
      seed: 1729,
      columns: 8,
      mountedRows: 40,
      rowHeight: 28,
      scrollFrames: 60,
      production: true,
      nativeEntry: process.env.BENCH_DISTRIBUTION
        ? 'dist/solid/native.js'
        : 'src/native-table.ts',
      contention: 'User reports other development loads. Timings are advisory.',
    },
    versions: {
      solid: JSON.parse(
        await readFile(
          new URL('../node_modules/solid-js/package.json', import.meta.url),
        ),
      ).version,
    },
    sourceHashes,
    assets: await readdir(assets + '/assets'),
    assetHashes: Object.fromEntries(
      await Promise.all(
        (await readdir(assets + '/assets')).map(async (file) => [
          file,
          createHash('sha256')
            .update(await readFile(assets + '/assets/' + file))
            .digest('hex'),
        ]),
      ),
    ),
    samples,
    summary,
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2) + '\n')
  console.log(`Saved ${samples.length} measured samples to ${output}`)
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
