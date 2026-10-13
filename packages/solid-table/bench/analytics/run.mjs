import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { loadavg } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { handleAnalyticsRequest } from './demo-server.mjs'

const directory = process.env.BENCH_DEVELOPMENT
  ? '.dist-dev'
  : process.env.BENCH_DISTRIBUTION
    ? '.dist-package'
    : '.dist'
const assets = fileURLToPath(new URL(`${directory}/`, import.meta.url))
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-analytics-browser.json'
const report = {
  directory,
  hostLoad: loadavg(),
  cases: [],
  errors: [],
  warnings: [],
  diagnostics: [],
}
const modules = JSON.parse(await readFile(assets + 'modules.json', 'utf8'))
assert.ok(
  !modules.some((path) =>
    /table-core|@tanstack\/store|zod\/|createEditing|solid-form|kobalte/.test(
      path,
    ),
  ),
)
assert.ok(
  modules.some((path) => path.includes('/table/vendor/virtual-core/index.ts')),
)
assert.ok(
  !modules.some((path) => /node_modules\/@tanstack\/virtual-core\//.test(path)),
)
assert.ok(
  !modules.some((path) =>
    /createFixedVirtualizer|fixedVirtualRange/.test(path),
  ),
)
report.moduleAudit = true
assert.ok(!modules.some((path) => /analytics\/csv\.ts/.test(path)))
const server = createServer(async (request, response) => {
  try {
    if (await handleAnalyticsRequest(request, response)) return
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/favicon.ico') return void response.writeHead(204).end()
    response.setHeader(
      'Content-Type',
      path.endsWith('.js')
        ? 'text/javascript'
        : path.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    )
    response.end(
      await readFile(assets + (path === '/' ? 'index.html' : path.slice(1))),
    )
  } catch {
    response.writeHead(404).end()
  }
})
let browser
try {
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (error) => report.errors.push(error.stack))
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      report.warnings.push(message.text())
  })
  // Count actual Blob URLs, including release after each real download.
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    window.liveCsvUrls = new Set()
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      window.liveCsvUrls.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      window.liveCsvUrls.delete(url)
      revoke(url)
    }
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => Boolean(window.analyticsFixture))
  const start = (state) =>
    page.evaluate(
      (state) =>
        state
          ? window.analyticsFixture.start(state)
          : window.analyticsFixture.start(),
      state,
    )
  const publish = (state) =>
    page.evaluate((state) => window.analyticsFixture.publish(state), state)
  const rows = () =>
    page
      .locator('tbody tr[data-row]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.row))
  const headers = () =>
    page
      .locator('thead th')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.column))
  async function rename(name, value) {
    await page
      .getByRole('button', { name: `Rename ${name} header`, exact: true })
      .click()
    const editor = page.getByRole('textbox', {
      name: `Header name for ${name}`,
      exact: true,
    })
    await editor.fill(value)
    await editor.press('Enter')
  }
  async function drag(id, target, side = 'before') {
    const handle = await page
      .locator(`th[data-column="${id}"] .column-move`)
      .boundingBox()
    const destination = await page
      .locator(`th[data-column="${target}"]`)
      .boundingBox()
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(
      destination.x + (side === 'before' ? 4 : destination.width - 4),
      destination.y + destination.height / 2,
      { steps: 8 },
    )
    await page.mouse.up()
  }
  async function csv() {
    const waiting = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
    const download = await waiting
    assert.equal(download.suggestedFilename(), 'analytics.csv')
    const stream = await download.createReadStream()
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const content = Buffer.concat(chunks).toString('utf8')
    assert.ok(content.startsWith('\uFEFF'))
    await page.waitForFunction(() => window.liveCsvUrls.size === 0)
    return content.slice(1)
  }
  async function test(name, run) {
    if (process.env.BENCH_CASE && !name.includes(process.env.BENCH_CASE)) return
    console.log(`Analytics: ${name}`)
    await start()
    try {
      await run()
    } catch (error) {
      report.failureState = await page.evaluate(() => ({
        rows: Array.from(document.querySelectorAll('tr[data-row]'), (node) =>
          node.getAttribute('data-row'),
        ),
        viewport: Array.from(
          document.querySelectorAll('.virtual-scroll'),
          (node) => ({
            top: node.scrollTop,
            height: node.clientHeight,
            scrollHeight: node.scrollHeight,
          }),
        ),
        text: document.body.textContent.slice(-1500),
      }))
      throw error
    }
    report.cases.push({ name, status: 'passed' })
  }

  await test('Application export receives stable display snapshots without downloads', async () => {
    await page.evaluate(() =>
      window.analyticsFixture.configureExport({ mode: 'capture' }),
    )
    await page
      .getByRole('button', { name: 'Sort Revenue', exact: true })
      .click()
    await rename('Revenue', 'Total')
    await page.getByText('Display columns', { exact: true }).click()
    await page
      .getByRole('checkbox', { name: 'Show Active', exact: true })
      .uncheck()
    await drag('revenue', 'region')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const expected = {
      queryKey: 'sales',
      columns: [
        { id: 'revenue', label: 'Total' },
        { id: 'region', label: 'Region' },
      ],
      sorting: [{ id: 'revenue', desc: false }],
    }
    assert.deepEqual(
      await page.evaluate(() => window.analyticsFixture.exportRequests()),
      [expected],
    )
    await page
      .getByRole('button', { name: 'Reset display', exact: true })
      .click()
    await publish({
      status: 'ready',
      result: {
        key: 'replacement',
        columns: [{ id: 'value', label: 'Value' }],
        rows: [],
      },
    })
    assert.deepEqual(
      await page.evaluate(() => window.analyticsFixture.exportRequests()),
      [expected],
    )
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const requests = await page.evaluate(() =>
      window.analyticsFixture.exportRequests(),
    )
    assert.deepEqual(requests[1], {
      queryKey: 'replacement',
      columns: [{ id: 'value', label: 'Value' }],
      sorting: [],
    })
    await page.evaluate(() => window.analyticsFixture.stop())
    assert.deepEqual(
      await page.evaluate(() => window.analyticsFixture.exportRequests()),
      requests,
    )
    assert.equal(await page.evaluate(() => window.liveCsvUrls.size), 0)
  })
  await test('Application controls export availability and optional callback', async () => {
    const configure = (configuration) =>
      page.evaluate(
        (configuration) =>
          window.analyticsFixture.configureExport(configuration),
        configuration,
      )
    await configure({ mode: 'none' })
    assert.equal(await page.getByRole('button', { name: /^Export/ }).count(), 0)
    await configure({ mode: 'capture', disabled: true })
    const button = page.getByRole('button', { name: 'Export', exact: true })
    assert.equal(await button.isDisabled(), true)
    const stale = await button.elementHandle()
    await stale.evaluate((node) => node.dispatchEvent(new MouseEvent('click')))
    assert.deepEqual(
      await page.evaluate(() => window.analyticsFixture.exportRequests()),
      [],
    )
    await configure({ mode: 'capture' })
    await button.click()
    assert.equal(
      await page.evaluate(
        () => window.analyticsFixture.exportRequests().length,
      ),
      1,
    )
    for (const state of [
      { status: 'loading' },
      { status: 'error', message: 'Query failed' },
    ]) {
      await publish(state)
      assert.equal(await button.isDisabled(), true)
      await stale.evaluate((node) =>
        node.dispatchEvent(new MouseEvent('click')),
      )
    }
    await page.evaluate(() =>
      window.analyticsFixture.publish({
        status: 'ready',
        result: window.analyticsFixture.sales,
      }),
    )
    await page.getByText('Display columns', { exact: true }).click()
    for (const label of ['Region', 'Revenue', 'Active'])
      await page
        .getByRole('checkbox', { name: `Show ${label}`, exact: true })
        .uncheck()
    assert.equal(await button.isDisabled(), true)
    await stale.evaluate((node) => node.dispatchEvent(new MouseEvent('click')))
    await configure({ mode: 'none' })
    await stale.evaluate((node) => node.dispatchEvent(new MouseEvent('click')))
    await configure({ mode: 'capture' })
    await page.evaluate(() => window.analyticsFixture.stop())
    await stale.evaluate((node) => node.dispatchEvent(new MouseEvent('click')))
    assert.equal(
      await page.evaluate(
        () => window.analyticsFixture.exportRequests().length,
      ),
      1,
    )
    assert.equal(await page.evaluate(() => window.liveCsvUrls.size), 0)
  })

  await test('Runtime columns and scalar cells are read-only', async () => {
    assert.deepEqual(await headers(), ['region', 'revenue', 'active'])
    assert.equal(
      await page.locator('thead input, [data-header-filter]').count(),
      0,
    )
    assert.equal(await page.getByRole('searchbox').count(), 0)
    assert.equal(await page.getByRole('textbox').count(), 0)
    assert.equal(
      await page.getByText('Filter results', { exact: true }).count(),
      0,
    )
    assert.deepEqual(await rows(), ['west', 'east', 'north'])
    assert.equal(
      await page
        .locator(
          'tbody input, tbody button, tbody select, [contenteditable=true]',
        )
        .count(),
      0,
    )
    assert.equal(
      await page.locator('[data-row=east] [data-column=active]').textContent(),
      'false',
    )
    assert.equal(
      await page
        .locator('[data-row=north] [data-column=revenue]')
        .textContent(),
      '',
    )
    assert.equal(
      await csv(),
      'Region,Revenue,Active\r\nWest,42,true\r\nEast,7,false\r\nNorth,,true\r\n',
    )
  })
  await test('Server preview sorts the complete query and exports beyond its limit', async () => {
    await page.evaluate(() => window.analyticsFixture.startServer())
    await page
      .getByRole('combobox', { name: 'Example query' })
      .selectOption('large')
    await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
    const sort = page.getByRole('button', { name: 'Sort Index', exact: true })
    await sort.click()
    await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
    await sort.click()
    await page.locator('[data-row="row-100004"]').waitFor()
    await rename('Index', 'Row number')
    await drag('name', 'index')
    let description
    const listener = (request) => {
      if (request.url().endsWith('/api/analytics/export'))
        description = request.postDataJSON()
    }
    page.on('request', listener)
    const content = await csv()
    page.off('request', listener)
    assert.deepEqual(description, {
      queryKey: 'large',
      columns: [
        { id: 'name', label: 'Name' },
        { id: 'index', label: 'Row number' },
      ],
      sorting: [{ id: 'index', desc: true }],
    })
    assert.equal(content.split('\r\n').length, 100007)
    assert.ok(content.startsWith('Name,Row number\r\nRow 100004,100004\r\n'))
    assert.ok(content.endsWith('Row 0,0\r\n'))
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
  })
  await test('Load all browses distant pages with bounded records and rendered rows', async () => {
    await page.evaluate(() => window.analyticsFixture.startServer())
    await page
      .getByRole('combobox', { name: 'Example query' })
      .selectOption('large')
    await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
    const previewBounds = await page.locator('.table-scroll').boundingBox()
    await page.getByRole('button', { name: 'Load all', exact: true }).click()
    const viewport = page.locator('.virtual-scroll')
    await page.locator('[data-row="row-0"]').waitFor()
    assert.deepEqual(await viewport.boundingBox(), previewBounds)
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
    await viewport.evaluate((node) => {
      node.scrollTop = 50000 * 32
    })
    await page.locator('[data-row="row-50000"]').waitFor()
    await page.getByText('2000 of 100005 rows', { exact: true }).waitFor()
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
    await viewport.evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await page.locator('[data-row="row-100004"]').waitFor()
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
    await viewport.evaluate((node) => {
      node.scrollTop = 0
    })
    await page.locator('[data-row="row-0"]').waitFor()
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
    await page.getByRole('button', { name: 'Sort Index', exact: true }).click()
    await page.locator('[data-row="row-0"]').waitFor()
    await page.getByRole('button', { name: 'Sort Index', exact: true }).click()
    await page.locator('[data-row="row-100004"]').waitFor()
    await page
      .getByRole('button', { name: 'Show preview', exact: true })
      .click()
    await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
    assert.equal(await page.locator('.virtual-scroll').count(), 0)
    assert.deepEqual(
      await page.locator('.table-scroll').boundingBox(),
      previewBounds,
    )
    assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
    assert.equal(
      await page.locator('tbody tr[data-row]').first().getAttribute('data-row'),
      'row-100004',
    )
    await page.evaluate(() => window.analyticsFixture.stop())
    assert.equal(await page.locator('#root').textContent(), '')
  })
  await test('density drives both virtual geometry and cell styles while theme preserves bounds', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.evaluate(() => window.analyticsFixture.startServer())
    await page
      .getByRole('combobox', { name: 'Example query' })
      .selectOption('large')
    await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
    await page.locator('tbody tr[data-row]').first().waitFor()
    await page.getByRole('button', { name: 'Load all' }).click()
    for (const [density, height] of [
      ['comfortable', 40],
      ['compact', 32],
    ]) {
      await page.evaluate(
        (density) => window.analyticsFixture.configureDensity(density),
        density,
      )
      await page.waitForFunction((height) => {
        const rows = document.querySelectorAll('tbody tr[data-row]')
        const first = rows[0]?.getBoundingClientRect()
        const second = rows[1]?.getBoundingClientRect()
        const extent = document.querySelector('.virtual-scroll')?.scrollHeight
        return (
          first &&
          second &&
          extent !== undefined &&
          Math.abs(first.height - height) < 0.5 &&
          Math.abs(second.y - first.y - height) < 0.5 &&
          Math.abs(extent - 100005 * height) < 150
        )
      }, height)
      const first = await page
        .locator('tbody tr[data-row]')
        .first()
        .boundingBox()
      const second = await page
        .locator('tbody tr[data-row]')
        .nth(1)
        .boundingBox()
      assert.ok(
        Math.abs(second.y - first.y - height) < 0.5,
        JSON.stringify({ density, height, first, second }),
      )
      const end = await page
        .locator('.virtual-scroll')
        .evaluate((node) => node.scrollHeight)
      assert.ok(Math.abs(end - 100005 * height) < 150)
    }
    const bounds = await page.locator('.table-scroll').boundingBox()
    await page.evaluate(() => {
      document.querySelector('main').dataset.uiTheme = 'dark'
    })
    assert.deepEqual(await page.locator('.table-scroll').boundingBox(), bounds)
    await page.evaluate(() => {
      delete document.querySelector('main').dataset.uiTheme
    })
  })
  await test('Table fills available screen height for small and empty results', async () => {
    for (const size of [
      { width: 1280, height: 900 },
      { width: 390, height: 800 },
      { width: 1280, height: 700 },
    ]) {
      await page.setViewportSize(size)
      await page.evaluate(() => window.analyticsFixture.startServer())
      await page.locator('tbody tr[data-row]').first().waitFor()
      assert.equal(await page.locator('.table-scroll caption').count(), 0)
      assert.equal(
        await page.getByRole('table', { name: 'Query results' }).count(),
        1,
      )
      const rowBounds = await page
        .locator('tbody tr[data-row]')
        .first()
        .boundingBox()
      assert.ok(Math.abs(rowBounds.height - 32) < 1)
      const bounds = await page.locator('.table-scroll').boundingBox()
      assert.ok(bounds.height > 200)
      assert.ok(Math.abs(bounds.y + bounds.height - (size.height - 16)) < 1)
      await page
        .getByRole('combobox', { name: 'Example query' })
        .selectOption('inventory')
      await page.getByText('2 of 2 rows', { exact: true }).waitFor()
      assert.deepEqual(
        await page.locator('.table-scroll').boundingBox(),
        bounds,
      )
      await page.evaluate(async () => {
        await window.analyticsFixture.publish({
          status: 'ready',
          result: {
            key: 'empty-height',
            columns: [{ id: 'name', label: 'Name' }],
            rows: [],
          },
        })
      })
      await page
        .getByText('The query returned no rows.', { exact: true })
        .waitFor()
      assert.deepEqual(
        await page.locator('.table-scroll').boundingBox(),
        bounds,
      )
      await page.getByText('Display columns', { exact: true }).click()
      const expanded = await page.locator('.table-scroll').boundingBox()
      assert.ok(expanded.y > bounds.y)
      assert.ok(Math.abs(expanded.y + expanded.height - (size.height - 16)) < 1)
    }
    await page.setViewportSize({ width: 1280, height: 900 })
  })
  await test('Application cache reuses cheap pages and enforces byte budgets', async () => {
    const requests = []
    const listener = (request) => {
      if (request.url().endsWith('/api/analytics/query'))
        requests.push(request.postDataJSON())
    }
    page.on('request', listener)
    try {
      await page.evaluate(() => window.analyticsFixture.startServer())
      await page
        .getByRole('combobox', { name: 'Example query' })
        .selectOption('large')
      await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Load all', exact: true }).click()
      const viewport = page.locator('.virtual-scroll')
      await viewport.evaluate((node) => {
        node.scrollTop = 1000 * 32
      })
      await page.locator('[data-row="row-1000"]').waitFor()
      assert.equal(
        requests.filter((value) => value.queryKey === 'large').length,
        2,
      )
      assert.equal(requests.at(-1).offset, 1000)
      for (const index of [50000, 70000, 50000]) {
        const before = requests.length
        await viewport.evaluate((node, index) => {
          node.scrollTop = index * 32
        }, index)
        await page.locator(`[data-row="row-${index}"]`).waitFor()
        if (index === 50000 && before > 4) assert.equal(requests.length, before)
      }
      const retained = await page.evaluate(() =>
        window.analyticsFixture.cacheStats(),
      )
      assert.ok(retained.rows > 2000)
      assert.ok(retained.estimatedBytes <= retained.maxBytes)
      await page
        .getByRole('button', { name: 'Show preview', exact: true })
        .click()
      await page.locator('[data-row="row-0"]').waitFor()
      const before = requests.length
      await page.getByRole('button', { name: 'Run query', exact: true }).click()
      await page.locator('[data-row="row-0"]').waitFor()
      assert.equal(requests.length, before + 1)
      assert.equal(
        (await page.evaluate(() => window.analyticsFixture.cacheStats())).rows,
        1000,
      )
      await page.evaluate(() =>
        window.analyticsFixture.startServer({ maxBytes: 1024, pageSize: 100 }),
      )
      await page
        .getByRole('combobox', { name: 'Example query' })
        .selectOption('large')
      await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Load all', exact: true }).click()
      await page.locator('.virtual-scroll').evaluate((node) => {
        node.scrollTop = 50000 * 32
      })
      await page.locator('[data-row="row-50000"]').waitFor()
      assert.equal(
        (await page.evaluate(() => window.analyticsFixture.cacheStats())).rows,
        0,
      )
      assert.ok(requests.slice(-2).every((value) => value.limit === 100))
      assert.ok((await page.locator('tbody tr[data-row]').count()) < 60)
      await page.evaluate(() => window.analyticsFixture.stop())
      assert.equal(
        await page.evaluate(() => window.analyticsFixture.cacheStats()),
        undefined,
      )
    } finally {
      page.off('request', listener)
    }
  })
  await test('Paged failures retry and replaced requests cannot repopulate the cache', async () => {
    await page.evaluate(() => window.analyticsFixture.startServer())
    await page
      .getByRole('combobox', { name: 'Example query' })
      .selectOption('large')
    await page.getByText('1000 of 100005 rows', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Load all', exact: true }).click()
    let failed = false
    let release
    let signalHeld
    let signalFinished
    const held = new Promise((resolve) => {
      signalHeld = resolve
    })
    const finished = new Promise((resolve) => {
      signalFinished = resolve
    })
    const gate = new Promise((resolve) => {
      release = resolve
    })
    await page.route('**/api/analytics/query', async (route) => {
      const value = route.request().postDataJSON()
      if (value.queryKey === 'large' && value.offset === 49000 && !failed) {
        failed = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'invalid page JSON',
        })
      } else if (value.queryKey === 'large' && value.offset === 69000) {
        signalHeld()
        await gate
        try {
          await route.continue()
        } catch {
          /* The replaced query aborts this request. */
        } finally {
          signalFinished()
        }
      } else await route.continue()
    })
    try {
      const viewport = page.locator('.virtual-scroll')
      await viewport.evaluate((node) => {
        node.scrollTop = 50000 * 32
      })
      await page
        .getByRole('button', { name: 'Retry rows', exact: true })
        .waitFor()
      await page
        .getByRole('button', { name: 'Retry rows', exact: true })
        .click()
      await page.locator('[data-row="row-50000"]').waitFor()
      assert.equal(await page.getByRole('alert').count(), 0)
      await viewport.evaluate((node) => {
        node.scrollTop = 70000 * 32
      })
      await held
      await page
        .getByRole('combobox', { name: 'Example query' })
        .selectOption('inventory')
      await page.getByText('2 of 2 rows', { exact: true }).waitFor()
      release()
      await finished
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      )
      assert.deepEqual(await rows(), ['item-1', 'item-2'])
      assert.equal(
        (await page.evaluate(() => window.analyticsFixture.cacheStats())).rows,
        2,
      )
    } finally {
      release()
      await page.unroute('**/api/analytics/query')
    }
  })
  await test('Sorting exports every query row, including blanks and false values', async () => {
    await page
      .getByRole('button', { name: 'Sort Revenue', exact: true })
      .click()
    assert.deepEqual(await rows(), ['east', 'west', 'north'])
    assert.equal(
      await csv(),
      'Region,Revenue,Active\r\nEast,7,false\r\nWest,42,true\r\nNorth,,true\r\n',
    )
    await page
      .getByRole('button', { name: 'Sort Revenue', exact: true })
      .click()
    assert.deepEqual(await rows(), ['west', 'east', 'north'])
    assert.equal(
      await csv(),
      'Region,Revenue,Active\r\nWest,42,true\r\nEast,7,false\r\nNorth,,true\r\n',
    )
  })
  await test('Display labels, visibility and order control headers without changing query data', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await rename('Revenue', 'Net, "€"')
    await drag('revenue', 'region')
    await page.getByLabel('Show Active', { exact: true }).uncheck()
    assert.deepEqual(await headers(), ['revenue', 'region'])
    assert.equal(
      await csv(),
      '"Net, ""€""",Region\r\n42,West\r\n7,East\r\n,North\r\n',
    )
    assert.equal(
      await page.evaluate(() => window.analyticsFixture.sales.columns[1].label),
      'Revenue',
    )
    await page
      .getByRole('button', { name: 'Sort Net, "€"', exact: true })
      .click()
    assert.deepEqual(await rows(), ['east', 'west', 'north'])
    await page
      .getByRole('button', { name: 'Reset display', exact: true })
      .click()
    assert.deepEqual(await headers(), ['region', 'revenue', 'active'])
    assert.deepEqual(await rows(), ['west', 'east', 'north'])
  })
  await test('Empty query results export headers and hidden columns disable export', async () => {
    await page.evaluate(() =>
      window.analyticsFixture.publish({
        status: 'ready',
        result: { ...window.analyticsFixture.sales, rows: [] },
      }),
    )
    assert.equal(
      await page
        .getByText('The query returned no rows.', { exact: true })
        .isVisible(),
      true,
    )
    assert.deepEqual(await rows(), [])
    assert.equal(await csv(), 'Region,Revenue,Active\r\n')
    await page.getByText('Display columns', { exact: true }).click()
    for (const label of ['Region', 'Revenue', 'Active'])
      await page.getByLabel(`Show ${label}`, { exact: true }).uncheck()
    assert.equal(
      await page
        .getByRole('button', { name: 'Export CSV', exact: true })
        .isDisabled(),
      true,
    )
    assert.equal(
      await page
        .getByText('Show a column to view or export results.', { exact: true })
        .isVisible(),
      true,
    )
  })
  await test('Same-schema query refresh preserves display state and replaces values', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await rename('Revenue', 'Amount')
    await publish({ status: 'loading' })
    assert.equal(
      await page
        .getByRole('button', { name: 'Export CSV', exact: true })
        .isDisabled(),
      true,
    )
    await page.evaluate(() =>
      window.analyticsFixture.publish({
        status: 'ready',
        result: {
          ...window.analyticsFixture.sales,
          rows: [
            {
              id: 'fresh-east',
              values: { region: 'East', revenue: 99, active: true },
            },
          ],
        },
      }),
    )
    assert.deepEqual(await rows(), ['fresh-east'])
    assert.equal(await csv(), 'Region,Amount,Active\r\nEast,99,true\r\n')
  })
  await test('Loading, error and retry suppress stale rows and export', async () => {
    await publish({ status: 'loading' })
    assert.equal(
      await page.getByText('Loading results…', { exact: true }).isVisible(),
      true,
    )
    assert.equal(await page.locator('tbody tr[data-row]').count(), 0)
    assert.equal(
      await page
        .getByRole('button', { name: 'Export CSV', exact: true })
        .isDisabled(),
      true,
    )
    await publish({ status: 'error', message: 'Query failed' })
    assert.equal(await page.getByRole('alert').textContent(), 'Query failed')
    assert.equal(
      await page
        .getByRole('button', { name: 'Export CSV', exact: true })
        .isDisabled(),
      true,
    )
    await page.getByRole('button', { name: 'Retry query', exact: true }).click()
    await page.waitForSelector('tbody tr')
    assert.equal(
      await csv(),
      'Region,Revenue,Active\r\nWest,42,true\r\nEast,7,false\r\nNorth,,true\r\n',
    )
  })
  await test('Different query or schema resets display choices', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await rename('Revenue', 'Amount')
    await page.getByLabel('Show Active', { exact: true }).uncheck()
    await page
      .getByRole('combobox', { name: 'Example query', exact: true })
      .selectOption('inventory')
    await page.waitForSelector('th[data-column=stock]')
    assert.deepEqual(await headers(), ['product', 'stock'])
    assert.deepEqual(await rows(), ['item-1', 'item-2'])
    assert.equal(await csv(), 'Product,In stock\r\nDesk,12\r\nLamp,0\r\n')
    await publish({
      status: 'ready',
      result: {
        key: 'inventory',
        columns: [{ id: 'region', label: 'Area' }],
        rows: [{ id: 'new', values: { region: 'South' } }],
      },
    })
    assert.equal(await csv(), 'Area\r\nSouth\r\n')
  })
  await test('Arbitrary field IDs and escaped cells survive real downloads', async () => {
    await publish({
      status: 'ready',
      result: {
        key: 'special',
        columns: [
          { id: 'toString', label: 'Text' },
          { id: 'a.b', label: 'Value' },
        ],
        rows: [
          {
            id: 'row:custom',
            values: { toString: '雪,"quoted"\nnext', 'a.b': '=1+1' },
          },
          { id: 'zero', values: { toString: '-text', 'a.b': -5 } },
        ],
      },
    })
    assert.deepEqual(await headers(), ['toString', 'a.b'])
    assert.equal(
      await csv(),
      'Text,Value\r\n"雪,""quoted""\nnext",\'=1+1\r\n\'-text,-5\r\n',
    )
    assert.equal(
      await csv(),
      'Text,Value\r\n"雪,""quoted""\nnext",\'=1+1\r\n\'-text,-5\r\n',
    )
  })
  await test('Inline header rename commits Enter and blur, cancels Escape, and preserves sorting', async () => {
    await page
      .getByRole('button', { name: 'Sort Revenue', exact: true })
      .click()
    const pencil = page.getByRole('button', {
      name: 'Rename Revenue header',
      exact: true,
    })
    const header = page.locator('th[data-column="revenue"]')
    const headerBounds = await header.boundingBox()
    const pencilBounds = await pencil.boundingBox()
    const handleBounds = await header.locator('.column-move').boundingBox()
    await pencil.click()
    const editor = page.getByRole('textbox', {
      name: 'Header name for Revenue',
      exact: true,
    })
    assert.equal(
      await editor.evaluate((node) => node === document.activeElement),
      true,
    )
    assert.equal(await pencil.count(), 0)
    assert.deepEqual(await header.boundingBox(), headerBounds)
    assert.deepEqual(
      await header.locator('.column-move').boundingBox(),
      handleBounds,
    )
    await editor.fill('Discarded')
    await editor.press('Escape')
    assert.deepEqual(await pencil.boundingBox(), pencilBounds)
    assert.equal(
      await pencil.evaluate((node) => node === document.activeElement),
      true,
    )
    assert.equal(
      await page
        .getByRole('button', { name: 'Sort Revenue', exact: true })
        .count(),
      1,
    )
    assert.deepEqual(await rows(), ['east', 'west', 'north'])
    await rename('Revenue', 'Amount')
    const renamedPencil = page.getByRole('button', {
      name: 'Rename Amount header',
      exact: true,
    })
    assert.deepEqual(await renamedPencil.boundingBox(), pencilBounds)
    assert.equal(
      await renamedPencil.evaluate((node) => node === document.activeElement),
      true,
    )
    await page
      .getByRole('button', { name: 'Rename Region header', exact: true })
      .click()
    await page
      .getByRole('textbox', { name: 'Header name for Region', exact: true })
      .fill('Area')
    await page
      .getByRole('textbox', { name: 'Header name for Region', exact: true })
      .press('Tab')
    assert.equal(
      await csv(),
      'Area,Amount,Active\r\nEast,7,false\r\nWest,42,true\r\nNorth,,true\r\n',
    )
  })
  await test('Drag and keyboard reorder preserve hidden columns and export order', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await page.getByLabel('Show Revenue', { exact: true }).uncheck()
    await drag('active', 'region')
    assert.deepEqual(await headers(), ['active', 'region'])
    assert.equal(
      await csv(),
      'Active,Region\r\ntrue,West\r\nfalse,East\r\ntrue,North\r\n',
    )
    await page
      .getByRole('button', { name: 'Move Active column', exact: true })
      .focus()
    await page.keyboard.press('ArrowRight')
    assert.deepEqual(await headers(), ['region', 'active'])
    await page.getByLabel('Show Revenue', { exact: true }).check()
    assert.deepEqual(await headers(), ['region', 'active', 'revenue'])
    assert.equal(await page.locator('th[aria-sort="none"]').count(), 3)
  })
  await test('Touch dragging reorders columns without sorting them', async () => {
    const cdp = await page.context().newCDPSession(page)
    try {
      const handle = await page
        .locator('th[data-column=active] .column-move')
        .boundingBox()
      const target = await page.locator('th[data-column=region]').boundingBox()
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
        ],
      })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: target.x + 4, y: target.y + target.height / 2 }],
      })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      assert.deepEqual(await headers(), ['active', 'region', 'revenue'])
      assert.equal(await page.locator('th[aria-sort="none"]').count(), 3)
      assert.equal(
        await csv(),
        'Active,Region,Revenue\r\ntrue,West,42\r\nfalse,East,7\r\ntrue,North,\r\n',
      )
    } finally {
      await cdp.detach()
    }
  })
  await test('Escape and query loading cancel a drag without changing order', async () => {
    const handle = await page
      .locator('th[data-column=active] .column-move')
      .boundingBox()
    const target = await page.locator('th[data-column=region]').boundingBox()
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(target.x + 4, target.y + target.height / 2)
    assert.equal(await page.locator('[data-column-drop]').count(), 1)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    assert.deepEqual(await headers(), ['region', 'revenue', 'active'])
    assert.equal(await page.locator('[data-column-drop]').count(), 0)
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(target.x + 4, target.y + target.height / 2)
    await publish({ status: 'loading' })
    await page.mouse.up()
    await page.evaluate(() =>
      window.analyticsFixture.publish({
        status: 'ready',
        result: window.analyticsFixture.sales,
      }),
    )
    assert.deepEqual(await headers(), ['region', 'revenue', 'active'])
    assert.equal(await page.locator('[data-column-drop]').count(), 0)
  })
  await test('Initial loading, empty records and zero columns render without errors', async () => {
    await start({ status: 'loading' })
    assert.equal(
      await page
        .getByRole('button', { name: 'Export CSV', exact: true })
        .count(),
      0,
    )
    await publish({
      status: 'ready',
      result: {
        key: 'empty',
        columns: [{ id: 'value', label: 'Value' }],
        rows: [],
      },
    })
    assert.equal(await csv(), 'Value\r\n')
    await publish({
      status: 'ready',
      result: { key: 'zero', columns: [], rows: [] },
    })
    assert.equal(
      await page
        .getByRole('button', { name: 'Export CSV', exact: true })
        .isDisabled(),
      true,
    )
  })
  await test('Keyboard controls and narrow screens remain usable', async () => {
    await page.getByRole('button', { name: 'Sort Region', exact: true }).focus()
    await page.keyboard.press('Enter')
    assert.deepEqual(await rows(), ['east', 'north', 'west'])
    await page.setViewportSize({ width: 390, height: 800 })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    )
    await page.setViewportSize({ width: 1280, height: 900 })
    const stale = await page
      .getByRole('button', { name: 'Export CSV', exact: true })
      .elementHandle()
    await page.evaluate(() => window.analyticsFixture.stop())
    assert.equal(await page.locator('#root').textContent(), '')
    await stale.evaluate((node) => node.click())
    assert.equal(await page.evaluate(() => window.liveCsvUrls.size), 0)
  })
  report.diagnostics = await page.evaluate(() =>
    window.analyticsFixture.diagnostics(),
  )
  // Host load affects duration, not correctness.
  report.timingDiagnostics = report.diagnostics.filter(
    (event) => event.code === 'HOT_SCOPE_TIME',
  )
  report.diagnostics = report.diagnostics.filter(
    (event) => event.code !== 'HOT_SCOPE_TIME',
  )
  assert.deepEqual(report.diagnostics, [])
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, [])
} catch (error) {
  report.failure = error.stack
  process.exitCode = 1
} finally {
  await browser?.close()
  await new Promise((done) => server.close(done))
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
