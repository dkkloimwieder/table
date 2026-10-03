import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('../.bench-dist/', import.meta.url))
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-solid-memory.json'
const size = Number(process.env.BENCH_SIZE ?? 50000)
const modes = (process.env.BENCH_MODES ?? 'array,deep,store,keyed').split(',')
const results = []
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
  for (const mode of modes)
    for (const stage of [
      'source',
      'ids',
      'rows',
      'view',
      'filter',
      'sort',
      'scroll',
    ]) {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 800 },
      })
      const client = await page.context().newCDPSession(page)
      await client.send('Performance.enable')
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await (await page.waitForFunction(() => window.benchmark)).dispose()
      const measure = async () => {
        await page.evaluate(() => window.benchmark.settle())
        await client.send('HeapProfiler.collectGarbage')
        return Object.fromEntries(
          (await client.send('Performance.getMetrics')).metrics.map(
            ({ name, value }) => [name, value],
          ),
        ).JSHeapUsedSize
      }
      const empty = await measure()
      const initial = await page.evaluate(
        ({ mode, size, stage }) =>
          window.benchmark.start(
            mode,
            size,
            ['filter', 'sort', 'scroll'].includes(stage) ? 'view' : stage,
          ),
        { mode, size, stage },
      )
      if (['filter', 'sort', 'scroll'].includes(stage))
        await page.evaluate(() => window.benchmark.action('filter'))
      if (['sort', 'scroll'].includes(stage))
        await page.evaluate(() => window.benchmark.action('sort'))
      if (stage === 'scroll')
        await page.evaluate(() => window.benchmark.scroll())
      if (['view', 'filter', 'sort', 'scroll'].includes(stage))
        await page.evaluate(() => window.benchmark.inspect())
      const populated = await measure()
      await page.evaluate(() => window.benchmark.dispose())
      const cleaned = await measure()
      results.push({
        mode,
        stage,
        size,
        initial,
        empty,
        populated,
        cleaned,
        retained: cleaned - empty,
      })
      console.log(
        `${mode} ${stage}: ${(populated / 2 ** 20).toFixed(2)} MiB, cleanup ${((cleaned - empty) / 2 ** 20).toFixed(2)} MiB`,
      )
      await page.close()
    }
  await writeFile(
    output,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: browser.version(),
        size,
        results,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
