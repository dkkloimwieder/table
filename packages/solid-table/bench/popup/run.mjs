import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { loadavg } from 'node:os'
import { chromium } from '@playwright/test'

const directory = process.env.BENCH_DEVELOPMENT
  ? '.dist-dev'
  : process.env.BENCH_DISTRIBUTION
    ? '.dist-package'
    : '.dist'
const assets = fileURLToPath(new URL(`${directory}/`, import.meta.url))
const report = {
  directory,
  hostLoad: loadavg(),
  cases: [],
  failures: [],
  errors: [],
  warnings: [],
  timing: [],
}
const server = createServer(async (request, response) => {
  try {
    const name = new URL(request.url, 'http://localhost').pathname
    if (name === '/favicon.ico') return void response.writeHead(204).end()
    response.setHeader(
      'Content-Type',
      name.endsWith('.js')
        ? 'text/javascript'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    )
    response.end(
      await readFile(assets + (name === '/' ? 'index.html' : name.slice(1))),
    )
  } catch {
    response.writeHead(404).end()
  }
})
if (!process.env.BENCH_URL) {
  const modules = JSON.parse(await readFile(assets + 'modules.json', 'utf8'))
  assert.ok(
    modules.some((id) => id.includes('/kobalte/packages/core/src/select/')),
  )
  assert.ok(
    !modules.some((id) =>
      /table-core|@tanstack\/store|virtual-core|solid-form/.test(id),
    ),
  )
  for (const name of ['solid-js', '@solidjs/web', '@solidjs/signals']) {
    const roots = [
      ...new Set(
        modules
          .filter((id) => id.includes(`/node_modules/${name}/`))
          .map((id) => id.split(`/node_modules/${name}/`)[0]),
      ),
    ]
    assert.equal(roots.length, 1, `one ${name} runtime: ${roots}`)
  }
  report.moduleAudit = true
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
}
const url = process.env.BENCH_URL ?? `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({
  executablePath: process.env.BENCH_EXECUTABLE_PATH,
})
report.browser = browser.version()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(7000)
page.on('pageerror', (error) => report.errors.push(error.stack))
page.on('console', (message) => {
  if (!['warning', 'error'].includes(message.type())) return
  if (message.text().startsWith('[HOT_SCOPE_TIME]'))
    report.timing.push(message.text())
  else report.warnings.push(message.text())
})
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
const root = () => page.locator('[data-table-scope="root"]')
const trigger = (id = 'R0001', within = root()) =>
  within.locator(`[data-editor="${id}/priority"]`)
const edit = (id = 'R0001', within = root()) =>
  within.getByRole('button', { name: `Edit priority ${id}`, exact: true })
const save = (id = 'R0001') =>
  root().getByRole('button', { name: `Save ${id}`, exact: true })
const cancel = (id = 'R0001') =>
  root().getByRole('button', { name: `Cancel ${id}`, exact: true })
const option = (name) =>
  page.getByRole('listbox').getByRole('option', { name, exact: true })
const press = async (key) => {
  await page.keyboard.press(key)
  await settle()
}
const focused = (locator) =>
  locator.evaluate((node) => node === document.activeElement)
async function start(size = 8, mode = 'row') {
  if (!(await page.evaluate(() => Boolean(window.editingFixture))))
    await page.goto(url)
  await call('start', size, mode)
  await page.waitForFunction(() => window.editingFixture.ready())
  await settle()
}
async function choose(name, id = 'R0001', within = root()) {
  await trigger(id, within).click()
  await option(name).click()
  await settle()
}
async function idle() {
  await page.waitForFunction(
    () =>
      !window.editingFixture.read().savingAll &&
      Object.values(window.editingFixture.read().drafts).every(
        (draft) => draft.status !== 'pending',
      ),
  )
  await settle()
}
async function record(name, work) {
  if (
    process.env.BENCH_SCENARIOS === '0' ||
    (process.env.BENCH_CASE_PATTERN &&
      !new RegExp(process.env.BENCH_CASE_PATTERN).test(name))
  )
    return
  const warnings = report.warnings.length
  const errors = report.errors.length
  try {
    await work()
    await settle()
    assert.deepEqual(report.errors.slice(errors), [])
    assert.deepEqual(report.warnings.slice(warnings), [])
    report.cases.push(name)
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failures.push({ name, error: String(error) })
    console.error(`FAIL ${name}: ${error}`)
    if (!process.env.BENCH_CONTINUE) throw error
  }
}
try {
  await page.goto(url)
  await record(
    'standalone popup keeps scalar values separate from labels and permits empty selection',
    async () => {
      await page.goto(`${url}?standalone=1`)
      await page.locator('[data-editor]').click()
      await settle()
      await option('Low').click()
      assert.equal(
        (await page.evaluate(() => window.popupFixture.read())).value,
        'low',
      )
      await page.locator('[data-editor]').click()
      await settle()
      await option('No priority').click()
      assert.equal(
        (await page.evaluate(() => window.popupFixture.read())).value,
        '',
      )
      await page.evaluate(() =>
        window.popupFixture.configure({ value: 'high' }),
      )
      assert.equal(await page.locator('[data-editor]').innerText(), 'High\n▾')
    },
  )
  await record(
    'standalone keyboard navigation skips disabled options and Escape preserves the value',
    async () => {
      await page.goto(`${url}?standalone=1`)
      const control = page.locator('[data-editor]')
      await control.focus()
      await settle()
      await press('ArrowDown')
      await press('End')
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('data-key'),
        ),
        'high',
      )
      await press('Enter')
      assert.equal(
        (await page.evaluate(() => window.popupFixture.read())).value,
        'high',
      )
      assert.equal(await focused(control), true)
      await control.press('ArrowDown')
      await settle()
      await press('Home')
      await press('Escape')
      assert.equal(
        (await page.evaluate(() => window.popupFixture.read())).value,
        'high',
      )
      assert.equal(await focused(control), true)
      await page.evaluate(() =>
        window.popupFixture.configure({ disabled: true }),
      )
      assert.equal(await control.isDisabled(), true)
    },
  )
  await record(
    'standalone Tab and Shift Tab return to the trigger tab order',
    async () => {
      await page.goto(`${url}?standalone=1`)
      await page.locator('[data-editor]').click()
      await settle()
      await press('Tab')
      assert.equal(
        await focused(
          page.getByRole('button', { name: 'After popup', exact: true }),
        ),
        true,
      )
      await page.locator('[data-editor]').click()
      await settle()
      await press('Shift+Tab')
      assert.equal(
        await focused(
          page.getByRole('button', { name: 'Before popup', exact: true }),
        ),
        true,
      )
      assert.equal(await page.getByRole('listbox').count(), 0)
    },
  )
  await record(
    'standalone outside clicks retain the destination focus',
    async () => {
      await page.goto(`${url}?standalone=1`)
      await page.locator('[data-editor]').click()
      await settle()
      const after = page.getByRole('button', {
        name: 'After popup',
        exact: true,
      })
      await after.click()
      await settle()
      assert.equal(await focused(after), true)
      assert.equal(await page.getByRole('listbox').count(), 0)
    },
  )
  await record(
    'popup pointer selection preserves the row draft without saving or scrolling the document',
    async () => {
      await start()
      await call('remember', 'R0001')
      await edit().click()
      await trigger().scrollIntoViewIfNeeded()
      const top = await page.evaluate(() => scrollY)
      await trigger().click()
      await settle()
      assert.equal(await page.evaluate(() => scrollY), top)
      assert.equal((await read()).drafts.R0001.expanded, true)
      await page.screenshot({ path: '/tmp/table-popup-desktop.png' })
      await option('High').click()
      await settle()
      const state = await read()
      assert.equal(state.drafts.R0001.priority, 'high')
      assert.equal(state.sample[0].priority, 'normal')
      assert.equal(state.drafts.R0001.expanded, true)
      assert.equal(state.counts.requests, 0)
      assert.equal(state.identity, true)
      assert.equal(await focused(trigger()), true)
      await save().click()
      await idle()
      const saved = await read()
      assert.equal(saved.sample[0].priority, 'high')
      assert.equal(saved.sent.length, 1)
      assert.deepEqual(saved.sent[0].changes, { priority: 'high' })
    },
  )
  await record(
    'popup Enter chooses a draft and Escape closes only the popup',
    async () => {
      await start()
      await edit().click()
      await trigger().press('ArrowDown')
      await settle()
      await press('End')
      await press('Enter')
      assert.equal((await read()).drafts.R0001.priority, 'high')
      assert.equal((await read()).counts.requests, 0)
      await trigger().press('ArrowUp')
      await settle()
      await press('Home')
      await press('Escape')
      assert.equal((await read()).drafts.R0001.priority, 'high')
      assert.equal(await focused(trigger()), true)
      await cancel().click()
      assert.equal((await read()).sample[0].priority, 'normal')
    },
  )
  await record(
    'popup Tab reaches row actions and Shift Tab returns to the previous cell',
    async () => {
      await start()
      await edit().click()
      await trigger().press('Enter')
      await settle()
      await press('Tab')
      assert.equal(await focused(save()), true)
      assert.equal((await read()).drafts.R0001.expanded, true)
      await trigger().press('Enter')
      await settle()
      await press('Shift+Tab')
      assert.equal(
        await focused(
          root().getByRole('textbox', { name: 'Note R0001', exact: true }),
        ),
        true,
      )
    },
  )
  await record(
    'popup typeahead selects an enabled choice without submitting the row',
    async () => {
      await start()
      await edit().click()
      await trigger().press('h')
      await settle()
      assert.equal((await read()).drafts.R0001.priority, 'high')
      assert.equal((await read()).counts.requests, 0)
      await trigger().click()
      await settle()
      await press('l')
      await press('Enter')
      assert.equal((await read()).drafts.R0001.priority, 'low')
    },
  )
  await record('popup disabled choices reject pointer selection', async () => {
    await start()
    await edit().click()
    await trigger().click()
    await settle()
    await option('Unavailable').click({ force: true })
    assert.equal((await read()).drafts.R0001.priority, 'normal')
    assert.equal(await page.getByRole('listbox').count(), 1)
    await press('Escape')
  })
  await record(
    'popup blank choices use the existing Zod validation and recover in place',
    async () => {
      await start()
      await edit().click()
      await choose('No priority')
      await save().click()
      await settle()
      assert.equal((await read()).drafts.R0001.status, 'invalid')
      assert.equal((await read()).counts.requests, 0)
      assert.equal(await trigger().getAttribute('aria-invalid'), 'true')
      assert.equal(await focused(trigger()), true)
      await choose('Low')
      await save().click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'low')
    },
  )
  await record(
    'popup outside-row clicks collapse editors and retain the changed draft',
    async () => {
      await start()
      await edit().click()
      await choose('High')
      await trigger().click()
      await settle()
      // The priority list can cover the next row's priority cell.
      await root()
        .getByRole('button', { name: 'Edit name R0002', exact: true })
        .click()
      await settle()
      const state = await read()
      assert.equal(state.drafts.R0001.expanded, false)
      assert.equal(state.drafts.R0001.priority, 'high')
      assert.equal(state.drafts.R0002.expanded, true)
      assert.equal(
        await focused(
          root().getByRole('textbox', { name: 'Name R0002', exact: true }),
        ),
        true,
      )
      assert.equal(await page.getByRole('listbox').count(), 0)
    },
  )
  await record(
    'popup pending saves close the popup and do not steal later focus',
    async () => {
      await start()
      await call('fault', 'hold')
      await edit().click()
      await choose('High')
      await trigger().click()
      await settle()
      await call('saveTwice', 'R0001')
      await settle()
      assert.equal(await page.getByRole('listbox').count(), 0)
      assert.equal(await trigger().isDisabled(), true)
      assert.equal((await read()).counts.requests, 1)
      await edit('R0002').click()
      await call('release')
      await idle()
      assert.equal(await focused(trigger('R0002')), true)
      assert.equal((await read()).sample[0].priority, 'high')
    },
  )
  await record(
    'popup refused saves retain the choice and allow retry',
    async () => {
      await start()
      await call('fault', 'refuse')
      await edit().click()
      await choose('High')
      await save().click()
      await idle()
      assert.equal((await read()).drafts.R0001.status, 'refused')
      assert.equal((await read()).drafts.R0001.priority, 'high')
      await call('fault', 'ok')
      await save().click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'high')
    },
  )
  await record(
    'popup conflict keeps server values and the local draft separate',
    async () => {
      await start()
      await edit().click()
      await choose('High')
      await call('patch', 'R0001', {
        priority: 'low',
        revision: '9007199254740994',
      })
      await save().click()
      await idle()
      assert.equal((await read()).drafts.R0001.status, 'conflict')
      assert.equal((await read()).sample[0].priority, 'low')
      assert.equal((await read()).drafts.R0001.priority, 'high')
    },
  )
  await record(
    'popup whole-table save commits collapsed drafts once',
    async () => {
      await start(8, 'table')
      await edit().click()
      await choose('High')
      await root()
        .getByRole('button', { name: 'After table', exact: true })
        .click()
      assert.equal((await read()).drafts.R0001.expanded, false)
      await root()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'high')
      assert.equal((await read()).counts.requests, 1)
    },
  )
  await record(
    'popup editing prevents filter grouping layout and view changes',
    async () => {
      await start()
      await call('viewSaveAs', 'Base')
      await settle()
      await edit().click()
      await trigger().click()
      await settle()
      await call('filter', 'priority', 'high')
      await call('grouping', ['priority'])
      await call('visibility', 'priority', false)
      await call('sorting', [{ id: 'name', desc: true }])
      assert.deepEqual((await read()).filters, [])
      assert.deepEqual((await read()).grouping, [])
      assert.deepEqual((await read()).sorting, [])
      assert.ok((await read()).visibleColumns.includes('priority'))
      assert.equal(await page.getByRole('listbox').count(), 1)
      await press('Escape')
    },
  )
  await record(
    'popup sub-table edits save only their own collection under grouped parents',
    async () => {
      await start(8, 'table')
      await call('grouping', ['priority'])
      await call('expandGroups', true)
      await root().locator('[data-subtable-toggle="R0001"]').click()
      await page.waitForFunction(
        () => window.editingFixture.childStatus('R0001') === 'ready',
      )
      const child = page.locator('[data-subtable="R0001"]')
      await edit('R0001', child).click()
      await choose('Low', 'R0001', child)
      assert.equal(
        (await call('childRead', 'R0001')).model.drafts.R0001.expanded,
        true,
      )
      await child.getByRole('button', { name: 'Save all', exact: true }).click()
      await page.waitForFunction(
        () => !window.editingFixture.childRead('R0001').model.savingAll,
      )
      await settle()
      assert.equal(
        (await call('childRead', 'R0001')).model.sample[0].priority,
        'low',
      )
      assert.equal((await read()).counts.requests, 0)
      assert.equal(await page.locator('[data-group] [data-editor]').count(), 0)
    },
  )
  await record(
    'popup viewport placement remains inside a narrow screen',
    async () => {
      await start()
      try {
        await page.setViewportSize({ width: 390, height: 844 })
        await edit().click()
        await trigger().click()
        await settle()
        await settle()
        const box = await page.locator('.popup-content').boundingBox()
        assert.ok(box.x >= 0 && box.x + box.width <= 391)
        assert.ok(box.y >= 0 && box.y + box.height <= 845)
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        await page.screenshot({ path: '/tmp/table-popup-mobile.png' })
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 })
      }
    },
  )
  await record(
    'popup disposal removes open portals and aborts pending row saves',
    async () => {
      await start()
      await edit().click()
      await choose('High')
      await call('fault', 'hold')
      await call('saveTwice', 'R0001')
      await call('stop')
      await settle()
      assert.equal((await call('lastCounts')).aborted, 1)
      assert.equal(await page.locator('.popup-content').count(), 0)
      assert.equal(await page.locator('[data-table-scope]').count(), 0)
      await start()
      await edit().click()
      await trigger().click()
      await settle()
      await call('stop')
      await settle()
      assert.equal(await page.locator('.popup-content').count(), 0)
    },
  )
  if (process.env.BENCH_WORKLOAD === '1') {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    async function heap(name) {
      await settle()
      await cdp.send('HeapProfiler.collectGarbage')
      const metrics = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((x) => [
          x.name,
          x.value,
        ]),
      )
      if (!process.env.BENCH_HEAPS) return { metrics }
      await mkdir(process.env.BENCH_HEAPS, { recursive: true })
      const path = `${process.env.BENCH_HEAPS}/${name}.heapsnapshot.gz`
      const compressed = createGzip()
      // Attach the rejection handler before Chrome starts sending chunks.
      let writeError
      const written = pipeline(compressed, createWriteStream(path)).catch(
        (error) => {
          writeError = error
        },
      )
      const append = ({ chunk }) => {
        if (!writeError) compressed.write(chunk)
      }
      cdp.on('HeapProfiler.addHeapSnapshotChunk', append)
      try {
        await cdp.send('HeapProfiler.takeHeapSnapshot', {
          reportProgress: false,
        })
      } finally {
        cdp.off('HeapProfiler.addHeapSnapshotChunk', append)
        compressed.end()
        await written
      }
      if (writeError) throw writeError
      await promisify(execFile)(process.execPath, [
        fileURLToPath(new URL('../inspect-heap.mjs', import.meta.url)),
        path,
      ])
      const summary = JSON.parse(await readFile(path + '.summary.json', 'utf8'))
      return {
        metrics,
        sharedScrollSignal: summary.categories
          .find((category) => category.key === 'Solid plain signals')
          ?.retainingPath.some((step) =>
            step.via?.includes('@solid-primitives/scroll:prevent-scroll'),
          ),
        counts: Object.fromEntries(
          summary.categories.map((x) => [x.key, x.count]),
        ),
      }
    }
    function assertDisposed(value) {
      if (!value.counts) return
      assert.equal(value.sharedScrollSignal, true)
      for (const [key, count] of Object.entries(value.counts)) {
        if (['JavaScript Maps', 'V8 allocation templates'].includes(key))
          continue
        // This ownerless window registry survives Table disposal by design.
        // Its retaining path must identify that registry, not a component.
        assert.equal(
          count,
          key === 'Solid plain signals' ? 1 : 0,
          `${key} disposed`,
        )
      }
    }
    if (report.cases.length) {
      report.interactionsDisposed = await heap('popup-interactions-disposed')
      assertDisposed(report.interactionsDisposed)
    }
    await page.goto(`${url}?size=100`)
    await page.waitForFunction(() => window.editingFixture.ready())
    await settle()
    await call('remember', 'R0001')
    const counts = (await read()).counts
    const cycles = []
    report.workload = { before: counts, cycles }
    for (let i = 1; i <= 200; i++) {
      await edit().click()
      await trigger().click()
      await settle()
      await option('High').click()
      await cancel().click()
      if ([10, 100, 200].includes(i))
        cycles.push({ cycle: i, ...(await heap(`popup-${i}`)) })
    }
    const after = await read()
    report.workload.after = after.counts
    assert.equal(after.identity, true)
    assert.equal(after.counts.views, counts.views)
    assert.equal(after.counts.cells, counts.cells)
    assert.equal(after.counts.requests, 0)
    if (cycles[0].counts) {
      const application = (value) =>
        Object.fromEntries(
          Object.entries(value).filter(
            ([key]) =>
              !['JavaScript Maps', 'V8 allocation templates'].includes(key),
          ),
        )
      assert.deepEqual(
        application(cycles[0].counts),
        application(cycles[1].counts),
      )
      assert.deepEqual(
        application(cycles[0].counts),
        application(cycles[2].counts),
      )
    }
    await call('stop')
    const disposed = await heap('popup-disposed')
    report.workload.disposed = disposed
    assertDisposed(disposed)
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, [])
  assert.deepEqual(report.failures, [])
} finally {
  await browser.close()
  server.close()
  const output = process.env.BENCH_OUTPUT ?? '/tmp/table-popup-browser.json'
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  console.log(`Saved ${output}`)
}
