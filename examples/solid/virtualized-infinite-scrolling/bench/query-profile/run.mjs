import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { loadavg } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const distribution = Boolean(process.env.BENCH_DISTRIBUTION)
const assets = fileURLToPath(
  new URL(distribution ? '.dist-package/' : '.dist/', import.meta.url),
)
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-query-profile.json'
const numbers = (name, fallback, minimum) => {
  const values = (process.env[name] ?? fallback).split(',').map(Number)
  assert.ok(
    values.length &&
      values.every((n) => Number.isSafeInteger(n) && n >= minimum),
    `Invalid ${name}`,
  )
  return values
}
const sizes = numbers('BENCH_SIZES', '1000,10000,50000', 1000)
const pageSize = numbers('BENCH_PAGE_SIZE', '1000', 1)[0]
assert.ok(
  pageSize <= Math.min(...sizes),
  'BENCH_PAGE_SIZE must not exceed a dataset size',
)
const repeats = numbers('BENCH_REPEATS', '3', 1)[0]
const warmups = numbers('BENCH_WARMUPS', '1', 0)[0]
const modes = process.env.BENCH_MODES?.split(',') ?? [
  'deep',
  'page-deep',
  'clone',
  'shallow',
]
assert.ok(
  modes.length &&
    new Set(modes).size === modes.length &&
    modes.every((mode) =>
      ['deep', 'page-deep', 'clone', 'shallow'].includes(mode),
    ),
  'Invalid BENCH_MODES',
)
const allocations = process.env.BENCH_ALLOCATIONS !== '0'
const actions = [
  'load',
  'stableRead',
  'sameReference',
  'equalPayload',
  'fieldEdit',
  'appendPage',
  'pageReplacement',
  'removePage',
]
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/favicon.ico') {
      response.writeHead(204).end()
      return
    }
    const filename = resolve(
      assets,
      `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`,
    )
    if (!filename.startsWith(resolve(assets) + sep)) {
      response.writeHead(403).end()
      return
    }
    response.setHeader(
      'Content-Type',
      filename.endsWith('.js') ? 'text/javascript' : 'text/html',
    )
    response.end(await readFile(filename))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
