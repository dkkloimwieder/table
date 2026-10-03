import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadavg } from 'node:os'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium } from '@playwright/test'

const directory = process.env.BENCH_DEVELOPMENT
  ? '.dist-dev'
  : process.env.BENCH_DISTRIBUTION
    ? '.dist-package'
    : '.dist'
const assets = fileURLToPath(new URL(`${directory}/`, import.meta.url))
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-wamn-browser.json'
const modules = JSON.parse(await readFile(`${assets}modules.json`, 'utf8'))
assert.ok(modules.some((path) => path.includes('/.input/runtime/transport.ts')))
assert.ok(modules.some((path) => path.includes('/.input/widget.ts')))
assert.ok(modules.some((path) => path.includes('/.input/widget_maker.ts')))
assert.ok(
  !modules.some((path) =>
    /table-core|@tanstack\/store|solid-form|kobalte|sonner|lucide|\.input\/components\//.test(
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
const id = (index) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
try {
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', (error) => {
    report.errors.push(error.stack)
    console.error(error.stack)
  })
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      if (message.text().startsWith('[HUGE_FAN_IN]'))
        report.diagnostics.push(message.text())
      else report.errors.push(message.text())
    }
  })
  const client = await page.context().newCDPSession(page)
  await client.send('Performance.enable')
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
  const read = () => page.evaluate(() => window.wamn.read())
  const call = (name, ...args) =>
    page.evaluate(({ name, args }) => window.wamn[name](...args), {
      name,
      args,
    })
  const idle = async () => {
    await page.waitForFunction(
      () =>
        window.wamn.ready() &&
        !window.wamn.read().page.busy &&
        Object.values(window.wamn.read().drafts).every((draft) => !draft.busy),
    )
    await settle()
  }
  async function start(size = 8) {
    await call('start', size)
    await page.waitForFunction(() => window.wamn.ready())
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
    await client.send('HeapProfiler.collectGarbage')
    return Object.fromEntries(
      (await client.send('Performance.getMetrics')).metrics.map(
        ({ name, value }) => [name, value],
      ),
    )
  }
  async function snapshot(name) {
    if (!process.env.BENCH_HEAPS) return
    await mkdir(process.env.BENCH_HEAPS, { recursive: true })
    const stream = createWriteStream(
      `${process.env.BENCH_HEAPS}/${name}.heapsnapshot`,
    )
    const write = ({ chunk }) => stream.write(chunk)
    client.on('HeapProfiler.addHeapSnapshotChunk', write)
    await client.send('HeapProfiler.takeHeapSnapshot', {
      reportProgress: false,
    })
    client.off('HeapProfiler.addHeapSnapshotChunk', write)
    stream.end()
    await finished(stream)
    const path = `${process.env.BENCH_HEAPS}/${name}.heapsnapshot`
    await promisify(execFile)(process.execPath, [
      fileURLToPath(new URL('../inspect-heap.mjs', import.meta.url)),
      path,
    ])
    const summary = JSON.parse(await readFile(`${path}.summary.json`, 'utf8'))
    return Object.fromEntries(
      summary.categories.map((category) => [category.key, category.count]),
    )
  }
  await record(
    'real generated GET binding, page state, decoder and reference labels',
    async () => {
      await page.getByRole('button', { name: 'Read', exact: true }).click()
      await idle()
      const value = await read()
      assert.equal(value.count, 8)
      assert.equal(value.total, 8)
      assert.equal(value.local, true)
      const request = value.sent.find(
        (request) => request.path === '/widget/query',
      )
      assert.equal(request.method, 'GET')
      assert.deepEqual(request.item, { limit: 100 })
      assert.deepEqual(Object.values(value.labels).sort(), [
        'Northwind',
        'Southwind',
      ])
      assert.equal(
        value.sent.filter((request) => request.path === '/widget-maker/get')
          .length,
        2,
      )
      assert.deepEqual(await page.getByRole('columnheader').allTextContents(), [
        'Widget code',
        'created at',
        'edit version',
        'id',
        'maker id',
        'Operator note',
        'Actions',
      ])
    },
  )
  await record(
    'browser edit preserves record identity and sends an exact int64 revision',
    async () => {
      await call('remember', id(0))
      await call('select', id(0))
      await page
        .getByRole('button', { name: `Edit ${id(0)}`, exact: true })
        .click()
      await page
        .getByRole('textbox', { name: `Note ${id(0)}`, exact: true })
        .fill('Edited in the browser')
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await settle()
      assert.match(
        await page.getByRole('alert').textContent(),
        /Save or discard/,
      )
      assert.equal(
        (await read()).sent.filter(
          (request) => request.path === '/widget/query',
        ).length,
        1,
      )
      const before = (await read()).counts
      await page
        .getByRole('button', { name: `Save ${id(0)}`, exact: true })
        .click()
      await idle()
      const value = await read()
      assert.equal(value.identity, true)
      assert.equal(value.sample[0].note, 'Edited in the browser')
      assert.equal(value.sample[0].editVersion, '9007199254740994')
      assert.equal(
        value.sent.at(-1).item.expected_edit_version,
        '9007199254740993',
      )
      assert.equal(value.selection[id(0)], true)
      assert.equal(value.counts.mounted, before.mounted)
      assert.equal(value.counts.cells, before.cells)
      assert.equal(value.counts.reads - before.reads, 2)
    },
  )
  await record(
    'refresh updates fields in place and retains valid selection',
    async () => {
      await call('patch', 0, { note: 'Server refreshed' })
      await call('reload')
      await idle()
      const value = await read()
      assert.equal(value.identity, true)
      assert.equal(value.sample[0].note, 'Server refreshed')
      assert.equal(value.selection[id(0)], true)
    },
  )
  await record(
    'refusal and revision conflict preserve typed drafts and committed data',
    async () => {
      await call('edit', id(0), { note: 'Keep my draft' })
      for (const fault of ['refuse', 'conflict', 'uncertain']) {
        await call('fault', '/widget/update', fault)
        await call('save', id(0))
        await idle()
        const value = await read()
        assert.equal(value.drafts[id(0)].note, 'Keep my draft')
        assert.equal(value.sample[0].note, 'Server refreshed')
        assert.match(
          value.drafts[id(0)].message,
          fault === 'refuse'
            ? /permission/
            : fault === 'conflict'
              ? /Another change/
              : /internal_error/,
        )
      }
      await call('discard', id(0))
    },
  )
  await record(
    'cap and busy state disable every local transformation',
    async () => {
      await call('configure', { cap: 3 })
      await idle()
      let value = await read()
      assert.equal(value.count, 3)
      assert.equal(value.local, false)
      assert.equal(value.total, null)
      await call('filter', 'no match')
      await call('sort', true)
      value = await read()
      assert.deepEqual(value.firstIds, [id(0), id(1), id(2)])
      assert.equal(
        await page.getByRole('textbox', { name: 'Refine note' }).isDisabled(),
        true,
      )
      await call('fault', '/widget/query', 'hold')
      await call('reload')
      await settle()
      assert.equal((await read()).page.busy, true)
      assert.equal((await read()).total, null)
      await call('release')
      await idle()
      await call('filter', '')
      await call('sort', false)
    },
  )
  await record(
    'duplicate IDs reject a whole response without partial writes',
    async () => {
      await call('remember', id(0))
      await call('fault', '/widget/query', 'duplicate')
      await call('reload')
      await idle()
      const value = await read()
      assert.equal(value.identity, true)
      assert.equal(value.count, 3)
      assert.match(value.page.refusal, /Duplicate/)
    },
  )
  await record(
    'an oversized page and a refused refresh retain the accepted records',
    async () => {
      for (const fault of ['oversize', 'refuse']) {
        await call('fault', '/widget/query', fault)
        await call('reload')
        await idle()
        const value = await read()
        assert.equal(value.identity, true)
        assert.equal(value.count, 3)
        assert.ok(value.page.refusal)
        assert.equal(value.total, null)
      }
    },
  )
  await record('scope generation rejects a delayed old response', async () => {
    await call('fault', '/widget/query', 'hold')
    await call('reload')
    await settle()
    await call('configure', { cap: 1000, code: 'priority' })
    await idle()
    assert.equal((await read()).count, 4)
    await call('release')
    await settle()
    const value = await read()
    assert.equal(value.count, 4)
    assert.equal(value.counts.stale, 1)
    assert.ok(value.sample.every((row) => row.code === 'priority'))
    assert.equal(value.selection[id(0)], undefined)
  })
  await record(
    'a scoped-field edit reloads through the generated binding',
    async () => {
      await call('edit', id(1), { code: 'standard' })
      await call('save', id(1))
      await idle()
      const value = await read()
      assert.equal(value.count, 3)
      assert.ok(!value.firstIds.includes(id(1)))
      assert.deepEqual(
        value.sent.filter((request) => request.path === '/widget/query').at(-1)
          .item.filter,
        { code: ['priority'] },
      )
    },
  )
  await record(
    'declared row read and form mapping retain their generated contracts',
    async () => {
      await page
        .getByRole('button', { name: `Open ${id(3)}`, exact: true })
        .click()
      await page.waitForFunction(() =>
        document
          .querySelector('[data-action]')
          .textContent.startsWith('Opened'),
      )
      await page
        .getByRole('button', { name: `Prepare form ${id(3)}`, exact: true })
        .click()
      const action = JSON.parse(
        await page.locator('[data-action]').textContent(),
      )
      assert.equal(
        action.operation,
        'platform-fixture:widget/record-batch@1.0.0',
      )
      assert.deepEqual(action.pairs, [['value.line[].widgetId', id(3)]])
    },
  )
  await record(
    'explicit browse pages append stable records and preserve the server order',
    async () => {
      await start(230)
      await call('configure', { mode: 'browse', cap: 250 })
      await idle()
      await call('remember', id(0))
      await call('select', id(0))
      await call('next')
      await idle()
      assert.equal((await read()).count, 200)
      assert.equal((await read()).identity, true)
      await call('next')
      await idle()
      const value = await read()
      assert.equal(value.count, 230)
      assert.equal(value.load.fullyRead, true)
      assert.equal(value.local, false)
      assert.equal(value.total, null)
      assert.deepEqual(
        value.sent
          .filter((request) => request.path === '/widget/query')
          .map((request) => request.item),
        [
          { limit: 100 },
          { cursor: '100', limit: 100 },
          { cursor: '200', limit: 50 },
        ],
      )
    },
  )
  await record('disposal ignores an outstanding load', async () => {
    await call('fault', '/widget/query', 'hold')
    await call('reload')
    await settle()
    await call('stop')
    await settle()
    assert.equal(await page.locator('[data-row]').count(), 0)
  })
  await record(
    'rapid scope changes start only the latest request',
    async () => {
      await start()
      await page.evaluate(() => {
        window.wamn.configure({ code: 'standard' })
        window.wamn.configure({ code: 'priority' })
      })
      await idle()
      const value = await read()
      assert.ok(value.sample.every((row) => row.code === 'priority'))
      assert.equal(
        value.sent.filter((request) => request.path === '/widget/query').length,
        1,
      )
    },
  )
  await record(
    'an empty complete set differs from a refusal and an emptied scope omits the filter',
    async () => {
      await call('configure', { code: 'absent' })
      await idle()
      let value = await read()
      assert.equal(value.count, 0)
      assert.equal(value.total, 0)
      assert.equal(value.local, true)
      assert.equal(value.page.refusal, null)
      await call('configure', { code: '' })
      await idle()
      value = await read()
      assert.equal(value.count, 8)
      assert.deepEqual(
        value.sent.filter((request) => request.path === '/widget/query').at(-1)
          .item,
        { limit: 100 },
      )
    },
  )
  await record(
    'a delayed reference lookup cannot suppress the current generation lookup',
    async () => {
      await start()
      await call('fault', '/widget-maker/get', 'hold')
      await call('reload')
      await idle()
      await call('reload')
      await idle()
      await call('release')
      await settle()
      assert.deepEqual(Object.values((await read()).labels).sort(), [
        'Northwind',
        'Southwind',
      ])
    },
  )
  await record(
    'an appended page cannot replace an already loaded ID',
    async () => {
      await start(230)
      await call('configure', { mode: 'browse', cap: 250 })
      await idle()
      await call('remember', id(0))
      await call('fault', '/widget/query', 'overlap')
      await call('next')
      await idle()
      const value = await read()
      assert.equal(value.count, 100)
      assert.equal(value.identity, true)
      assert.match(value.page.refusal, /Duplicate/)
      assert.equal(value.page.cursor, '100')
    },
  )
  await record(
    'an update with the wrong ID preserves the record and its draft',
    async () => {
      await start()
      await call('reload')
      await idle()
      await call('remember', id(0))
      await call('edit', id(0), { note: 'Keep this draft' })
      await call('fault', '/widget/update', 'wrongId')
      await call('save', id(0))
      await idle()
      const value = await read()
      assert.equal(value.identity, true)
      assert.equal(value.sample[0].note, 'Widget 0')
      assert.equal(value.drafts[id(0)].note, 'Keep this draft')
      assert.match(value.drafts[id(0)].message, /different record/)
    },
  )
  const sizes = (process.env.BENCH_SIZES ?? '1000,10000,50000')
    .split(',')
    .map(Number)
  for (const size of sizes) {
    await start()
    await call('stop')
    const empty = await metrics()
    await start()
    await call('synthetic', size)
    await settle()
    const loaded = await metrics()
    await call('remember', id(0))
    await call('select', id(0))
    await call('edit', id(0), { note: 'Draft survives scrolling' })
    const before = await metrics()
    for (const fraction of [0.1, 0.5, 1, 0.75, 0.25, 0]) {
      await call('scroll', Math.floor((size - 1) * fraction))
      await settle()
      const value = await read()
      assert.ok(value.visible.length > 0 && value.visible.length <= 20)
      if (fraction === 1)
        assert.ok(value.visible.some((row) => row.id === id(size - 1)))
    }
    await page
      .getByRole('textbox', { name: `Note ${id(0)}`, exact: true })
      .waitFor()
    assert.equal(
      await page
        .getByRole('textbox', { name: `Note ${id(0)}`, exact: true })
        .inputValue(),
      'Draft survives scrolling',
    )
    await call('filter', 'Widget 9')
    await settle()
    assert.equal((await read()).drafts[id(0)].note, 'Draft survives scrolling')
    await call('filter', '')
    await call('sort', true)
    await settle()
    await call('sort', false)
    await call('scroll', 0)
    await settle()
    const value = await read()
    assert.equal(value.identity, true)
    assert.equal(value.selection[id(0)], true)
    assert.ok(value.counts.maxLive <= 40)
    const after = await metrics()
    if (size === Math.max(...sizes)) {
      const counts = await snapshot('loaded')
      if (counts) {
        assert.equal(counts['Data records'], size)
        assert.equal(counts['Virtualizer instances'], 1)
        assert.equal(counts['Table rows'] ?? 0, 0)
        report.loadedHeapCounts = counts
      }
    }
    await call('discard', id(0))
    await call('stop')
    await settle()
    const disposed = await metrics()
    assert.ok(
      disposed.JSHeapUsedSize - empty.JSHeapUsedSize < 5 * 1024 * 1024,
      'Disposed fixture retained more than the 5 MiB diagnostic allowance',
    )
    if (size === Math.max(...sizes)) {
      const counts = await snapshot('disposed')
      if (counts) {
        for (const category of [
          'Data records',
          'Table rows',
          'Native row views',
          'Table cells',
          'Solid store targets',
          'Solid computations and effects',
          'Solid owner scopes',
          'Solid dependency links',
          'Virtualizer instances',
        ]) {
          assert.equal(
            counts[category] ?? 0,
            0,
            `Disposed heap retains ${category}`,
          )
        }
        report.disposedHeapCounts = counts
      }
    }
    report.benchmarks.push({
      size,
      emptyHeap: empty.JSHeapUsedSize,
      loadedHeap: loaded.JSHeapUsedSize,
      exercisedHeap: after.JSHeapUsedSize,
      disposedHeap: disposed.JSHeapUsedSize,
      scriptSeconds: after.ScriptDuration - before.ScriptDuration,
      counts: value.counts,
      hostLoad: loadavg(),
    })
    report.diagnostics.push(...(await call('diagnostics')))
    console.log(`PASS synthetic ${size} records`)
  }
  assert.deepEqual(report.errors, [])
  const unexpected = report.diagnostics.filter(
    (entry) => typeof entry !== 'string' && entry.code !== 'HUGE_FAN_IN',
  )
  assert.deepEqual(unexpected, [])
  report.provenance = await page.evaluate(() => window.wamn.provenance)
  await start()
  await call('reload')
  await idle()
  await page.screenshot({ path: '/tmp/table-wamn-fixture.png' })
  await call('stop')
} catch (error) {
  report.failure = String(error.stack)
  throw error
} finally {
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
