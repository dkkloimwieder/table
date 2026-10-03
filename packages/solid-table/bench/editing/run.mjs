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
  benchmarks: [],
  errors: [],
  diagnostics: [],
}
try {
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  report.browser = browser.version()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (error) => {
    report.errors.push(error.stack)
    console.error(error.stack)
  })
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      report.errors.push(message.text())
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
    await test()
    assert.deepEqual(report.errors, [])
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
  await record(
    'repeated visible drafts keep hidden ID output stable and real filter changes update it',
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
      const filter = page.getByRole('textbox', {
        name: 'Filter saved names',
        exact: true,
      })
      await filter.fill('0001')
      await settle()
      assert.equal(
        await page.getByRole('button', { name: /^Show R/ }).count(),
        7,
      )
      assert.equal(Object.keys((await read()).drafts).length, 8)
      await filter.fill('0002')
      await settle()
      assert.equal(
        await page
          .getByRole('button', { name: 'Show R0001', exact: true })
          .count(),
        1,
      )
      assert.equal(
        await page
          .getByRole('button', { name: 'Show R0002', exact: true })
          .count(),
        0,
      )
      await page.getByRole('button', { name: 'Save all', exact: true }).click()
      await idle()
      assert.equal((await read()).counts.requests, 8)
      assert.deepEqual((await read()).drafts, {})
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
      await page.getByRole('heading', { name: 'Inline editing' }).click()
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
      await page.getByRole('heading', { name: 'Inline editing' }).click()
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
      await page.getByRole('heading', { name: 'Inline editing' }).click()
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal(await edit().getAttribute('data-edited'), 'true')
      assert.match(
        await page.locator('#error-R0001-name').innerText(),
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
        await page.locator('#error-R0001-priority').innerText(),
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
    'dropdown drafts and row identity survive sorting and filter removal',
    async () => {
      await start()
      await edit('R0001', 'priority').click()
      await select().selectOption('low')
      await page.locator('[data-row="R0001"]').evaluate((node) => {
        window.originalRow = new WeakRef(node)
      })
      await page.getByRole('button', { name: /^Sort names/ }).click()
      await page.getByRole('button', { name: /^Sort names/ }).click()
      await settle()
      assert.equal((await read()).ids.at(-1), 'R0001')
      assert.equal(await select().count(), 0)
      assert.ok(
        await page
          .locator('[data-row="R0001"]')
          .evaluate((node) => window.originalRow.deref() === node),
      )
      await page
        .getByRole('textbox', { name: 'Filter saved names', exact: true })
        .fill('0002')
      await settle()
      assert.equal(await select().count(), 0)
      assert.equal((await read()).drafts.R0001.priority, 'low')
      await page
        .getByRole('button', { name: 'Show R0001', exact: true })
        .click()
      await settle()
      assert.equal(await select().inputValue(), 'low')
      assert.equal((await read()).counts.requests, 0)
      await select().focus()
      await save().click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'low')
      assert.ok(await focused(edit('R0001', 'priority')))
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
      await page
        .getByRole('heading', { name: 'Inline editing', exact: true })
        .click()
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
        await page.locator('#error-R0001-name').innerText(),
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
      assert.match(await page.locator('#error-R0001-note').innerText(), /240/)
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
        await page.getByRole('heading', { name: 'Inline editing' }).click()
        await settle()
        assert.equal(await input().count(), 0)
        assert.equal(await edit().getAttribute('data-edited'), 'true')
        assert.equal(
          await page.locator('#message-R0001').innerText(),
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
    'removed pending record is not recreated by its response',
    async () => {
      await start()
      await edit().click()
      await input().fill('Removed draft')
      await call('fault', 'hold')
      await save().click()
      await call('remove', 'R0001')
      await call('release')
      await idle()
      const value = await read()
      assert.equal(value.ids.includes('R0001'), false)
      assert.equal(
        value.sample.some((row) => row.id === 'R0001'),
        false,
      )
      assert.equal(value.drafts.R0001.name, 'Removed draft')
      await page
        .getByRole('button', { name: 'Cancel hidden R0001', exact: true })
        .click()
      await settle()
      assert.deepEqual((await read()).drafts, {})
    },
  )
  await record(
    'sorting collapses editors and preserves drafts and logical focus after save',
    async () => {
      await start()
      await edit().click()
      await input().fill('ZZZ moved')
      await page.getByRole('button', { name: /^Sort names/ }).click()
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal(await edit().getAttribute('data-edited'), 'true')
      await edit().click()
      assert.equal(await input().inputValue(), 'ZZZ moved')
      await input().press('Enter')
      await idle()
      assert.equal((await read()).ids.at(-1), 'R0001')
      assert.ok(await focused(edit()))
      assert.equal((await read()).sample[0].name, 'ZZZ moved')
    },
  )
  await record(
    'filter-hidden drafts can be resumed with their values intact',
    async () => {
      await start()
      await edit().click()
      await input().fill('Hidden draft')
      await page
        .getByRole('textbox', { name: 'Filter saved names', exact: true })
        .fill('0002')
      await settle()
      assert.equal(await input().count(), 0)
      assert.equal((await read()).drafts.R0001.name, 'Hidden draft')
      await page
        .getByRole('button', { name: 'Show R0001', exact: true })
        .click()
      await settle()
      assert.equal(await input().inputValue(), 'Hidden draft')
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
    'global mode saves visible and filtered drafts with exact revisions',
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
      await page
        .getByRole('textbox', { name: 'Filter saved names', exact: true })
        .fill('0002')
      await settle()
      assert.equal(
        await page
          .getByRole('button', { name: 'Show R0001', exact: true })
          .count(),
        1,
      )
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
        await page.locator('#error-R0002-name').innerText(),
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
  await record(
    'switching save modes preserves drafts and restores row Save buttons',
    async () => {
      await start()
      await edit().click()
      await input().fill('Mode-independent draft')
      await mode().focus()
      await mode().selectOption('table')
      await settle()
      await edit().click()
      assert.equal(await save().count(), 0)
      assert.equal(await input().inputValue(), 'Mode-independent draft')
      await mode().focus()
      await mode().selectOption('row')
      await edit().click()
      assert.equal(await save().count(), 1)
      await save().click()
      await idle()
      assert.equal((await read()).sample[0].name, 'Mode-independent draft')
      assert.equal((await read()).counts.requests, 1)
    },
  )
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
  const sizes = (process.env.BENCH_SIZES ?? '25,250,999').split(',').map(Number)
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
    assert.equal(value.counts.cells, size * 4)
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
    assert.equal(selected.counts.cells, size * 4)
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
    await page.getByRole('heading', { name: 'Inline editing' }).click()
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
    assert.equal(collapsed.counts.cells, size * 4)
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
    assert.equal(global.counts.cells, size * 4)
    assert.equal(global.identity, true)
    assert.deepEqual(global.drafts, {})
    // These three rows display drafts and markers before saving, unlike open editors.
    assert.equal(globalReads, 18, `Save all cell reads changed at size ${size}`)
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
      `PASS ${size} fully rendered rows; text reads ${reads}; select reads ${selectReads}; collapse reads ${collapseReads}; Save all reads ${globalReads}; zero replacement views/cells`,
    )
  }
  report.diagnostics = await call('diagnostics')
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
