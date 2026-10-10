import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname } from 'node:path'
import { loadavg } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

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
    /table-core|@tanstack\/store|virtual-core|zod\/|createEditing|solid-form|kobalte/.test(
      path,
    ),
  ),
)
report.moduleAudit = true
const server = createServer(async (request, response) => {
  try {
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
      .locator('tbody tr')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.row))
  const headers = () =>
    page
      .locator('thead th')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.column))
  async function filter(name, value) {
    await page
      .getByRole('button', { name: `Filter ${name}`, exact: true })
      .click()
    await page
      .getByRole('textbox', { name: `Filter ${name}`, exact: true })
      .fill(value)
    await page
      .getByRole('textbox', { name: `Filter ${name}`, exact: true })
      .press('Enter')
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
    console.log(`Analytics: ${name}`)
    await start()
    await run()
    report.cases.push({ name, status: 'passed' })
  }

  await test('Runtime columns and scalar cells are read-only', async () => {
    assert.deepEqual(await headers(), ['region', 'revenue', 'active'])
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
  await test('Numeric sorting and filters control export membership and order', async () => {
    await page
      .getByRole('button', { name: 'Sort Revenue', exact: true })
      .click()
    assert.deepEqual(await rows(), ['east', 'west', 'north'])
    await filter('Active', 'true')
    assert.deepEqual(await rows(), ['west', 'north'])
    assert.equal(
      await csv(),
      'Region,Revenue,Active\r\nWest,42,true\r\nNorth,,true\r\n',
    )
    await page.getByLabel('Search results', { exact: true }).fill('north')
    assert.deepEqual(await rows(), ['north'])
    assert.equal(await csv(), 'Region,Revenue,Active\r\nNorth,,true\r\n')
  })
  await test('Display labels, visibility and order control headers without changing query data', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await page
      .getByLabel('Header for revenue', { exact: true })
      .fill('Net, "€"')
    await page
      .getByRole('button', { name: 'Move revenue earlier', exact: true })
      .click()
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
  await test('Empty filtered results export headers and hidden columns disable export', async () => {
    await page
      .getByLabel('Search results', { exact: true })
      .fill('no matching record')
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
    await page.getByLabel('Header for revenue', { exact: true }).fill('Amount')
    await filter('Region', 'east')
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
    assert.equal(await page.locator('tbody tr').count(), 0)
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
  await test('Different query or schema resets display choices and stale filters', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await page.getByLabel('Header for revenue', { exact: true }).fill('Amount')
    await page.getByLabel('Show Active', { exact: true }).uncheck()
    await filter('Region', 'west')
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
