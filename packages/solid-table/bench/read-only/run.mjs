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
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-read-only-browser.json'
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
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => Boolean(window.readOnlyFixture))
  const rows = () =>
    page
      .locator('tr[data-row]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.row))
  async function test(name, run) {
    await page.evaluate(() => window.readOnlyFixture.start())
    await run()
    report.cases.push({ name, status: 'passed' })
    console.log(`PASS ${name}`)
  }
  await test('Read-only sorting uses numeric values and exposes no editing controls', async () => {
    assert.equal(await page.getByRole('button', { name: /^Save/ }).count(), 0)
    assert.equal(
      await page
        .getByRole('combobox', { name: 'Save mode', exact: true })
        .count(),
      0,
    )
    assert.equal(
      await page.locator('tbody input, tbody select, [data-editor]').count(),
      0,
    )
    await page
      .getByRole('button', { name: 'Sort by Amount', exact: true })
      .click()
    assert.deepEqual(await rows(), ['b', 'c', 'a'])
    await page
      .getByRole('button', { name: 'Sort by Amount', exact: true })
      .click()
    assert.deepEqual(await rows(), ['a', 'c', 'b'])
  })
  await test('Column filters and search process application records', async () => {
    await page
      .getByRole('textbox', { name: 'Filter Category', exact: true })
      .fill('West')
    assert.deepEqual(await rows(), ['a', 'c'])
    await page
      .getByRole('searchbox', { name: 'Search all columns', exact: true })
      .fill('Chair')
    assert.deepEqual(await rows(), ['c'])
    await page
      .getByRole('button', { name: 'Clear search', exact: true })
      .click()
    assert.deepEqual(await rows(), ['a', 'c'])
    await page
      .getByRole('button', { name: 'Clear Category filter', exact: true })
      .click()
    assert.deepEqual(await rows(), ['a', 'b', 'c'])
  })
  await test('Nested grouping, expansion, ordering and filtered summaries work without editing', async () => {
    await page
      .getByRole('combobox', { name: 'Add grouping', exact: true })
      .selectOption('category')
    assert.equal(await page.locator('tr[data-group]').count(), 2)
    const west = page.locator('tr[data-group]').filter({
      has: page.getByRole('button', {
        name: 'Expand Category: West',
        exact: true,
      }),
    })
    assert.equal(
      await west.locator('[data-group-summary="amount"]').textContent(),
      '54',
    )
    await page
      .getByRole('combobox', { name: 'Order Category groups', exact: true })
      .selectOption('value:asc')
    assert.deepEqual(
      await page.locator('tr[data-group] button').allTextContents(),
      ['▸ East', '▸ West'],
    )
    await page
      .getByRole('button', { name: 'Expand Category: West', exact: true })
      .click()
    assert.deepEqual(await rows(), ['a', 'c'])
    await page
      .getByRole('combobox', { name: 'Add grouping', exact: true })
      .selectOption('name')
    await page
      .getByRole('button', { name: 'Expand all groups', exact: true })
      .click()
    assert.deepEqual(await rows(), ['b', 'a', 'c'])
    await page
      .getByRole('textbox', { name: 'Filter Name', exact: true })
      .fill('Desk')
    assert.deepEqual(await rows(), ['a'])
    assert.equal(
      await page
        .locator('tr[data-group]')
        .first()
        .locator('[data-group-summary="amount"]')
        .textContent(),
      '42',
    )
    await page
      .getByRole('button', { name: 'Clear grouping', exact: true })
      .click()
    assert.deepEqual(await rows(), ['a'])
  })
  await test('Display controls and application replacements preserve table state', async () => {
    await page.getByText('Display columns', { exact: true }).click()
    await page.getByLabel('Show Category', { exact: true }).uncheck()
    await page
      .getByRole('button', { name: 'Move Amount column', exact: true })
      .focus()
    await page.keyboard.press('Home')
    assert.deepEqual(
      await page
        .locator('thead th')
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.column)),
      ['amount', 'name'],
    )
    await page
      .getByRole('button', { name: 'Sort by Amount', exact: true })
      .click()
    await page.evaluate(() =>
      window.readOnlyFixture.replace([
        {
          id: 'a',
          values: { category: 'West', name: 'Desk updated', amount: 1 },
        },
        { id: 'd', values: { category: 'North', name: 'Shelf', amount: 5 } },
      ]),
    )
    assert.deepEqual(await rows(), ['a', 'd'])
    assert.equal(
      await page.locator('tr[data-row="a"] [data-column="name"]').textContent(),
      'Desk updated',
    )
    assert.equal(
      await page.getByLabel('Show Category', { exact: true }).isChecked(),
      false,
    )
  })
  await test('Empty filtered and source results remain distinct and disposal releases the DOM', async () => {
    await page
      .getByRole('searchbox', { name: 'Search all columns', exact: true })
      .fill('missing')
    assert.equal(
      await page
        .getByText('No records match your search or filters.', { exact: true })
        .isVisible(),
      true,
    )
    await page.evaluate(() => window.readOnlyFixture.replace([]))
    assert.equal(
      await page.getByText('No records yet.', { exact: true }).isVisible(),
      true,
    )
    await page.setViewportSize({ width: 390, height: 800 })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    )
    await page.evaluate(() => window.readOnlyFixture.stop())
    assert.equal(await page.locator('#root').textContent(), '')
  })
  report.diagnostics = await page.evaluate(() =>
    window.readOnlyFixture.diagnostics(),
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
