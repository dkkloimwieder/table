import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { cpus, freemem, loadavg, totalmem } from 'node:os'
import { resolve, sep } from 'node:path'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from '@playwright/test'

const directory = process.env.BENCH_DISTRIBUTION ? '.dist-package' : '.dist'
const assets = fileURLToPath(new URL(`${directory}/`, import.meta.url))
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-editing-overhead.json'
const heaps = process.env.BENCH_HEAPS
const sizes = (process.env.BENCH_SIZES ?? '25,250,999,10000,50000')
  .split(',')
  .map(Number)
const repeats = Number(process.env.BENCH_REPEATS ?? 3)
const warmups = Number(process.env.BENCH_WARMUPS ?? 1)
assert.ok(repeats > 0 && Number.isInteger(repeats))
assert.ok(warmups >= 0 && Number.isInteger(warmups))
assert.ok(sizes.every((size) => Number.isInteger(size) && size >= 10))
const host = () => ({
  time: new Date().toISOString(),
  load: loadavg(),
  freeBytes: freemem(),
  cpus: cpus().map(({ times }) => times),
})
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const files = await readdir(assets, { recursive: true })
const hashes = Object.fromEntries(
  await Promise.all(
    files
      .filter((file) => /\.(js|css|html|json)$/.test(file))
      .map(async (file) => [file, hash(await readFile(assets + file))]),
  ),
)
const modules = JSON.parse(await readFile(assets + 'modules.json', 'utf8'))
assert.ok(
  !modules.some((path) =>
    /table-core|@tanstack\/store|virtual-core|solid-form|kobalte/.test(path),
  ),
)
assert.ok(modules.some((path) => /editing\/createEditing\.ts$/.test(path)))
assert.ok(modules.some((path) => /editing\/Table\.tsx$/.test(path)))
assert.ok(
  modules.some((path) =>
    directory === '.dist'
      ? /src\/native-table\.ts$/.test(path)
      : /dist\/solid\/native-table\.js$/.test(path),
  ),
)
const report = {
  directory,
  hashes,
  modules,
  repeats,
  warmups,
  hostStart: host(),
  cpuCount: cpus().length,
  totalBytes: totalmem(),
  samples: [],
  failures: [],
}
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname
    if (pathname === '/favicon.ico') return void response.writeHead(204).end()
    const filename = resolve(
      assets,
      pathname === '/' ? 'index.html' : '.' + pathname,
    )
    if (!filename.startsWith(resolve(assets) + sep))
      return void response.writeHead(403).end()
    response.setHeader(
      'Content-Type',
      filename.endsWith('.js')
        ? 'text/javascript'
        : filename.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    )
    response.end(await readFile(filename))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