let browser
const samples = []
const deterministic = new Map()
try {
  browser = await chromium.launch(
    process.env.BENCH_EXECUTABLE_PATH
      ? { executablePath: process.env.BENCH_EXECUTABLE_PATH }
      : {},
  )
  const contracts = []
  for (const pageScoped of [false, true])
    for (const freshPayload of [false, true])
      for (const structuralSharing of [false, true]) {
        const contractPage = await browser.newPage()
        const errors = []
        contractPage.on('pageerror', (error) => errors.push(error.message))
        contractPage.on('console', (message) => {
          if (['warning', 'error'].includes(message.type()))
            errors.push(message.text())
        })
        await contractPage.goto(`http://127.0.0.1:${server.address().port}/`)
        await (
          await contractPage.waitForFunction(() => window.queryProfile)
        ).dispose()
        const result = await contractPage.evaluate(
          ({ pageScoped, freshPayload, structuralSharing }) =>
            window.queryProfile.verifyPageContracts(
              pageScoped,
              freshPayload,
              structuralSharing,
            ),
          { pageScoped, freshPayload, structuralSharing },
        )
        assert.equal(result.active, 0)
        assert.deepEqual(errors, [])
        contracts.push({
          pageScoped,
          freshPayload,
          structuralSharing,
          ...result,
        })
        console.log(
          `${pageScoped ? 'Page-scoped' : 'Original'} contracts, fresh=${freshPayload}, sharing=${structuralSharing}: ${result.steps.length} states passed`,
        )
        await contractPage.close()
      }
  for (const size of sizes)
    for (const structuralSharing of [true, false])
      for (let repeat = -warmups; repeat < repeats; repeat++) {
        const offset = (repeat + warmups) % modes.length
        for (const mode of [
          ...modes.slice(offset),
          ...modes.slice(0, offset),
        ]) {
          const page = await browser.newPage()
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (['warning', 'error'].includes(message.type()))
              errors.push(message.text())
          })
          const cdp = await page.context().newCDPSession(page)
          await cdp.send('Performance.enable')
          await page.goto(`http://127.0.0.1:${server.address().port}/`)
          await (
            await page.waitForFunction(() => window.queryProfile)
          ).dispose()
          const heap = async () => {
            await cdp.send('HeapProfiler.collectGarbage')
            return (await cdp.send('Performance.getMetrics')).metrics.find(
              ({ name }) => name === 'JSHeapUsedSize',
            ).value
          }
          const emptyHeap = await heap()
          const loadBefore = loadavg()
          const steps = []
          for (const action of actions) {
            if (action !== 'load')
              await page.evaluate(
                (action) => window.fixture.prepare(action),
                action,
              )
            if (allocations)
              await cdp.send('HeapProfiler.startSampling', {
                samplingInterval: 32768,
                includeObjectsCollectedByMajorGC: true,
                includeObjectsCollectedByMinorGC: true,
              })
            if (action === 'load')
              await page.evaluate(
                ({ mode, size, structuralSharing, pageSize }) => {
                  window.fixture = window.queryProfile.start(
                    mode,
                    size,
                    structuralSharing,
                    pageSize,
                  )
                  window.fixture.prepare('load')
                },
                { mode, size, structuralSharing, pageSize },
              )
            const result = await page.evaluate(() => window.fixture.measure())
            const profile = allocations
              ? (await cdp.send('HeapProfiler.stopSampling')).profile
              : undefined
            const identities = await page.evaluate(() =>
              window.fixture.inspect(),
            )
            if (mode === 'page-deep') {
              const expectedPageReads = {
                load: Math.ceil(size / pageSize),
                stableRead: 0,
                sameReference: 0,
                equalPayload: structuralSharing
                  ? 0
                  : Math.ceil(size / pageSize),
                fieldEdit: 1,
                appendPage: 1,
                pageReplacement: 1,
                removePage: 0,
              }[action]
              assert.equal(
                result.counts.pageReads,
                expectedPageReads,
                `${size}/${structuralSharing}/${action}: page snapshot work`,
              )
            }
            const sampledBytes = profile?.samples.reduce(
              (total, { size }) => total + size,
              0,
            )
            if (repeat >= 0 && profile) {
              const filename = `${output}.allocations/${mode}-${size}-sharing-${structuralSharing}-${repeat}-${action}.json`
              await mkdir(dirname(filename), { recursive: true })
              await writeFile(filename, JSON.stringify(profile))
            }
            steps.push({ ...result, ...identities, sampledBytes })
          }
          const loadedHeap = await heap()
          assert.deepEqual(
            await page.evaluate(() => window.fixture.dispose()),
            { cacheEntries: 0 },
          )
          await page.evaluate(() => {
            window.fixture = undefined
          })
          const disposedHeap = await heap()
          assert.deepEqual(errors, [])
          const counts = steps.map(
            ({
              action,
              counts,
              rows,
              newRows,
              newCoreRows,
              checksum,
              sameArray,
              sameModel,
              staleCells,
              changedOldRows,
            }) => ({
              action,
              counts,
              rows,
              newRows,
              newCoreRows,
              checksum,
              sameArray,
              sameModel,
              staleCells,
              changedOldRows,
            }),
          )
          const key = `${mode}/${size}/${structuralSharing}`
          if (deterministic.has(key))
            assert.deepEqual(
              counts,
              deterministic.get(key),
              `${key}: nondeterministic counts`,
            )
          else deterministic.set(key, counts)
          if (repeat >= 0)
            samples.push({
              mode,
              size,
              structuralSharing,
              repeat,
              steps,
              emptyHeap,
              loadedHeap,
              disposedHeap,
              loadBefore,
              loadAfter: loadavg(),
            })
          await page.close()
          console.log(
            `${mode}, ${size} rows, sharing=${structuralSharing}, ${repeat < 0 ? 'warmup' : `sample ${repeat + 1}`}: ${steps.length} states passed`,
          )
        }
      }
  const hashes = {}
  for (const filename of await readdir(resolve(assets, 'assets'))) {
    if (filename.endsWith('.js'))
      hashes[filename] = createHash('sha256')
        .update(await readFile(resolve(assets, 'assets', filename)))
        .digest('hex')
  }
  const manifest = JSON.parse(
    await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  )
  await mkdir(dirname(output), { recursive: true })
  await writeFile(
    output,
    JSON.stringify(
      {
        browser: browser.version(),
        distribution,
        allocations,
        samplingInterval: 32768,
        versions: {
          solid: manifest.dependencies['solid-js'],
          query: manifest.dependencies['@tanstack/solid-query'],
        },
        sizes,
        pageSize,
        repeats,
        warmups,
        modes,
        hashes,
        contracts,
        samples,
      },
      null,
      2,
    ),
  )
  console.log(`Report: ${output}`)
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
}
