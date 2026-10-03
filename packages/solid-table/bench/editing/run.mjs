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
const modules = JSON.parse(await readFile(`${assets}modules.json`, 'utf8'))
assert.ok(
  !modules.some((path) =>
    /table-core|@tanstack\/store|virtual-core|solid-form|kobalte|sonner|lucide/.test(
      path,
    ),
  ),
)
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
const report = {
  directory,
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
  await page.goto(`http://127.0.0.1:${server.address().port}`)
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
  const start = async (size = 8) => {
    await call('start', size)
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
  const focused = (locator) =>
    locator.evaluate((node) => node === document.activeElement)
  const idle = async () => {
    await page.waitForFunction(() =>
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
      await edit('R0008', 'note').focus()
      await page.keyboard.press('Tab')
      assert.ok(
        await focused(
          page.getByRole('button', { name: 'After table', exact: true }),
        ),
      )
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
    'multiple row drafts survive blur and one row saves both fields',
    async () => {
      await start()
      await edit().click()
      await input().fill('First name')
      await input('R0001', 'note').fill('First note')
      await edit('R0002').click()
      await input('R0002').fill('Second name')
      assert.equal((await read()).counts.requests, 0)
      await save().click()
      await idle()
      const value = await read()
      assert.deepEqual(value.sent[0].changes, {
        name: 'First name',
        note: 'First note',
      })
      assert.equal(value.drafts.R0002.name, 'Second name')
      assert.equal(value.sample[1].name, 'Record 0002')
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
      await call('release')
      await idle()
      assert.ok(await focused(input('R0002')))
      assert.equal((await read()).sample[0].name, 'Held name')
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
        await page.locator('#message-R0001').innerText(),
        /Enter a name/,
      )
      assert.ok(await focused(input()))
      await input().fill('Valid name')
      await page.keyboard.press('Enter')
      await idle()
      assert.equal((await read()).sample[0].name, 'Valid name')
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
        await call('fault', fault)
        await save().click()
        await idle()
        const value = await read()
        assert.equal(value.drafts.R0001.name, 'Preserved draft')
        assert.equal(value.sample[0].name, 'Record 0001')
        assert.ok(value.drafts.R0001.message)
        assert.equal(await save().isEnabled(), true)
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
    'sorting preserves editor nodes, drafts, and logical focus after save',
    async () => {
      await start()
      await edit().click()
      await input().fill('ZZZ moved')
      await input().evaluate((node) => {
        window.originalEditor = new WeakRef(node)
      })
      await page.getByRole('button', { name: /^Sort names/ }).click()
      await settle()
      assert.ok(
        await input().evaluate(
          (node) => window.originalEditor.deref() === node,
        ),
      )
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
  const sizes = (process.env.BENCH_SIZES ?? '25,250,999').split(',').map(Number)
  for (const size of sizes) {
    await call('stop')
    const before = await metrics()
    await start(size)
    const loaded = await metrics()
    assert.equal(await page.locator('[data-row]').count(), size)
    const baseline = await read()
    await call('remember', 'R0001')
    const begin = performance.now()
    await edit('R0001', 'note').click()
    await input('R0001', 'note').fill('Measured edit')
    await input('R0001', 'note').press('Enter')
    await idle()
    const elapsedMs = performance.now() - begin
    const value = await read()
    const exercised = await metrics()
    assert.equal(value.identity, true)
    assert.equal(value.counts.views, size)
    assert.equal(value.counts.cells, size * 3)
    const reads =
      value.counts.name +
      value.counts.note -
      (baseline.counts.name + baseline.counts.note)
    assert.ok(reads <= 4, `An edit reread ${reads} cells at size ${size}`)
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
      `PASS ${size} fully rendered rows; edit reads ${reads}; zero replacement views/cells`,
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
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}
console.log(`Saved ${output}`)
