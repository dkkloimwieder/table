import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('../.heap-dist/', import.meta.url))
const output = process.env.BENCH_OUTPUT_DIR ?? '/tmp/table-solid-heaps'
const modes = (process.env.BENCH_MODES ?? 'array,deep,keyed').split(',')
const size = Number(process.env.BENCH_SIZE ?? 50000)
await mkdir(output, { recursive: true })
const metadata = []
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  try {
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
try {
  browser = await chromium.launch()
  for (const mode of modes) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    })
    const client = await page.context().newCDPSession(page)
    await client.send('Performance.enable')
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    await (await page.waitForFunction(() => window.benchmark)).dispose()
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
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.benchmark.settle())
      await client.send('HeapProfiler.collectGarbage')
    }
    const metrics = Object.fromEntries(
      (await client.send('Performance.getMetrics')).metrics.map(
        ({ name, value }) => [name, value],
      ),
    )
    const path = `${output}/${mode}.heapsnapshot`
    const stream = createWriteStream(path)
    const saveChunk = ({ chunk }) => stream.write(chunk)
    client.on('HeapProfiler.addHeapSnapshotChunk', saveChunk)
    console.log(
      `Capturing ${mode}: ${(metrics.JSHeapUsedSize / 2 ** 20).toFixed(2)} MiB`,
    )
    await client.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
    })
    client.off('HeapProfiler.addHeapSnapshotChunk', saveChunk)
    stream.end()
    await finished(stream)
    metadata.push({ mode, size, path, metrics })
    await page.close()
    console.log(`Saved ${path}`)
  }
  await writeFile(
    `${output}/metadata.json`,
    JSON.stringify(
      { browser: browser.version(), production: true, minify: false, metadata },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
