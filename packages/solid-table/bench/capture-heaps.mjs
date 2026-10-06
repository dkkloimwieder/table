import assert from 'node:assert/strict'
import { loadavg } from 'node:os'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('../.heap-dist/', import.meta.url))
const output = process.env.BENCH_OUTPUT_DIR ?? '/tmp/table-solid-heaps'
const modes = (process.env.BENCH_MODES ?? 'array,deep,keyed').split(',')
const sizes = (process.env.BENCH_SIZES ?? process.env.BENCH_SIZE ?? '50000')
  .split(',')
  .map(Number)
const stages = (process.env.BENCH_HEAP_STAGES ?? 'loaded').split(',')
for (const stage of stages)
  assert.ok(
    ['empty', 'loaded', 'disposed'].includes(stage),
    `Unknown stage: ${stage}`,
  )
await mkdir(output, { recursive: true })
const metadata = []
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  try {
    if (path === '/favicon.ico') {
      response.writeHead(204).end()
      return
    }
    response.setHeader(
      'Content-Type',
      path.endsWith('.js') ? 'text/javascript' : 'text/html',
    )
    response.end(
      await readFile(root + (path === '/' ? 'index.html' : path.slice(1))),
    )
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
async function writeMetadata() {
  await writeFile(
    `${output}/metadata.json`,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: browser.version(),
        production: true,
        minify: false,
        sizes,
        modes,
        stages,
        metadata,
      },
      null,
      2,
    ) + '\n',
  )
}
try {
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  for (const size of sizes)
    for (const mode of modes) {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 800 },
      })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      const client = await page.context().newCDPSession(page)
      await client.send('Performance.enable')
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await (await page.waitForFunction(() => window.benchmark)).dispose()
      const loadBefore = loadavg()
      async function capture(stage) {
        for (let i = 0; i < 2; i++) {
          await page.evaluate(() => window.benchmark.settle())
          await client.send('HeapProfiler.collectGarbage')
        }
        const metrics = Object.fromEntries(
          (await client.send('Performance.getMetrics')).metrics.map(
            ({ name, value }) => [name, value],
          ),
        )
        const filename =
          sizes.length === 1 && stages.length === 1 && stage === 'loaded'
            ? mode
            : `${mode}-${size}-${stage}`
        const path = `${output}/${filename}.heapsnapshot`
        const stream = createWriteStream(path)
        const saveChunk = ({ chunk }) => stream.write(chunk)
        client.on('HeapProfiler.addHeapSnapshotChunk', saveChunk)
        await client.send('HeapProfiler.takeHeapSnapshot', {
          reportProgress: false,
        })
        client.off('HeapProfiler.addHeapSnapshotChunk', saveChunk)
        stream.end()
        await finished(stream)
        metadata.push({
          mode,
          size,
          stage,
          path,
          metrics,
          loadBefore,
          loadAfter: loadavg(),
        })
        await writeMetadata()
        console.log(
          `Saved ${path}: ${(metrics.JSHeapUsedSize / 2 ** 20).toFixed(2)} MiB`,
        )
      }
      if (stages.includes('empty')) await capture('empty')
      await page.evaluate(
        ({ mode, size }) => window.benchmark.start(mode, size),
        { mode, size },
      )
      for (const action of [
        'append',
        'edit',
        'unrelated',
        'replace',
        'filter',
        'sort',
        'activeEdit',
        'refresh',
      ]) {
        await page.evaluate((action) => window.benchmark.action(action), action)
        await page.evaluate(() => window.benchmark.inspect())
      }
      await page.evaluate(() => window.benchmark.scroll())
      await page.evaluate(() => window.benchmark.inspect())
      if (stages.includes('loaded')) await capture('loaded')
      if (stages.includes('disposed')) {
        const counts = await page.evaluate(() => window.benchmark.dispose())
        assert.equal(counts.mounts, counts.unmounts)
        assert.equal(await page.locator('[data-row]').count(), 0)
        await capture('disposed')
      }
      assert.deepEqual(errors, [], `${mode}/${size}: browser errors`)
      await page.close()
    }
  await writeMetadata()
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
