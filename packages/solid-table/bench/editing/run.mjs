import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadavg } from 'node:os'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from '@playwright/test'
import { editingLockCases, editingLockWorkload } from './editing-lock-cases.mjs'
import { groupingProfile } from './grouping-profile.mjs'
import { subtableCases, subtableWorkload } from './subtable-cases.mjs'
import { groupingCases } from './grouping-cases.mjs'
import { aggregateCases } from './aggregate-cases.mjs'
import { resizeCases, resizeWorkload } from './resize-cases.mjs'
import { reorderCases, reorderWorkload } from './reorder-cases.mjs'

const directory = process.env.BENCH_DEVELOPMENT
  ? '.dist-dev'
  : process.env.BENCH_DISTRIBUTION
    ? '.dist-package'
    : '.dist'
const assets = fileURLToPath(new URL(`${directory}/`, import.meta.url))
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-editing-browser.json'
const externalUrl = process.env.BENCH_URL
if (!externalUrl) {
  const modules = JSON.parse(await readFile(`${assets}modules.json`, 'utf8'))
  assert.ok(
    !modules.some((path) =>
      /table-core|@tanstack\/store|virtual-core|solid-form|kobalte|sonner|lucide/.test(
        path,
      ),
    ),
  )
  assert.ok(modules.some((path) => /zod\/v4\/mini\//.test(path)))
  assert.ok(!modules.some((path) => /zod\/v4\/classic\//.test(path)))
}
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/favicon.ico') {
      response.writeHead(204).end()
      return
    }
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
if (!externalUrl)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const url = externalUrl ?? `http://127.0.0.1:${server.address().port}`
let browser
const report = {
  directory: externalUrl ? null : directory,
  url,
  moduleAudit: !externalUrl,
  hostLoad: loadavg(),
  cases: [],
  failures: [],
  benchmarks: [],
  errors: [],
  diagnostics: [],
  expectedDiagnostics: [],
  timingDiagnostics: [],
}
// Local filters, sorting, grouping and summaries scan candidate records.
// Record the breadth at these exact nodes; other diagnostics still fail.
const expectedFanIn = (event) =>
  ['WIDE_SCOPE_DEPS', 'HUGE_FAN_IN'].includes(event.code) &&
  [
    'createNativeFiltering.filteredIds',
    'createNativeTable.sortedIds',
    'createNativeGrouping.tree',
    'createNativeGrouping.roots',
    'createGroupView.value',
  ].includes(event.nodeName)
try {
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  if (process.env.BENCH_TIMEOUT)
    page.setDefaultTimeout(Number(process.env.BENCH_TIMEOUT))
  page.on('pageerror', (error) => {
    report.errors.push(error.stack)
    console.error(error.stack)
  })
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      const breadth = /^\[(WIDE_SCOPE_DEPS|HUGE_FAN_IN)\] memo "([^"]+)"/.exec(
        message.text(),
      )
      if (message.text().startsWith('[HOT_SCOPE_TIME]'))
        report.timingDiagnostics.push(message.text())
      else if (
        breadth &&
        expectedFanIn({ code: breadth[1], nodeName: breadth[2] })
      )
        report.expectedDiagnostics.push(message.text())
      else report.errors.push(message.text())
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await page.goto(url)
  const call = (name, ...args) =>
    page.evaluate(({ name, args }) => window.editingFixture[name](...args), {
      name,
      args,
    })
  const read = () => call('read')
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
  const start = async (size = 8, mode = 'row') => {
    await call('start', size, mode)
    await page.waitForFunction(() => window.editingFixture.ready())
    await settle()
  }
  const edit = (id = 'R0001', field = 'name') =>
    page.getByRole('button', { name: `Edit ${field} ${id}`, exact: true })
  const input = (id = 'R0001', field = 'name') =>
    page.getByRole('textbox', {
      name: `${field === 'name' ? 'Name' : 'Note'} ${id}`,
      exact: true,
    })
  const save = (id = 'R0001') =>
    page.getByRole('button', { name: `Save ${id}`, exact: true })
  const select = (id = 'R0001') =>
    page.getByRole('combobox', { name: `Priority ${id}`, exact: true })
  const focused = (locator) =>
    locator.evaluate((node) => node === document.activeElement)
  const idle = async () => {
    await page.waitForFunction(
      () =>
        !window.editingFixture.read().savingAll &&
        Object.values(window.editingFixture.read().drafts).every(
          (draft) => draft.status !== 'pending',
        ),
    )
    await settle()
  }
  async function record(name, test) {
    if (process.env.BENCH_SCENARIOS === '0') return
    if (
      process.env.BENCH_CASE_PATTERN &&
      !new RegExp(process.env.BENCH_CASE_PATTERN).test(name)
    )
      return
    try {
      await test()
      assert.deepEqual(report.errors, [])
    } catch (error) {
      report.failures.push({ name, error: String(error) })
      if (!process.env.BENCH_CONTINUE) throw error
      console.error(`FAIL ${name}: ${error}`)
      return
    }
    report.cases.push(name)
    console.log(`PASS ${name}`)
  }
  async function metrics() {
    await settle()
    await cdp.send('HeapProfiler.collectGarbage')
    return Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map(
        ({ name, value }) => [name, value],
      ),
    )
  }
  async function heap(name) {
    if (!process.env.BENCH_HEAPS) return
    await mkdir(process.env.BENCH_HEAPS, { recursive: true })
    const path = `${process.env.BENCH_HEAPS}/${name}.heapsnapshot`
    const stream = createWriteStream(path)
    const write = ({ chunk }) => stream.write(chunk)
    cdp.on('HeapProfiler.addHeapSnapshotChunk', write)
    try {
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    } finally {
      cdp.off('HeapProfiler.addHeapSnapshotChunk', write)
      stream.end()
      await finished(stream)
    }
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../inspect-heap.mjs', import.meta.url)),
      path,
    ])
    const summary = JSON.parse(await readFile(`${path}.summary.json`, 'utf8'))
    return Object.fromEntries(
      summary.categories.map(({ key, count }) => [key, count]),
    )
  }
  const filters = () =>
    page.getByRole('region', { name: 'Column filters', exact: true })
  const nameFilter = () =>
    filters().getByRole('textbox', { name: 'Filter saved names', exact: true })
  const noteFilter = () =>
    filters().getByRole('textbox', { name: 'Filter saved notes', exact: true })
  const priorityFilter = () =>
    filters().getByRole('combobox', { name: 'Filter priority', exact: true })
  const search = () =>
    page.getByRole('searchbox', { name: 'Search all columns', exact: true })
  const results = () =>
    page.getByRole('status', { name: 'Filter results', exact: true })
  const clearFilters = () =>
    page.getByRole('button', { name: 'Clear all filters', exact: true })
  await editingLockCases({
    page,
    start,
    call,
    read,
    record,
    settle,
    idle,
    edit,
    input,
    save,
  })
  await subtableCases({ page, start, call, read, record, settle, idle })
  await reorderCases({
    page,
    cdp,
    start,
    call,
    read,
    record,
    settle,
    edit,
    input,
    idle,
  })
  await resizeCases({
    page,
    cdp,
    start,
    call,
    read,
    record,
    settle,
    edit,
    input,
    idle,
  })
  await aggregateCases({
    page,
    start,
    call,
    read,
    record,
    settle,
    edit,
    input,
    idle,
  })
  await groupingCases({
    page,
    start,
    call,
    read,
    record,
    settle,
    idle,
    edit,
    input,
    save,
    select,
    focused,
  })
  await record(
    'external column filters compose and clear independently',
    async () => {
      await start(12)
      await call('patch', 'R0001', { priority: 'high' })
      await call('patch', 'R0002', { priority: 'low' })
      await nameFilter().fill('  RECORD 000  ')
      await noteFilter().fill('NOTE 1')
      await priorityFilter().selectOption('high')
      await settle()
      assert.deepEqual((await read()).ids, ['R0001'])
      assert.equal((await read()).filters.length, 3)
      assert.match(await results().innerText(), /Showing 1 of 12 records/)
      await filters()
        .getByRole('button', { name: 'Clear Priority filter', exact: true })
        .click()
      await noteFilter().press('Escape')
      await settle()
      assert.equal((await read()).ids.length, 9)
      assert.equal((await read()).filters.length, 1)
      assert.ok(await focused(noteFilter()))
      await filters()
        .getByRole('textbox', { name: 'Filter record IDs', exact: true })
        .fill('R0002')
      await settle()
      assert.deepEqual((await read()).ids, ['R0002'])
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'filter placement and header sorting are independent controlled options',
    async () => {
      await start()
      await nameFilter().fill('0001')
      await page.getByText('Display options', { exact: true }).click()
      const placement = page.getByRole('combobox', {
        name: 'Column filter controls',
        exact: true,
      })
      await placement.selectOption('both')
      const header = page
        .locator('thead')
        .getByRole('textbox', { name: 'Filter saved names', exact: true })
      assert.equal(await header.inputValue(), '0001')
      await header.fill('0002')
      await settle()
      assert.equal(await nameFilter().inputValue(), '0002')
      assert.deepEqual((await read()).ids, ['R0002'])
      await page
        .getByRole('checkbox', { name: 'Header sorting', exact: true })
        .uncheck()
      assert.equal(
        await page
          .getByRole('button', { name: 'Sort by Name', exact: true })
          .count(),
        0,
      )
      await placement.selectOption('headers')
      assert.equal(await filters().count(), 0)
      assert.equal(await header.inputValue(), '0002')
      await placement.selectOption('none')
      assert.equal(await header.count(), 0)
      assert.deepEqual((await read()).ids, ['R0002'])
      await call('filter', 'name', '0003')
      await placement.selectOption('external')
      assert.equal(await nameFilter().inputValue(), '0003')
      await page
        .getByRole('checkbox', { name: 'Header sorting', exact: true })
        .check()
      await clearFilters().click()
      await page
        .getByRole('button', { name: 'Sort by Name', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Sort by Name', exact: true })
        .click()
      assert.equal((await read()).ids[0], 'R0008')
      assert.equal(await page.locator('th[aria-sort="descending"]').count(), 1)
      await page
        .getByRole('button', { name: 'Sort by Priority', exact: true })
        .click({ modifiers: ['Shift'] })
      assert.equal(await page.locator('th[aria-sort]').count(), 1)
      await call('localProcessing', false)
      assert.equal(await page.locator('th[aria-sort]').count(), 0)
    },
  )
  await record(
    'global search composes with column filters and has separate clearing',
    async () => {
      await start(12)
      await search().fill('  nOtE 1  ')
      await settle()
      assert.deepEqual((await read()).ids, ['R0001', 'R0010', 'R0011', 'R0012'])
      await nameFilter().fill('Record 001')
      await settle()
      assert.deepEqual((await read()).ids, ['R0010', 'R0011', 'R0012'])
      await search().press('Escape')
      await settle()
      assert.equal(await search().inputValue(), '')
      assert.equal(await nameFilter().inputValue(), 'Record 001')
      assert.ok(await focused(search()))
      await call('search', 'Note 12')
      assert.equal(await search().inputValue(), 'Note 12')
      await call('controls', { globalSearch: false })
      assert.equal(await search().count(), 0)
      assert.deepEqual((await read()).ids, ['R0012'])
      await call('controls', { globalSearch: true })
      assert.equal(await search().inputValue(), 'Note 12')
      await page
        .getByRole('button', { name: 'Clear search', exact: true })
        .click()
      assert.equal((await read()).filters.length, 1)
    },
  )
  await record(
    'empty filter results and an empty source have distinct recovery states',
    async () => {
      await start()
      await noteFilter().fill('missing')
      assert.match(await results().innerText(), /Showing 0 of 8 records/)
      assert.equal(
        await page
          .getByText('No records match your search or filters.', {
            exact: true,
          })
          .count(),
        1,
      )
      await page
        .getByRole('button', { name: 'Show all records', exact: true })
        .click()
      await settle()
      assert.equal((await read()).ids.length, 8)
      assert.deepEqual((await read()).filters, [])
      await start(0)
      assert.equal(
        await page.getByText('No records yet.', { exact: true }).count(),
        1,
      )
      assert.equal(
        await page
          .getByRole('button', { name: 'Show all records', exact: true })
          .count(),
        0,
      )
    },
  )
  await record(
    'search excludes hidden or non-searchable columns while explicit filters stay active',
    async () => {
      await start()
      await search().fill('R0001')
      assert.deepEqual((await read()).ids, [])
      await search().fill('Note 1')
      assert.deepEqual((await read()).ids, ['R0001'])
      await call('visibility', 'note', false)
      assert.deepEqual((await read()).ids, [])
      assert.equal(
        await page
          .getByRole('button', { name: 'Sort by Note', exact: true })
          .count(),
        0,
      )
      await search().fill('')
      await noteFilter().fill('Note 2')
      assert.deepEqual((await read()).ids, ['R0002'])
      await call('visibility', 'note', true)
      assert.deepEqual((await read()).ids, ['R0002'])
    },
  )
  await record(
    'manual processing disables local controls without losing their configuration',
    async () => {
      await start()
      await nameFilter().fill('0001')
      await search().fill('Note 1')
      await call('localProcessing', false)
      assert.equal((await read()).ids.length, 8)
      assert.equal(await nameFilter().isDisabled(), true)
      assert.equal(await search().isDisabled(), true)
      assert.equal(await priorityFilter().isDisabled(), true)
      assert.equal(await clearFilters().isDisabled(), true)
      assert.equal(
        await page
          .getByRole('button', { name: 'Sort by Name', exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(await nameFilter().inputValue(), '0001')
      await call('localProcessing', true)
      assert.deepEqual((await read()).ids, ['R0001'])
      assert.equal(await search().inputValue(), 'Note 1')
    },
  )
  await record(
    'filter composition waits for committed input and does not clear on composition Escape',
    async () => {
      await start()
      await nameFilter().evaluate((node) => {
        node.dispatchEvent(
          new CompositionEvent('compositionstart', { bubbles: true }),
        )
        node.value = '0001'
        node.dispatchEvent(
          new InputEvent('input', { bubbles: true, isComposing: true }),
        )
        node.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            isComposing: true,
          }),
        )
      })
      assert.equal((await read()).filters.length, 0)
      assert.equal((await read()).ids.length, 8)
      await nameFilter().dispatchEvent('compositionend')
      await settle()
      assert.deepEqual((await read()).ids, ['R0001'])
      await nameFilter().press('Escape')
      await settle()
      assert.equal((await read()).ids.length, 8)
    },
  )
  await record(
    'search and column filters cannot hide an active draft',
    async () => {
      await start()
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Unique draft')
      assert.equal(await search().isDisabled(), true)
      assert.equal(await noteFilter().isDisabled(), true)
      await call('search', 'Note 2')
      await call('filter', 'note', 'Note 2')
      await settle()
      assert.equal(await search().inputValue(), '')
      assert.equal(await noteFilter().inputValue(), '')
      assert.equal(await input('R0001', 'note').inputValue(), 'Unique draft')
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'Save all refreshes search membership only after edits resolve',
    async () => {
      await start(8, 'table')
      await search().fill('Note 1')
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('New searchable value')
      await input('R0001', 'note').press('Enter')
      assert.deepEqual((await read()).ids, ['R0001'])
      await page.getByRole('button', { name: 'Save all', exact: true }).click()
      await idle()
      assert.deepEqual((await read()).ids, [])
      assert.deepEqual((await read()).drafts, {})
      assert.equal((await read()).counts.requests, 1)
      await search().fill('New searchable value')
      assert.deepEqual((await read()).ids, ['R0001'])
    },
  )
  await record(
    'saving a row out of search returns focus to the search control',
    async () => {
      await start()
      await search().fill('Note 1')
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('No longer matches')
      await input('R0001', 'note').press('Enter')
      await idle()
      assert.deepEqual((await read()).ids, [])
      assert.ok(await focused(search()))
      assert.deepEqual((await read()).drafts, {})
    },
  )
  await record(
    'equivalent filter and search results retain row views',
    async () => {
      await start()
      const before = await read()
      await page.locator('tr[data-row="R0001"]').evaluate((node) => {
        node.dataset.retained = 'true'
      })
      for (const value of ['r', 're', 'rec', 'reco', 'record']) {
        await nameFilter().fill(value)
        await settle()
      }
      for (const value of ['n', 'no', 'not', 'note', 'note ']) {
        await search().fill(value)
        await settle()
      }
      const after = await read()
      assert.equal(after.counts.views, before.counts.views)
      assert.equal(after.counts.cells, before.counts.cells)
      assert.equal(after.counts.validations, 0)
      assert.equal(after.counts.requests, 0)
      assert.equal(
        await page
          .locator('tr[data-row="R0001"]')
          .getAttribute('data-retained'),
        'true',
      )
    },
  )
  await record(
    'an outside pointer does not move the clicked row before its click reaches the editor',
    async () => {
      await start()
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Retained draft')
      const target = edit('R0002', 'priority')
      await target.scrollIntoViewIfNeeded()
      const before = await target.boundingBox()
      await page.mouse.move(before.x + 20, before.y + 15)
      await page.mouse.down()
      await settle()
      assert.deepEqual(await target.boundingBox(), before)
      await page.mouse.up()
      await settle()
      assert.equal(await select('R0002').count(), 1)
      assert.ok(await focused(select('R0002')))
      assert.equal((await read()).drafts.R0001.note, 'Retained draft')
    },
  )
  await record(
    'repeated visible drafts keep the view stable until Save all finishes',
    async () => {
      await start(12, 'table')
      for (let index = 1; index <= 8; index++) {
        const id = `R${String(index).padStart(4, '0')}`
        await edit(id, 'note').click()
        await input(id, 'note').fill(`Draft ${index}`)
        await input(id, 'note').press('Enter')
        await settle()
      }
      assert.equal(
        await page
          .getByRole('complementary', { name: 'Hidden drafts' })
          .count(),
        0,
      )
      const before = (await read()).ids
      await call('filter', 'name', '0001')
      assert.deepEqual((await read()).ids, before)
      assert.equal(Object.keys((await read()).drafts).length, 8)
      await page.getByRole('button', { name: 'Save all', exact: true }).click()
      await idle()
      assert.equal((await read()).counts.requests, 8)
      assert.deepEqual((await read()).drafts, {})
      await call('filter', 'name', '0001')
      assert.deepEqual((await read()).ids, ['R0001'])
    },
  )
  await record(
    'focus exit collapses editors and marks only changed cells without saving',
    async () => {
      await start()
      await edit().click()
      await input().fill('Draft on display')
      await input('R0001', 'note').click()
      assert.equal(await input().count(), 1)
      await page.getByRole('heading', { name: 'Table' }).click()
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal(await save().count(), 0)
      assert.equal(
        await edit().locator('[data-value]').innerText(),
        'Draft on display',
      )
      assert.equal(await edit().getAttribute('data-edited'), 'true')
      assert.equal(
        await edit('R0001', 'note').getAttribute('data-edited'),
        null,
      )
      assert.equal(await page.locator('.edited-marker').count(), 1)
      assert.equal((await read()).sample[0].name, 'Record 0001')
      assert.equal((await read()).counts.requests, 0)
      await edit('R0001', 'note').click()
      assert.equal(await input().inputValue(), 'Draft on display')
      assert.ok(await focused(input('R0001', 'note')))
      await page
        .getByRole('button', { name: 'Cancel R0001', exact: true })
        .click()
      await settle()
      assert.equal(await edit().getAttribute('data-edited'), null)
      assert.equal(
        await edit().locator('[data-value]').innerText(),
        'Record 0001',
      )
    },
  )
  await record(
    'Tab leaves a row without saving and Shift+Tab can return to its collapsed cell',
    async () => {
      await start()
      await edit('R0001', 'priority').click()
      await select().selectOption('high')
      await page.keyboard.press('Tab')
      assert.ok(await focused(save()))
      await page.keyboard.press('Tab')
      assert.ok(
        await focused(
          page.getByRole('button', { name: 'Cancel R0001', exact: true }),
        ),
      )
      await page.keyboard.press('Tab')
      await settle()
      assert.ok(await focused(edit('R0002')))
      assert.equal(await select().count(), 0)
      assert.equal(
        await edit('R0001', 'priority').getAttribute('data-edited'),
        'true',
      )
      await page.keyboard.press('Shift+Tab')
      assert.ok(await focused(edit('R0001', 'priority')))
      await page.keyboard.press('Enter')
      assert.equal(await select().inputValue(), 'high')
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'unchanged visits and reverted edits leave no draft or marker',
    async () => {
      await start()
      await edit().click()
      await page.getByRole('heading', { name: 'Table' }).click()
      await settle()
      assert.deepEqual((await read()).drafts, {})
      await edit().click()
      await input().fill('Temporary')
      await input().fill('Record 0001')
      await input().evaluate((node) => node.blur())
      await settle()
      assert.equal(await input().count(), 0)
      assert.deepEqual((await read()).drafts, {})
      assert.equal(await page.locator('.edited-marker').count(), 0)
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'invalid drafts retain errors while collapsed and resume for correction',
    async () => {
      await start()
      await edit().click()
      await input().fill('')
      await save().click()
      await idle()
      await page.getByRole('heading', { name: 'Table' }).click()
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal(await edit().getAttribute('data-edited'), 'true')
      assert.match(
        await page.locator('[id$="-error-R0001-name"]').innerText(),
        /Enter a name/,
      )
      await edit().click()
      assert.equal(await input().inputValue(), '')
      assert.equal(await input().getAttribute('aria-invalid'), 'true')
      await input().fill('Corrected')
      await input().press('Enter')
      await idle()
      assert.equal(await edit().getAttribute('data-edited'), null)
      assert.equal((await read()).sample[0].name, 'Corrected')
    },
  )
  await record(
    'keyboard entry, native Tab and Shift+Tab, Escape, and no navigation saves',
    async () => {
      await start()
      await edit().focus()
      await page.keyboard.press('Enter')
      assert.ok(await focused(input()))
      await input().fill('Draft name')
      await page.keyboard.press('Tab')
      assert.ok(await focused(input('R0001', 'note')))
      await input('R0001', 'note').fill('Draft note')
      await page.keyboard.press('Shift+Tab')
      assert.ok(await focused(input()))
      let value = await read()
      assert.equal(value.counts.requests, 0)
      assert.equal(value.sample[0].name, 'Record 0001')
      assert.equal(value.drafts.R0001.note, 'Draft note')
      await page.keyboard.press('Escape')
      await settle()
      value = await read()
      assert.deepEqual(value.drafts, {})
      assert.ok(await focused(edit()))
      assert.equal(value.sample[0].note, 'Note 1')
      await edit('R0008', 'priority').focus()
      await page.keyboard.press('Tab')
      assert.ok(await focused(page.locator('[data-subtable-toggle="R0008"]')))
      await page.keyboard.press('Tab')
      assert.ok(
        await focused(
          page.getByRole('button', { name: 'After table', exact: true }),
        ),
      )
    },
  )
  await record(
    'native dropdown keys and Tab preserve the draft until explicit Cancel',
    async () => {
      await start()
      await edit('R0001', 'priority').click()
      assert.ok(await focused(select()))
      assert.equal(await select().inputValue(), 'normal')
      await page.keyboard.press('ArrowDown')
      await settle()
      assert.equal(await select().inputValue(), 'high')
      await page.keyboard.press('Enter')
      await page.keyboard.press('Escape')
      await settle()
      let value = await read()
      assert.equal(value.drafts.R0001.priority, 'high')
      assert.equal(value.sample[0].priority, 'normal')
      assert.equal(value.counts.requests, 0)
      await page.keyboard.press('Tab')
      assert.ok(await focused(save()))
      await page.keyboard.press('Shift+Tab')
      assert.ok(await focused(select()))
      await page.keyboard.press('Shift+Tab')
      assert.ok(await focused(input('R0001', 'note')))
      await select().focus()
      await page
        .getByRole('button', { name: 'Cancel R0001', exact: true })
        .click()
      await settle()
      value = await read()
      assert.deepEqual(value.drafts, {})
      assert.equal(value.sample[0].priority, 'normal')
      assert.equal(value.counts.requests, 0)
      assert.ok(await focused(edit('R0001', 'priority')))
    },
  )
  await record(
    'dropdown save sends only its changed value and restores the logical cell focus',
    async () => {
      await start()
      await call('remember', 'R0001')
      const before = await read()
      await edit('R0001', 'priority').click()
      await select().selectOption('low')
      assert.equal((await read()).counts.requests, 0)
      await save().click()
      await idle()
      const value = await read()
      assert.deepEqual(value.sent, [
        {
          id: 'R0001',
          expectedRevision: '9007199254740993',
          changes: { priority: 'low' },
        },
      ])
      assert.equal(value.sample[0].priority, 'low')
      assert.equal(value.identity, true)
      assert.equal(value.counts.views, before.counts.views)
      assert.equal(value.counts.cells, before.counts.cells)
      assert.ok(await focused(edit('R0001', 'priority')))
    },
  )
  await record(
    'a pending dropdown save disables the control without blocking other rows',
    async () => {
      await start()
      await edit('R0001', 'priority').click()
      await select().selectOption('high')
      await call('fault', 'hold')
      await save().click()
      await settle()
      assert.equal(await select().isDisabled(), true)
      assert.equal(await save().isDisabled(), true)
      await call('saveTwice', 'R0001')
      assert.equal((await read()).counts.requests, 1)
      await edit('R0002', 'priority').click()
      await select('R0002').selectOption('low')
      await call('release')
      await idle()
      const value = await read()
      assert.equal(value.sample[0].priority, 'high')
      assert.equal(value.sample[1].priority, 'normal')
      assert.equal(value.drafts.R0002.priority, 'low')
      assert.ok(await focused(select('R0002')))
    },
  )
  await record(
    'dropdown validation rejects unknown values and allows a corrected option',
    async () => {
      await start()
      await call('patch', 'R0001', { priority: 'legacy' })
      await edit('R0001', 'priority').click()
      await save().click()
      await idle()
      assert.equal((await read()).counts.requests, 0)
      assert.equal((await read()).drafts.R0001.priority, 'legacy')
      assert.equal(await select().getAttribute('aria-invalid'), 'true')
      assert.match(
        await select().getAttribute('aria-describedby'),
        /error-R0001-priority/,
      )
      assert.match(
        await page.locator('[id$="-error-R0001-priority"]').innerText(),
        /Choose Low/,
      )
      assert.ok(await focused(select()))
      await select().selectOption('normal')
      await settle()
      assert.equal(await select().getAttribute('aria-invalid'), null)
      await save().click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'normal')
      assert.equal((await read()).counts.requests, 1)
    },
  )
  await record(
    'dropdown edits keep row identity and reject sorting or filter removal',
    async () => {
      await start()
      await call('remember', 'R0001')
      await edit('R0001', 'priority').click()
      await select().selectOption('low')
      const original = await page.locator('[data-row="R0001"]').elementHandle()
      await call('sorting', [{ id: 'name', desc: true }])
      await call('filter', 'name', '0002')
      await settle()
      assert.equal((await read()).ids[0], 'R0001')
      assert.equal((await read()).identity, true)
      assert.equal(await original.evaluate((n) => n.isConnected), true)
      assert.equal(await select().inputValue(), 'low')
      assert.equal((await read()).counts.requests, 0)
      await save().click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'low')
      assert.ok(await focused(edit('R0001', 'priority')))
      await original.dispose()
    },
  )
  await record(
    'a concurrent dropdown update preserves the draft and Cancel reveals the newer value',
    async () => {
      await start()
      await edit('R0001', 'priority').click()
      await select().selectOption('high')
      await call('fault', 'hold')
      await save().click()
      await call('patch', 'R0001', { priority: 'low' })
      await call('release')
      await idle()
      const value = await read()
      assert.equal(value.sample[0].priority, 'low')
      assert.equal(value.drafts.R0001.priority, 'high')
      assert.equal(value.drafts.R0001.status, 'conflict')
      assert.equal(await select().inputValue(), 'high')
      await page
        .getByRole('button', { name: 'Cancel R0001', exact: true })
        .click()
      await edit('R0001', 'priority').click()
      assert.equal(await select().inputValue(), 'low')
    },
  )
  await record(
    'row save sends only changed fields and exact revision, retains records and views',
    async () => {
      await start()
      await call('remember', 'R0001')
      const before = await read()
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Accepted note')
      await page.keyboard.press('Enter')
      await idle()
      const value = await read()
      assert.equal(value.sample[0].note, 'Accepted note')
      assert.equal(value.sample[0].revision, '9007199254740994')
      assert.deepEqual(value.sent, [
        {
          id: 'R0001',
          expectedRevision: '9007199254740993',
          changes: { note: 'Accepted note' },
        },
      ])
      assert.equal(value.identity, true)
      assert.equal(value.counts.views, before.counts.views)
      assert.equal(value.counts.cells, before.counts.cells)
      assert.ok(await focused(edit('R0001', 'note')))
    },
  )
  await record(
    'multiple row drafts survive blur and one row saves all edited fields',
    async () => {
      await start()
      await edit().click()
      await input().fill('First name')
      await input('R0001', 'note').fill('First note')
      await select().focus()
      await select().selectOption('high')
      await edit('R0002').click()
      await input('R0002').fill('Second name')
      assert.equal((await read()).counts.requests, 0)
      assert.equal(await input().count(), 0)
      await edit('R0001', 'priority').click()
      assert.equal(await input('R0002').count(), 0)
      await save().click()
      await idle()
      const value = await read()
      assert.deepEqual(value.sent[0].changes, {
        name: 'First name',
        note: 'First note',
        priority: 'high',
      })
      assert.equal(value.drafts.R0002.name, 'Second name')
      assert.equal(value.sample[1].name, 'Record 0002')
      assert.ok(await focused(edit('R0001', 'priority')))
    },
  )
  await record(
    'pending save guards duplicates and never steals later focus',
    async () => {
      await start()
      await edit().click()
      await input().fill('Held name')
      await call('fault', 'hold')
      await save().click()
      await page.waitForFunction(
        () => window.editingFixture.read().drafts.R0001?.status === 'pending',
      )
      assert.equal(await input().getAttribute('readonly'), '')
      assert.equal(await save().isDisabled(), true)
      assert.equal(
        await page
          .getByRole('button', { name: 'Cancel R0001', exact: true })
          .isDisabled(),
        true,
      )
      await call('saveTwice', 'R0001')
      assert.equal((await read()).counts.requests, 1)
      await edit('R0002').click()
      await input('R0002').fill('Second draft')
      assert.equal(await input().count(), 0)
      assert.equal(await edit().isDisabled(), true)
      await call('release')
      await idle()
      assert.ok(await focused(input('R0002')))
      assert.equal((await read()).sample[0].name, 'Held name')
      assert.equal(await edit().getAttribute('data-edited'), null)
    },
  )
  await record(
    'pending save does not refocus after a click on page text',
    async () => {
      await start()
      await edit().click()
      await input().fill('Saved later')
      await call('fault', 'hold')
      await save().click()
      await page.getByRole('heading', { name: 'Table', exact: true }).click()
      assert.equal(await input().count(), 0)
      await call('release')
      await idle()
      assert.equal(await focused(edit()), false)
      assert.equal((await read()).sample[0].name, 'Saved later')
    },
  )
  await record(
    'unchanged save sends nothing, and blank-name refusal preserves input',
    async () => {
      await start()
      await edit().click()
      await save().click()
      await idle()
      assert.equal((await read()).counts.requests, 0)
      await edit().click()
      await input().fill('   ')
      await page.keyboard.press('Enter')
      await idle()
      assert.equal((await read()).counts.requests, 0)
      assert.match(
        await page.locator('[id$="-error-R0001-name"]').innerText(),
        /Enter a name/,
      )
      assert.equal(await input().getAttribute('aria-invalid'), 'true')
      assert.match(
        await input().getAttribute('aria-describedby'),
        /error-R0001-name/,
      )
      assert.ok(await focused(input()))
      await input().fill('Valid name')
      await settle()
      assert.equal(await input().getAttribute('aria-invalid'), null)
      await page.keyboard.press('Enter')
      await idle()
      assert.equal((await read()).sample[0].name, 'Valid name')
    },
  )
  await record(
    'Zod field errors survive other field changes and focus the first invalid editor',
    async () => {
      await start()
      assert.equal((await read()).counts.validations, 0)
      await edit().click()
      await input().fill('n'.repeat(81))
      await input('R0001', 'note').fill('t'.repeat(241))
      assert.equal((await read()).counts.validations, 0)
      await save().click()
      await idle()
      let value = await read()
      assert.equal(value.counts.requests, 0)
      assert.equal(value.counts.validations, 1)
      assert.equal(value.sample[0].name, 'Record 0001')
      assert.equal(value.drafts.R0001.name.length, 81)
      assert.equal(await input().getAttribute('aria-invalid'), 'true')
      assert.equal(
        await input('R0001', 'note').getAttribute('aria-invalid'),
        'true',
      )
      assert.ok(await focused(input()))
      await input().fill('Corrected name')
      await settle()
      assert.equal(await input().getAttribute('aria-invalid'), null)
      assert.match(
        await page.locator('[id$="-error-R0001-note"]').innerText(),
        /240/,
      )
      await page.keyboard.press('Enter')
      await idle()
      assert.ok(await focused(input('R0001', 'note')))
      assert.equal((await read()).counts.requests, 0)
      await input('R0001', 'note').fill('Corrected note')
      await settle()
      assert.equal(
        await input('R0001', 'note').getAttribute('aria-invalid'),
        null,
      )
      await page.keyboard.press('Enter')
      await idle()
      value = await read()
      assert.equal(value.counts.requests, 1)
      assert.deepEqual(value.sent[0].changes, {
        name: 'Corrected name',
        note: 'Corrected note',
      })
      assert.equal(value.sample[0].note, 'Corrected note')
    },
  )
  for (const fault of [
    'refuse',
    'conflict',
    'uncertain',
    'throw',
    'wrong-id',
  ]) {
    await record(
      `${fault} preserves the draft and committed record`,
      async () => {
        await start()
        await edit().click()
        await input().fill('Preserved draft')
        await select().selectOption('high')
        await call('fault', fault)
        await save().click()
        await idle()
        const value = await read()
        assert.equal(value.drafts.R0001.name, 'Preserved draft')
        assert.equal(value.drafts.R0001.priority, 'high')
        assert.equal(value.sample[0].priority, 'normal')
        assert.equal(await select().inputValue(), 'high')
        assert.equal(value.sample[0].name, 'Record 0001')
        assert.ok(value.drafts.R0001.message)
        assert.equal(await save().isEnabled(), true)
        await page.getByRole('heading', { name: 'Table' }).click()
        await settle()
        assert.equal(await input().count(), 0)
        assert.equal(await edit().getAttribute('data-edited'), 'true')
        assert.equal(
          await page.locator('[id$="-message-R0001"]').innerText(),
          value.drafts.R0001.message,
        )
        await edit('R0001', 'priority').click()
        assert.equal(await select().inputValue(), 'high')
        await page
          .getByRole('button', { name: 'Cancel R0001', exact: true })
          .click()
        await settle()
        assert.equal((await read()).sample[0].name, 'Record 0001')
      },
    )
  }
  await record(
    'concurrent revision before save refuses locally and Cancel reveals current data',
    async () => {
      await start()
      await edit().click()
      await input().fill('Old draft')
      await call('patch', 'R0001', { name: 'Newer name' })
      await save().click()
      await idle()
      assert.equal((await read()).counts.requests, 0)
      assert.match((await read()).drafts.R0001.message, /changed after editing/)
      await page
        .getByRole('button', { name: 'Cancel R0001', exact: true })
        .click()
      await settle()
      assert.match(await edit().innerText(), /Newer name/)
    },
  )
  await record(
    'concurrent revision during save prevents stale response application',
    async () => {
      await start()
      await edit().click()
      await input().fill('Pending name')
      await call('fault', 'hold')
      await save().click()
      await call('patch', 'R0001', { note: 'Newer note' })
      await call('release')
      await idle()
      const value = await read()
      assert.equal(value.sample[0].name, 'Record 0001')
      assert.equal(value.sample[0].note, 'Newer note')
      assert.match(value.drafts.R0001.message, /changed while saving/)
    },
  )
  await record(
    'pending removal rejects stale saves and removes the row after draft cancellation',
    async () => {
      await start()
      await edit().click()
      await input().fill('Removed draft')
      await call('fault', 'hold')
      await save().click()
      await call('remove', 'R0001')
      await call('release')
      await idle()
      let value = await read()
      assert.equal(value.ids.includes('R0001'), true)
      assert.equal(value.sample[0].name, 'Record 0001')
      assert.equal(value.drafts.R0001.name, 'Removed draft')
      assert.equal(value.drafts.R0001.status, 'conflict')
      if (!(await input().count())) await edit().click()
      await page
        .getByRole('button', { name: 'Cancel R0001', exact: true })
        .click()
      await settle()
      value = await read()
      assert.deepEqual(value.drafts, {})
      assert.equal(value.ids.includes('R0001'), false)
      assert.equal(
        value.sample.some((row) => row.id === 'R0001'),
        false,
      )
    },
  )
  await record(
    'sorting stays fixed during editing and refreshes after the last save',
    async () => {
      await start()
      await call('sorting', [{ id: 'name', desc: false }])
      await edit().click()
      await input().fill('ZZZ moved')
      await call('sorting', [{ id: 'name', desc: true }])
      await settle()
      assert.equal((await read()).ids[0], 'R0001')
      assert.equal(await input().inputValue(), 'ZZZ moved')
      await input().press('Enter')
      await idle()
      assert.equal((await read()).ids.at(-1), 'R0001')
      assert.ok(await focused(edit()))
      assert.equal((await read()).sample[0].name, 'ZZZ moved')
    },
  )
  await record(
    'collapsed drafts stay visible and can resume while filters are locked',
    async () => {
      await start()
      await edit().click()
      await input().fill('Visible draft')
      await page
        .getByRole('button', { name: 'After table', exact: true })
        .click()
      await call('filter', 'name', '0002')
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal((await read()).drafts.R0001.name, 'Visible draft')
      assert.equal((await read()).ids.length, 8)
      await edit().click()
      assert.equal(await input().inputValue(), 'Visible draft')
      assert.ok(await focused(input()))
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'saving out of the filter moves focus to the filter control',
    async () => {
      await start()
      const filter = page.getByRole('textbox', {
        name: 'Filter saved names',
        exact: true,
      })
      await filter.fill('0001')
      await edit().click()
      await input().fill('Renamed record')
      await input().press('Enter')
      await idle()
      assert.deepEqual((await read()).ids, [])
      assert.ok(await focused(filter))
    },
  )
  await record(
    'IME composition does not trigger Enter save or Escape cancel',
    async () => {
      await start()
      await edit().click()
      await input().fill('入力中')
      await input().dispatchEvent('keydown', {
        key: 'Enter',
        isComposing: true,
      })
      await input().dispatchEvent('keydown', {
        key: 'Escape',
        isComposing: true,
      })
      await input().dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })
      await settle()
      assert.equal((await read()).counts.requests, 0)
      assert.equal(await input().inputValue(), '入力中')
      await input().press('Enter')
      await idle()
      assert.equal((await read()).sample[0].name, '入力中')
    },
  )
  await record('same-turn duplicate saves send one request', async () => {
    await start()
    await edit().click()
    await input().fill('One request')
    await call('saveTwice', 'R0001')
    await idle()
    assert.equal((await read()).counts.requests, 1)
  })
  await record(
    'disposal aborts an outstanding save and removes all rows',
    async () => {
      await start()
      await edit().click()
      await input().fill('Disposed draft')
      await call('fault', 'hold')
      await save().click()
      await call('stop')
      await settle()
      assert.equal((await call('lastCounts')).aborted, 1)
      assert.equal(await page.locator('[data-row]').count(), 0)
      await start(3)
      assert.equal((await read()).sample[0].name, 'Record 0001')
    },
  )
  const mode = () =>
    page.getByRole('combobox', { name: 'Save mode', exact: true })
  const saveAll = () =>
    page.getByRole('button', { name: 'Save all', exact: true })
  await record(
    'global mode saves visible drafts with exact revisions while filters stay locked',
    async () => {
      await start(8, 'table')
      assert.equal(await mode().inputValue(), 'table')
      await edit().click()
      await input().fill('Global name')
      assert.equal(await save().count(), 0)
      await input().press('Enter')
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal((await read()).counts.requests, 0)
      await edit('R0002', 'priority').click()
      await select('R0002').selectOption('high')
      await call('filter', 'name', '0002')
      assert.equal((await read()).ids.length, 8)
      await saveAll().click()
      await idle()
      const value = await read()
      assert.deepEqual(value.drafts, {})
      assert.equal(value.sample[0].name, 'Global name')
      assert.equal(value.sample[1].priority, 'high')
      assert.deepEqual(value.sent, [
        {
          id: 'R0001',
          expectedRevision: '9007199254740993',
          changes: { name: 'Global name' },
        },
        {
          id: 'R0002',
          expectedRevision: '9007199254740993',
          changes: { priority: 'high' },
        },
      ])
      assert.match(
        await page.locator('.notice').innerText(),
        /Saved 2 rows. 0 failed/,
      )
      assert.ok(await focused(mode()))
    },
  )
  await record(
    'global validation blocks every request until all drafts are valid',
    async () => {
      await start(8, 'table')
      await edit().click()
      await input().fill('Valid draft')
      await edit('R0002').click()
      await input('R0002').fill('')
      await saveAll().click()
      await idle()
      let value = await read()
      assert.equal(value.counts.requests, 0)
      assert.equal(Object.keys(value.drafts).length, 2)
      assert.equal(value.counts.validations, 2)
      assert.match(
        await page.locator('.notice').innerText(),
        /Nothing saved. Correct 1 draft/,
      )
      assert.match(
        await page.locator('[id$="-error-R0002-name"]').innerText(),
        /Enter a name/,
      )
      await edit('R0002').click()
      await input('R0002').fill('Corrected draft')
      await input('R0002').press('Enter')
      await saveAll().click()
      await idle()
      value = await read()
      assert.equal(value.counts.requests, 2)
      assert.deepEqual(value.drafts, {})
    },
  )
  await record(
    'global partial failure keeps only the failed draft and retry does not resend success',
    async () => {
      await start(8, 'table')
      await edit().click()
      await input().fill('First draft')
      await edit('R0002').click()
      await input('R0002').fill('Second draft')
      await call('fault', 'refuse')
      await saveAll().click()
      await idle()
      let value = await read()
      assert.deepEqual(Object.keys(value.drafts), ['R0001'])
      assert.equal(value.sample[0].name, 'Record 0001')
      assert.equal(value.sample[1].name, 'Second draft')
      assert.match(
        await page.locator('.notice').innerText(),
        /Saved 1 row. 1 failed/,
      )
      await saveAll().click()
      await idle()
      value = await read()
      assert.equal(value.counts.requests, 3)
      assert.equal(value.sent[2].id, 'R0001')
      assert.equal(value.sample[1].revision, '9007199254740994')
      assert.deepEqual(value.drafts, {})
    },
  )
  await record(
    'pending global save rejects duplicates and preserves new drafts and later focus',
    async () => {
      await start(8, 'table')
      await edit().click()
      await input().fill('Held draft')
      await call('fault', 'hold')
      await saveAll().click()
      await settle()
      assert.equal(await saveAll().isDisabled(), true)
      assert.equal(await mode().isDisabled(), true)
      assert.equal(await edit().isDisabled(), true)
      await call('saveAllTwice')
      assert.equal((await read()).counts.requests, 1)
      await edit('R0002').click()
      await input('R0002').fill('Next batch')
      await call('release')
      await idle()
      const value = await read()
      assert.equal(value.counts.requests, 1)
      assert.equal(value.sample[0].name, 'Held draft')
      assert.equal(value.sample[1].name, 'Record 0002')
      assert.equal(value.drafts.R0002.name, 'Next batch')
      assert.ok(await focused(input('R0002')))
    },
  )
  await record(
    'global preflight detects a conflicting revision without saving other rows',
    async () => {
      await start(8, 'table')
      await edit().click()
      await input().fill('Stale draft')
      await edit('R0002').click()
      await input('R0002').fill('Valid second draft')
      await call('patch', 'R0001', { note: 'External change' })
      await saveAll().click()
      await idle()
      assert.equal((await read()).counts.requests, 0)
      assert.equal((await read()).drafts.R0001.status, 'conflict')
      await edit().click()
      await input().press('Escape')
      await saveAll().click()
      await idle()
      assert.equal((await read()).counts.requests, 1)
      assert.equal((await read()).sent[0].id, 'R0002')
    },
  )
  await record('save mode can change only after edits resolve', async () => {
    await start()
    await edit().click()
    await input().fill('Mode-independent draft')
    assert.equal(await mode().isDisabled(), true)
    assert.equal(await mode().inputValue(), 'row')
    await save().click()
    await idle()
    assert.equal((await read()).sample[0].name, 'Mode-independent draft')
    await mode().selectOption('table')
    await edit().click()
    assert.equal(await save().count(), 0)
    await page
      .getByRole('button', { name: 'Cancel R0001', exact: true })
      .click()
    await mode().selectOption('row')
    await edit().click()
    assert.equal(await save().count(), 1)
    assert.equal((await read()).counts.requests, 1)
  })
  await record('disposing during Save all aborts active requests', async () => {
    await start(8, 'table')
    await edit().click()
    await input().fill('Pending batch')
    await call('fault', 'hold')
    await saveAll().click()
    await call('stop')
    await settle()
    assert.equal((await call('lastCounts')).aborted, 1)
    assert.equal(await page.locator('[data-row]').count(), 0)
  })
  if (process.env.BENCH_ATTRIBUTION)
    report.groupingAttribution = await groupingProfile({
      page,
      call,
      start,
      settle,
    })
  const sizes =
    process.env.BENCH_WORKLOADS === '0'
      ? []
      : (process.env.BENCH_SIZES ?? '25,250,999').split(',').map(Number)
  for (const size of sizes) {
    await call('stop')
    const before = await metrics()
    await start(size)
    const loaded = await metrics()
    assert.equal(await page.locator('[data-row]').count(), size)
    const baseline = await read()
    assert.equal(baseline.counts.validations, 0)
    await call('remember', 'R0001')
    const begin = performance.now()
    await edit('R0001', 'note').click()
    await input('R0001', 'note').fill('Measured edit')
    await input('R0001', 'note').press('Enter')
    await idle()
    const elapsedMs = performance.now() - begin
    const value = await read()
    assert.equal(value.identity, true)
    assert.equal(value.counts.views, size)
    assert.equal(value.counts.cells, size * 6)
    assert.equal(value.counts.validations, 1)
    const reads =
      value.counts.name +
      value.counts.note +
      value.counts.priority -
      (baseline.counts.name + baseline.counts.note + baseline.counts.priority)
    assert.ok(reads <= 4, `An edit reread ${reads} cells at size ${size}`)
    const beforeSelect = await read()
    await edit('R0001', 'priority').click()
    await select().selectOption('high')
    await save().click()
    await idle()
    const selected = await read()
    const selectReads =
      selected.counts.name +
      selected.counts.note +
      selected.counts.priority -
      beforeSelect.counts.name -
      beforeSelect.counts.note -
      beforeSelect.counts.priority
    assert.equal(selected.identity, true)
    assert.equal(selected.counts.views, size)
    assert.equal(selected.counts.cells, size * 6)
    assert.equal(selected.counts.validations, 2)
    assert.equal(selected.sample[0].priority, 'high')
    assert.ok(
      selectReads <= 4,
      `A dropdown edit reread ${selectReads} cells at size ${size}`,
    )
    const exercised = await metrics()
    let loadedObjects
    if (size === sizes.at(-1)) loadedObjects = await heap('loaded')
    let repeatedObjects
    let secondRecordObjects
    if (loadedObjects) {
      // rc.13's parent property node retains one older value for an edited row.
      // Verify bounded version retention with actual snapshots, not a tolerance.
      for (let edit = 0; edit < 20; edit++)
        await call('patch', 'R0001', { note: `Revision ${edit}` })
      await metrics()
      repeatedObjects = await heap('repeated-edit')
      await call('patch', 'R0002', { note: 'A second edited record' })
      await metrics()
      secondRecordObjects = await heap('second-record-edit')
    }
    // Preserve the earlier heap workload before exercising collapse and resume.
    // Collapse and resume only one row. Dataset size must not multiply cell reads.
    const beforeCollapse = await read()
    await edit('R0001', 'note').click()
    await input('R0001', 'note').fill('Collapsed draft')
    await page.getByRole('heading', { name: 'Table' }).click()
    await settle()
    const collapsed = await read()
    const collapseReads =
      collapsed.counts.name +
      collapsed.counts.note +
      collapsed.counts.priority -
      beforeCollapse.counts.name -
      beforeCollapse.counts.note -
      beforeCollapse.counts.priority
    assert.ok(
      collapseReads <= 9,
      `Collapsing a draft reread ${collapseReads} cells at size ${size}`,
    )
    assert.equal(collapsed.counts.views, size)
    assert.equal(collapsed.counts.cells, size * 6)
    assert.equal(
      collapsed.counts.validations,
      beforeCollapse.counts.validations,
    )
    assert.equal(collapsed.counts.requests, beforeCollapse.counts.requests)
    assert.equal(await page.locator('.edited-marker').count(), 1)
    await edit('R0001', 'note').click()
    await page
      .getByRole('button', { name: 'Cancel R0001', exact: true })
      .click()
    await settle()
    await mode().selectOption('table')
    for (const id of ['R0001', 'R0002', 'R0003']) {
      await edit(id, 'note').click()
      await input(id, 'note').fill('Global measured draft')
      await input(id, 'note').press('Enter')
    }
    await settle()
    const beforeGlobal = await read()
    await saveAll().click()
    await idle()
    const global = await read()
    const globalReads =
      global.counts.name +
      global.counts.note +
      global.counts.priority -
      beforeGlobal.counts.name -
      beforeGlobal.counts.note -
      beforeGlobal.counts.priority
    assert.equal(global.counts.requests - beforeGlobal.counts.requests, 3)
    assert.equal(global.counts.validations - beforeGlobal.counts.validations, 3)
    assert.equal(global.counts.views, size)
    assert.equal(global.counts.cells, size * 6)
    assert.equal(global.identity, true)
    assert.deepEqual(global.drafts, {})
    // These three rows display drafts and markers before saving, unlike open editors.
    assert.equal(globalReads, 18, `Save all cell reads changed at size ${size}`)
    const cellReads = (value) =>
      value.counts.name + value.counts.note + value.counts.priority
    const beforeFilter = await read()
    for (const query of ['r', 're', 'rec', 'reco', 'record']) {
      await nameFilter().fill(query)
      await settle()
    }
    const filtered = await read()
    const filterReads = cellReads(filtered) - cellReads(beforeFilter)
    assert.equal(filterReads, size * 5)
    for (const query of ['r', 're', 'rec', 'reco', 'record']) {
      await search().fill(query)
      await settle()
    }
    const searched = await read()
    const searchReads = cellReads(searched) - cellReads(filtered)
    // Each pass checks the Name column filter, then global search matches Name.
    assert.equal(searchReads, size * 10)
    assert.equal(searched.counts.views, size)
    assert.equal(searched.counts.cells, size * 6)
    assert.equal(searched.counts.requests, global.counts.requests)
    assert.equal(searched.counts.validations, global.counts.validations)
    assert.equal(searched.identity, true)
    await clearFilters().click()
    const beforeGrouping = await read()
    await call('grouping', ['priority', 'name'])
    const collapsedGroups = await read()
    const groupingReads =
      collapsedGroups.counts.groupReads - beforeGrouping.counts.groupReads
    assert.equal(groupingReads, size * 2)
    assert.equal(await page.locator('[data-row]').count(), 0)
    assert.equal(await page.locator('[data-group]').count(), 2)
    await call('expandGroups', true)
    const grouped = await read()
    assert.equal(grouped.counts.views - grouped.counts.unmounted, size)
    assert.equal(grouped.counts.groupViews - grouped.counts.groupsUnmounted, 4)
    const groupedMetrics = await metrics()
    const groupedObjects =
      size === sizes.at(-1) ? await heap('grouped') : undefined
    for (let cycle = 0; cycle < 3; cycle++) {
      await call('expandGroups', false)
      assert.equal(await page.locator('[data-row]').count(), 0)
      await call('expandGroups', true)
    }
    const expandedGroups = await read()
    assert.equal(expandedGroups.counts.groupReads, grouped.counts.groupReads)
    assert.equal(
      expandedGroups.counts.views - expandedGroups.counts.unmounted,
      size,
    )
    // Crossing the grouping boundary swaps editable and read-only row owners.
    for (let cycle = 0; cycle < 3; cycle++) {
      await call('grouping', [])
      const cleared = await read()
      assert.equal(cleared.counts.groupViews, cleared.counts.groupsUnmounted)
      await call('grouping', ['priority', 'name'])
    }
    const regrouped = await read()
    assert.equal(
      regrouped.counts.groupReads - expandedGroups.counts.groupReads,
      size * 6,
    )
    assert.equal(regrouped.counts.views - expandedGroups.counts.views, size * 6)
    assert.equal(
      regrouped.counts.groupViews - regrouped.counts.groupsUnmounted,
      4,
    )
    await call('patch', 'R0002', { note: '' })
    const aggregated = await read()
    const aggregateEditReads = aggregated.counts.note - regrouped.counts.note
    assert.equal(aggregated.counts.groupReads, regrouped.counts.groupReads)
    assert.equal(aggregated.counts.views, regrouped.counts.views)
    assert.equal(aggregated.counts.groupViews, regrouped.counts.groupViews)
    assert.equal(aggregated.counts.aggregates - regrouped.counts.aggregates, 2)
    assert.equal(aggregateEditReads, 2 * (size - 1) + 1)
    assert.equal(aggregated.counts.requests, global.counts.requests)
    assert.equal(aggregated.counts.validations, global.counts.validations)
    assert.equal(aggregated.identity, true)
    const regroupedMetrics = await metrics()
    const regroupedObjects =
      size === sizes.at(-1) ? await heap('regrouped') : undefined
    for (const objects of [groupedObjects, regroupedObjects]) {
      if (!objects) continue
      assert.equal(objects['Native row views'], size)
      assert.equal(objects['Table cells'], size * 6)
      assert.equal(objects['Native group views'], 4)
      assert.equal(objects['Native group cells'], 24)
      assert.equal(objects['Native group membership nodes'], 4)
    }
    const summaryWork = {}
    const summaryBaseline = await read()
    for (const name of [
      'median',
      'range',
      'span',
      'first',
      'last',
      'count',
      'sum',
    ]) {
      const beforeSummary = await read()
      await call('summary', 'amount', name)
      const afterSummary = await read()
      const amountReads =
        afterSummary.counts.amount - beforeSummary.counts.amount
      const scalarValues =
        afterSummary.counts.medianValues - beforeSummary.counts.medianValues
      assert.equal(
        amountReads,
        name === 'count' ? 0 : ['first', 'last'].includes(name) ? 4 : size * 2,
      )
      assert.equal(
        scalarValues,
        name === 'median' ? 2 * (size - Math.floor(size / 11)) : 0,
      )
      summaryWork[name] = { amountReads, scalarValues }
    }
    for (let repeat = 0; repeat < 5; repeat++)
      for (const name of ['median', 'range', 'first', 'last', 'sum'])
        await call('summary', 'amount', name)
    const afterSummaries = await read()
    assert.equal(
      afterSummaries.counts.groupReads,
      summaryBaseline.counts.groupReads,
    )
    assert.equal(afterSummaries.counts.views, summaryBaseline.counts.views)
    assert.equal(afterSummaries.counts.cells, summaryBaseline.counts.cells)
    assert.equal(
      afterSummaries.counts.groupViews,
      summaryBaseline.counts.groupViews,
    )
    assert.equal(
      afterSummaries.counts.groupCells,
      summaryBaseline.counts.groupCells,
    )
    assert.equal(afterSummaries.counts.note, summaryBaseline.counts.note)
    assert.equal(afterSummaries.counts.dueDate, summaryBaseline.counts.dueDate)
    const summaryMetrics = await metrics()
    const summaryObjects =
      size === sizes.at(-1) ? await heap('summaries') : undefined
    if (summaryObjects) {
      assert.equal(
        summaryObjects['Data records'],
        regroupedObjects['Data records'],
      )
      assert.equal(summaryObjects['Table cells'], size * 6)
      assert.equal(summaryObjects['Native group cells'], 24)
      assert.equal(summaryObjects['Native group membership nodes'], 4)
    }
    async function resizeBothWays() {
      const measurements = {}
      for (const behavior of ['grow', 'fixed']) {
        await call('controls', { resizeBehavior: behavior })
        measurements[behavior] = await resizeWorkload({
          page,
          cdp,
          read,
          settle,
        })
      }
      await call('controls', { resizeBehavior: 'grow' })
      return measurements
    }
    const resizeWork = await resizeBothWays()
    const resizedMetrics = await metrics()
    const resizedObjects =
      size === sizes.at(-1) ? await heap('resized') : undefined
    if (resizedObjects)
      for (const category of [
        'Data records',
        'Native row views',
        'Table cells',
        'Native group views',
        'Native group cells',
        'Native group membership nodes',
        'Solid store targets',
        'Solid owner scopes',
        'Solid computations and effects',
      ])
        assert.equal(
          resizedObjects[category],
          summaryObjects[category],
          category,
        )
    let repeatedResizeObjects
    let settledResizeObjects
    if (resizedObjects) {
      // Initial writes can add links in the existing width computations.
      // Repeating gestures must not keep growing the retained graph.
      for (let cycle = 0; cycle < 9; cycle++) await resizeBothWays()
      await metrics()
      repeatedResizeObjects = await heap('resized-repeat')
      for (const category of [
        'Data records',
        'Native row views',
        'Table cells',
        'Native group views',
        'Native group cells',
        'Native group membership nodes',
        'Solid store targets',
        'Solid store property signals',
        'Solid plain signals',
        'Solid owner scopes',
        'Solid computations and effects',
      ])
        assert.equal(
          repeatedResizeObjects[category],
          resizedObjects[category],
          category,
        )
      // The table-width memo can add one final duplicate parent-store link
      // as its six column reads settle. Compare two long workloads after
      // that initial transition, rather than treating a first-use edge as a leak.
      for (let cycle = 0; cycle < 10; cycle++) await resizeBothWays()
      await metrics()
      settledResizeObjects = await heap('resized-settled')
      for (const category of Object.keys(repeatedResizeObjects)) {
        if (['JavaScript Maps', 'V8 allocation templates'].includes(category))
          continue
        assert.ok(
          settledResizeObjects[category] <= repeatedResizeObjects[category],
          `Repeated resizing retains more ${category}`,
        )
      }
    }
    const reorderWork = await reorderWorkload({ page, cdp, read, settle })
    const reorderedMetrics = await metrics()
    const reorderedObjects =
      size === sizes.at(-1) ? await heap('reordered') : undefined
    let repeatedReorderObjects
    let settledReorderObjects
    if (reorderedObjects) {
      for (const category of [
        'Data records',
        'Native row views',
        'Table cells',
        'Native group views',
        'Native group cells',
        'Native group membership nodes',
        'Solid store targets',
        'Solid owner scopes',
        'Solid computations and effects',
      ])
        assert.equal(
          reorderedObjects[category],
          settledResizeObjects[category],
          category,
        )
      for (let cycle = 0; cycle < 9; cycle++)
        await reorderWorkload({ page, cdp, read, settle })
      await metrics()
      repeatedReorderObjects = await heap('reordered-repeat')
      for (let cycle = 0; cycle < 10; cycle++)
        await reorderWorkload({ page, cdp, read, settle })
      await metrics()
      settledReorderObjects = await heap('reordered-settled')
      for (const category of Object.keys(repeatedReorderObjects)) {
        if (['JavaScript Maps', 'V8 allocation templates'].includes(category))
          continue
        assert.ok(
          settledReorderObjects[category] <= repeatedReorderObjects[category],
          `Repeated rearrangement retains more ${category}`,
        )
      }
    }
    await call('stop')
    const disposed = await metrics()
    let disposedObjects
    if (size === sizes.at(-1)) disposedObjects = await heap('disposed')
    if (loadedObjects) {
      assert.equal(loadedObjects['Data records'], size + 1)
      assert.equal(repeatedObjects['Data records'], size + 1)
      assert.equal(secondRecordObjects['Data records'], size + 2)
      assert.equal(loadedObjects['Native row views'], size)
      assert.equal(loadedObjects['Virtualizer instances'] ?? 0, 0)
    }
    if (disposedObjects)
      for (const category of [
        'Data records',
        'Native row views',
        'Native group views',
        'Native group cells',
        'Native group membership nodes',
        'Table cells',
        'Solid store targets',
        'Solid owner scopes',
        'Solid computations and effects',
        'Solid dependency links',
      ])
        assert.equal(
          disposedObjects[category] ?? 0,
          0,
          `Disposed fixture retains ${category}`,
        )
    report.benchmarks.push({
      size,
      counts: value.counts,
      editAccessorReads: reads,
      selectAccessorReads: selectReads,
      collapseAccessorReads: collapseReads,
      globalAccessorReads: globalReads,
      fiveColumnFilterAccessorReads: filterReads,
      fiveCombinedSearchAccessorReads: searchReads,
      groupingReads,
      aggregateEditReads,
      summaryWork,
      summaryMetrics,
      summaryObjects,
      resizeWork,
      resizedMetrics,
      resizedObjects,
      repeatedResizeObjects,
      settledResizeObjects,
      reorderWork,
      reorderedMetrics,
      reorderedObjects,
      repeatedReorderObjects,
      settledReorderObjects,
      groupedMetrics,
      regroupedMetrics,
      groupedObjects,
      regroupedObjects,
      selectCounts: selected.counts,
      elapsedMs,
      before,
      loaded,
      exercised,
      disposed,
      loadedObjects,
      repeatedObjects,
      secondRecordObjects,
      disposedObjects,
      hostLoad: loadavg(),
    })
    console.log(
      `PASS ${size} fully rendered rows; text reads ${reads}; select reads ${selectReads}; collapse reads ${collapseReads}; Save all reads ${globalReads}; five filters ${filterReads}; five combined searches ${searchReads}; zero replacement views/cells`,
    )
    console.log(
      `PASS ${size} grouped records; initial grouping reads ${groupingReads}; note edit reads ${aggregateEditReads}; zero grouping reads on collapse or summary edit; four live groups after regrouping`,
    )
    console.log(
      `PASS ${size} resized records; both width behaviors, six live drags and two keys each; zero record/view/summary work and zero retained gesture listeners`,
    )
    console.log(
      `PASS ${size} rearranged records; six drags and nine key moves; zero record/view/summary work and zero retained gesture listeners`,
    )
  }
  if (process.env.BENCH_LOCK_WORKLOAD)
    report.editingLock = await editingLockWorkload({
      start,
      call,
      read,
      settle,
      metrics,
      heap,
    })
  if (process.env.BENCH_CHILD_WORKLOAD)
    report.subtables = await subtableWorkload({
      page,
      call,
      start,
      settle,
      metrics,
      heap,
    })
  const diagnostics = await call('diagnostics')
  report.expectedDiagnostics.push(...diagnostics.filter(expectedFanIn))
  report.timingDiagnostics.push(
    ...diagnostics.filter((event) => event.code === 'HOT_SCOPE_TIME'),
  )
  report.diagnostics = diagnostics.filter(
    (event) => !expectedFanIn(event) && event.code !== 'HOT_SCOPE_TIME',
  )
  assert.deepEqual(report.diagnostics, [])
  await start(8)
  await edit().click()
  await input().fill('Example draft')
  await page.screenshot({
    path: process.env.BENCH_SCREENSHOT ?? '/tmp/table-editing-fixture.png',
    fullPage: true,
  })
  await call('stop')
  await settle()
  assert.deepEqual(report.errors, [])
} finally {
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  await browser?.close()
  if (server.listening)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
}
console.log(`Saved ${output}`)
assert.deepEqual(report.failures, [])
