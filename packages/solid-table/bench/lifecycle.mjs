import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadavg } from 'node:os'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Use the unminified production build for readable heap object names.
const assets = fileURLToPath(new URL('../.heap-dist/', import.meta.url))
const output = process.env.BENCH_OUTPUT_DIR ?? '/tmp/table-native-lifecycle'
const cycles = Number(process.env.BENCH_CYCLES ?? 12)
const size = Number(process.env.BENCH_SIZE ?? 50000)
await mkdir(output, { recursive: true })
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
    response.end(
      await readFile(assets + (path === '/' ? 'index.html' : path.slice(1))),
    )
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error')
      errors.push(message.text())
  })
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await (await page.waitForFunction(() => window.benchmark)).dispose()
  async function measure() {
    await page.evaluate(() => window.benchmark.settle())
    await client.send('HeapProfiler.collectGarbage')
    return Object.fromEntries(
      (await client.send('Performance.getMetrics')).metrics.map(
        ({ name, value }) => [name, value],
      ),
    )
  }
  async function snapshot(name) {
    const stream = createWriteStream(`${output}/${name}.heapsnapshot`)
    const write = ({ chunk }) => stream.write(chunk)
    client.on('HeapProfiler.addHeapSnapshotChunk', write)
    await client.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
    })
    client.off('HeapProfiler.addHeapSnapshotChunk', write)
    stream.end()
    await finished(stream)
  }
  const empty = await measure()
  const samples = []
  for (let cycle = 0; cycle < cycles; cycle++) {
    const loadBefore = loadavg()
    const initial = await page.evaluate(
      (size) => window.benchmark.start('native', size),
      size,
    )
    assert.equal(initial.counts.rows, Math.min(40, size))
    assert.equal(initial.counts.cells, Math.min(40, size) * 8)
    for (const action of [
      'append',
      'edit',
      'replace',
      'filter',
      'sort',
      'activeEdit',
      'refresh',
    ]) {
      await page.evaluate((action) => window.benchmark.action(action), action)
      await page.evaluate(() => window.benchmark.inspect())
    }
    const scroll = await page.evaluate(() => window.benchmark.scroll())
    await page.evaluate(() => window.benchmark.inspect())
    assert.equal(scroll.after.mounts - scroll.after.unmounts, 40)
    const populated = await measure()
    if (cycle === cycles - 1) await snapshot('native-loaded')
    const counts = await page.evaluate(() => window.benchmark.dispose())
    assert.equal(counts.mounts, counts.unmounts)
    assert.equal(await page.locator('[data-row]').count(), 0)
    const cleaned = await measure()
    samples.push({
      cycle,
      loadBefore,
      loadAfter: loadavg(),
      populated,
      cleaned,
      counts,
    })
    assert.ok(
      cleaned.JSHeapUsedSize - empty.JSHeapUsedSize <
        Math.max(
          5 * 2 ** 20,
          (populated.JSHeapUsedSize - empty.JSHeapUsedSize) * 0.05,
        ),
    )
    console.log(
      `Cycle ${cycle + 1}: loaded ${(populated.JSHeapUsedSize / 2 ** 20).toFixed(2)} MiB, cleaned ${(cleaned.JSHeapUsedSize / 2 ** 20).toFixed(2)} MiB, ${counts.mounts} disposed rows`,
    )
  }
  await snapshot('native-cleaned')
  assert.deepEqual(errors, [])
  await writeFile(
    `${output}/lifecycle.json`,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: browser.version(),
        size,
        cycles,
        empty,
        samples,
        errors,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
