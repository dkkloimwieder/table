import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { loadavg } from 'node:os'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const distribution = Boolean(process.env.BENCH_DISTRIBUTION)
const assets = fileURLToPath(
  new URL(
    process.env.BENCH_PROFILE
      ? '../.heap-dist/'
      : distribution
        ? '../.bench-package-dist/'
        : '../.bench-dist/',
    import.meta.url,
  ),
)
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-native-grouping.json'
const sizes = (process.env.BENCH_SIZES ?? '1000,10000,50000')
  .split(',')
  .map(Number)
const repeats = Number(process.env.BENCH_REPEATS ?? 3)
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/favicon.ico') {
      response.writeHead(204).end()
      return
    }
    response.setHeader(
      'Content-Type',
      path.endsWith('.js') ? 'text/javascript' : 'text/html',
    )
    response.end(await readFile(assets + path))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch()
  const samples = []
  for (const size of sizes)
    for (let repeat = 0; repeat < repeats; repeat++) {
      const page = await browser.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type()))
          errors.push(message.text())
      })
      const client = await page.context().newCDPSession(page)
      await client.send('Performance.enable')
      async function measureHeap() {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        )
        await client.send('HeapProfiler.collectGarbage')
        return Object.fromEntries(
          (await client.send('Performance.getMetrics')).metrics.map(
            ({ name, value }) => [name, value],
          ),
        )
      }
      async function snapshot(stage) {
        if (
          !process.env.BENCH_HEAPS ||
          size !== Math.max(...sizes) ||
          repeat !== 0
        )
          return
        await mkdir(process.env.BENCH_HEAPS, { recursive: true })
        const stream = createWriteStream(
          `${process.env.BENCH_HEAPS}/${stage}.heapsnapshot`,
        )
        const write = ({ chunk }) => stream.write(chunk)
        client.on('HeapProfiler.addHeapSnapshotChunk', write)
        await client.send('HeapProfiler.takeHeapSnapshot', {
          reportProgress: false,
        })
        client.off('HeapProfiler.addHeapSnapshotChunk', write)
        stream.end()
        await finished(stream)
      }
      await page.goto(`http://127.0.0.1:${server.address().port}/grouping.html`)
      await (await page.waitForFunction(() => window.nativeGrouping)).dispose()
      const empty = await measureHeap()
      const initial = await page.evaluate(
        (size) => window.nativeGrouping.start(size),
        size,
      )
      assert.equal(initial.rows, 40)
      assert.equal(initial.cells, 160)
      assert.equal(initial.groupReads, 0)
      const loadBefore = loadavg()
      const result = await page.evaluate(() => window.nativeGrouping.run())
      for (const name of ['unrelated']) {
        const step = result.steps.find((step) => step.name === name)
        for (const value of Object.values(step.counts))
          assert.equal(value, 0, `${name}: unexpected feature or display work`)
      }
      assert.equal(
        result.steps.find((step) => step.name === 'amountEdit').counts
          .groupReads,
        0,
      )
      await page.evaluate(() => window.nativeGrouping.shape('nested'))
      const nestedGroups = await measureHeap()
      await snapshot('nested-groups')
      await page.evaluate(() => window.nativeGrouping.shape('unique'))
      const uniqueGroups = await measureHeap()
      await snapshot('unique-groups')
      await page.evaluate(() => window.nativeGrouping.shape('off'))
      const ungrouped = await measureHeap()
      await snapshot('ungrouped')
      const final = await page.evaluate(() => window.nativeGrouping.dispose())
      assert.equal(final.rows, final.unmounts)
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      )
      await client.send('HeapProfiler.collectGarbage')
      const metrics = Object.fromEntries(
        (await client.send('Performance.getMetrics')).metrics.map(
          ({ name, value }) => [name, value],
        ),
      )
      await snapshot('disposed')
      assert.ok(
        metrics.JSHeapUsedSize - empty.JSHeapUsedSize <
          Math.max(
            5 * 2 ** 20,
            (nestedGroups.JSHeapUsedSize - empty.JSHeapUsedSize) * 0.05,
          ),
        'Unbounded retained heap after grouping disposal',
      )
      assert.deepEqual(errors, [])
      samples.push({
        size,
        repeat,
        initial,
        result,
        final,
        metrics,
        empty,
        nestedGroups,
        uniqueGroups,
        ungrouped,
        loadBefore,
        loadAfter: loadavg(),
      })
      await page.close()
      console.log(
        `${size} rows, sample ${repeat + 1}: ${result.steps.length} grouping states passed`,
      )
    }
  const assetHashes = {}
  for (const name of await readdir(assets + '/assets'))
    assetHashes[name] = createHash('sha256')
      .update(await readFile(assets + '/assets/' + name))
      .digest('hex')
  await writeFile(
    output,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: browser.version(),
        distribution,
        sizes,
        repeats,
        assetHashes,
        samples,
        contention: 'Shared development host; timings are advisory.',
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