let browser
try {
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  report.browser = browser.version()
  const contracts = new Map()
  for (const size of sizes) {
    // The supported non-virtualized editing workload is below 1,000 rows.
    // Large datasets isolate model scaling without introducing another renderer.
    const modes =
      size <= 999
        ? ['store', 'controller', 'model', 'read-only', 'editable']
        : ['store', 'controller', 'model']
    for (let repeat = -warmups; repeat < repeats; repeat++) {
      const offset = (repeat + warmups) % modes.length
      for (const mode of [...modes.slice(offset), ...modes.slice(0, offset)]) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        })
        page.setDefaultTimeout(120000)
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (['warning', 'error'].includes(message.type()))
            errors.push(message.text())
        })
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Performance.enable')
        const call = (name, ...args) =>
          page.evaluate(
            ({ name, args }) => window.editingOverhead[name](...args),
            { name, args },
          )
        const settle = () =>
          page.evaluate(
            () =>
              new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done)),
              ),
          )
        const metrics = async () => {
          await settle()
          await cdp.send('HeapProfiler.collectGarbage')
          const { metrics } = await cdp.send('Performance.getMetrics')
          return Object.fromEntries(
            metrics
              .filter(({ name }) =>
                [
                  'JSHeapUsedSize',
                  'JSHeapTotalSize',
                  'Nodes',
                  'Documents',
                  'JSEventListeners',
                  'LayoutDuration',
                  'ScriptDuration',
                  'TaskDuration',
                ].includes(name),
              )
              .map(({ name, value }) => [name, value]),
          )
        }
        const snapshot = async (stage) => {
          if (!heaps || repeat !== 0 || ![999, 50000].includes(size))
            return undefined
          await mkdir(heaps, { recursive: true })
          const filename = `${heaps}/${size}-${mode}-${stage}.heapsnapshot`
          const stream = createWriteStream(filename)
          const write = ({ chunk }) => stream.write(chunk)
          cdp.on('HeapProfiler.addHeapSnapshotChunk', write)
          try {
            await cdp.send('HeapProfiler.takeHeapSnapshot', {
              reportProgress: false,
            })
          } finally {
            cdp.off('HeapProfiler.addHeapSnapshotChunk', write)
            stream.end()
            await finished(stream)
          }
          await promisify(execFile)(
            process.execPath,
            [
              fileURLToPath(new URL('../inspect-heap.mjs', import.meta.url)),
              filename,
            ],
            { maxBuffer: 1024 * 1024 },
          )
          const summary = JSON.parse(
            await readFile(filename + '.summary.json', 'utf8'),
          )
          const categories = Object.fromEntries(
            summary.categories.map(({ key, count, shallowBytes }) => [
              key,
              { count, shallowBytes },
            ]),
          )
          if (stage === 'disposed')
            for (const category of [
              'Data records',
              'Native row views',
              'Table cells',
              'Solid store targets',
              'Solid computations and effects',
              'Solid owner scopes',
              'Solid store property signals',
              'Solid dependency links',
              'Solid plain signals',
            ])
              assert.equal(
                categories[category]?.count ?? 0,
                0,
                `${size}/${mode}: retained ${category}`,
              )
          else {
            // Rendered source-slot signals retain one prior backing of R0001.
            // Exact counts across twelve updates and twenty cycles bound it.
            assert.equal(
              categories['Data records']?.count,
              size +
                (stage !== 'mounted' && ['read-only', 'editable'].includes(mode)
                  ? 1
                  : 0),
              `${size}/${mode}/${stage}: unexpected record version count`,
            )
            assert.equal(
              categories['Native row views']?.count ?? 0,
              mode === 'read-only' || mode === 'editable' ? size : 0,
            )
            assert.equal(
              categories['Table cells']?.count ?? 0,
              mode === 'read-only' || mode === 'editable' ? 6 * size : 0,
            )
          }
          return {
            filename,
            sha256: hash(await readFile(filename)),
            snapshotShallowBytes: summary.snapshotShallowBytes,
            categories,
          }
        }
        await page.goto(`http://127.0.0.1:${server.address().port}/`)
        await (
          await page.waitForFunction(() => window.editingOverhead)
        ).dispose()
        const before = host()
        const baseline = await metrics()
        const stages = []
        const capture = async (name, result, takeHeap = false) => {
          const measured = await metrics()
          stages.push({
            name,
            result,
            metrics: measured,
            heapUsedDelta: measured.JSHeapUsedSize - baseline.JSHeapUsedSize,
            host: host(),
            heap: takeHeap ? await snapshot(name) : undefined,
          })
          assert.equal(result.identity, true)
          assert.equal(result.rowIds, size)
        }
        const mounted = await call('start', mode, size)
        assert.equal(mounted.drafts, 0)
        assert.equal(
          mounted.renderedRows,
          ['read-only', 'editable'].includes(mode) ? size : 0,
        )
        if (mode === 'read-only' || mode === 'editable') {
          assert.equal(mounted.counts.views, size)
          assert.equal(mounted.counts.cells, 6 * size)
          assert.equal(mounted.counts.unmounted, 0)
          assert.equal(mounted.editButtons, mode === 'editable' ? 3 * size : 0)
          assert.deepEqual(mounted.values, [
            'R0001',
            'Record 0001',
            'Note 1',
            'normal',
            '10',
            '2026-10-01',
          ])
        }
        await capture('mounted', mounted, true)
        const updated = await call('update')
        assert.equal(updated.first.name, 'Updated 11')
        assert.equal(updated.first.revision, '9007199254741005')
        assert.equal(updated.drafts, 0)
        if (mode === 'read-only' || mode === 'editable') {
          assert.equal(updated.counts.views, size)
          assert.equal(updated.counts.cells, 6 * size)
          assert.equal(updated.values[1], 'Updated 11')
        }
        await capture('updated', updated, true)
        if (mode === 'controller' || mode === 'model' || mode === 'editable') {
          for (const count of [1, 10]) {
            const drafted = await call('drafts', count)
            assert.equal(drafted.drafts, count)
            assert.equal(drafted.active, true)
            assert.equal(drafted.first.name, 'Updated 11')
            assert.equal(drafted.editors, mode === 'editable' ? 3 * count : 0)
            await capture(`drafts-${count}`, drafted, count === 10)
          }
          const canceled = await call('cancel')
          assert.equal(canceled.drafts, 0)
          assert.equal(canceled.active, false)
          await capture('canceled', canceled)
          const cycled = await call('cycles')
          assert.equal(cycled.drafts, 0)
          assert.equal(cycled.editors, 0)
          assert.equal(cycled.first.name, 'Updated 11')
          await capture('cycled', cycled, true)
          const saved = await call('save')
          assert.equal(saved.saved, true)
          assert.equal(saved.drafts, 0)
          assert.equal(saved.first.name, 'Saved name')
          assert.equal(saved.first.revision, '9007199254741006')
          await capture('saved', saved)
        }
        const stopped = await call('stop')
        assert.deepEqual(stopped, { cleaned: true, children: 0 })
        const disposed = {
          metrics: await metrics(),
          heap: await snapshot('disposed'),
        }
        assert.deepEqual(errors, [])
        const contract = stages.map(
          ({ name, result: { elapsedMs, ...result } }) => ({ name, result }),
        )
        const key = `${size}/${mode}`
        if (contracts.has(key))
          assert.deepEqual(
            contract,
            contracts.get(key),
            `${key}: work counts differ across repeats`,
          )
        else contracts.set(key, contract)
        if (repeat >= 0)
          report.samples.push({
            size,
            mode,
            repeat,
            before,
            after: host(),
            baseline,
            stages,
            disposed,
          })
        console.log(
          `${size}/${mode}/${repeat < 0 ? 'warmup' : repeat + 1}: ${stages.length} states passed`,
        )
        await page.close()
      }
    }
  }
} catch (error) {
  report.failures.push(error.stack)
  process.exitCode = 1
} finally {
  report.hostEnd = host()
  await mkdir(resolve(output, '..'), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  await browser?.close()
  server.close()
}
if (report.failures.length) console.error(report.failures.join('\n'))
else
  console.log(
    `Passed ${report.samples.length} measured samples. Report: ${output}`,
  )
