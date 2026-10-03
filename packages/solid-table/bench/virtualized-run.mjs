import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { loadavg } from 'node:os'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const distribution = Boolean(process.env.BENCH_DISTRIBUTION)
const assets = fileURLToPath(
  new URL(
    process.env.BENCH_DEVELOPMENT
      ? '../.bench-dev-dist/'
      : process.env.BENCH_PROFILE
        ? '../.heap-dist/'
        : distribution
          ? '../.bench-package-dist/'
          : '../.bench-dist/',
    import.meta.url,
  ),
)
const sizes = (process.env.BENCH_SIZES ?? '1000,10000,50000')
  .split(',')
  .map(Number)
const repeats = Number(process.env.BENCH_REPEATS ?? 3)
const extraColumns = Number(process.env.BENCH_EXTRA_COLUMNS ?? 0)
const output = process.env.BENCH_OUTPUT ?? '/tmp/table-native-virtualized.json'
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
    response.end(await readFile(assets + path))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch()
  const samples = []
  for (const size of sizes)
    for (let repeat = 0; repeat < repeats; repeat++) {
      const page = await browser.newPage({
        viewport: { width: 1200, height: 900 },
      })
      const errors = []
      const graphWarnings = []
      page.on('pageerror', (error) => {
        errors.push(error.message)
        console.error(error.stack)
      })
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type()))
          (message.type() === 'warning' &&
          message.text().startsWith('[HUGE_FAN_IN]')
            ? graphWarnings
            : errors
          ).push(message.text())
      })
      const client = await page.context().newCDPSession(page)
      await client.send('Performance.enable')
      const settle = () =>
        page.evaluate(
          () =>
            new Promise((resolve) => {
              let frames = 4
              const frame = () => {
                if (--frames === 0) resolve()
                else requestAnimationFrame(frame)
              }
              requestAnimationFrame(frame)
            }),
        )
      const metrics = async () => {
        await settle()
        await client.send('HeapProfiler.collectGarbage')
        return Object.fromEntries(
          (await client.send('Performance.getMetrics')).metrics.map(
            ({ name, value }) => [name, value],
          ),
        )
      }
      async function snapshot(stage) {
        if (
          !process.env.BENCH_HEAPS ||
          size !== Math.max(...sizes) ||
          repeat !== 0
        )
          return
        await mkdir(process.env.BENCH_HEAPS, { recursive: true })
        const stream = createWriteStream(
          `${process.env.BENCH_HEAPS}/${stage}.heapsnapshot`,
        )
        const write = ({ chunk }) => stream.write(chunk)
        client.on('HeapProfiler.addHeapSnapshotChunk', write)
        await client.send('HeapProfiler.takeHeapSnapshot', {
          reportProgress: false,
        })
        client.off('HeapProfiler.addHeapSnapshotChunk', write)
        stream.end()
        await finished(stream)
      }
      await page.goto(
        `http://127.0.0.1:${server.address().port}/virtualized.html`,
      )
      await (await page.waitForFunction(() => window.nativeVirtual)).dispose()
      const emptyHeap = await metrics()
      await page.evaluate(
        ({ size, extraColumns }) =>
          window.nativeVirtual.start(size, extraColumns),
        { size, extraColumns },
      )
      await settle()
      const make = (i) => ({
        id: `r${i}`,
        name: `Person ${i}`,
        region: `Region ${i % 5}`,
        amount: i % 100,
        description: `Record ${i}. A description that can wrap when this column becomes narrow.`,
        unused: 0,
      })
      const records = new Map(
        Array.from({ length: size }, (_, i) => {
          const row = make(i)
          return [row.id, row]
        }),
      )
      let ids = [...records.keys()]
      let next = size
      let descending = false
      let threshold
      let grouping = false
      let busy = false
      let pinned = { top: [], bottom: [] }
      const expanded = new Set()
      const rowKey = (id) => JSON.stringify(['row', id])
      const groupKey = (region) =>
        JSON.stringify(['group', [['region', 'string', region]]])
      function oracle() {
        const filtered = ids.filter(
          (id) =>
            busy ||
            threshold === undefined ||
            records.get(id).amount >= threshold,
        )
        const sort = (values) =>
          descending && !busy
            ? [...values].sort(
                (a, b) => records.get(b).amount - records.get(a).amount,
              )
            : values
        let display
        const groups = new Map()
        if (grouping && !busy) {
          for (const id of filtered) {
            const region = records.get(id).region
            if (!groups.has(region)) groups.set(region, [])
            groups.get(region).push(id)
          }
          display = [...groups].flatMap(([region, members]) => [
            groupKey(region),
            ...(expanded.has(region) ? sort(members).map(rowKey) : []),
          ])
        } else display = sort(filtered).map(rowKey)
        const available = new Set(ids)
        const seen = new Set()
        const pins = (items) =>
          items
            .filter((id) => {
              if (
                !available.has(id) ||
                seen.has(id) ||
                (grouping && !busy && !expanded.has(records.get(id).region))
              )
                return false
              seen.add(id)
              return true
            })
            .map(rowKey)
        const top = pins(pinned.top)
        const bottom = pins(pinned.bottom)
        const excluded = new Set([...top, ...bottom])
        return {
          top,
          center: display.filter((key) => !excluded.has(key)),
          bottom,
          groups,
        }
      }
      let peakRows = 0
      async function inspect(name) {
        const actual = await page.evaluate(() => window.nativeVirtual.read())
        const expected = oracle()
        assert.deepEqual(
          actual.sections,
          {
            top: expected.top,
            center: expected.center,
            bottom: expected.bottom,
          },
          `${name}: full sections`,
        )
        assert.equal(
          Number(actual.viewport.rowcount),
          expected.top.length +
            expected.center.length +
            expected.bottom.length +
            1,
        )
        assert.equal(actual.viewport.busy, String(busy))
        assert.ok(
          actual.rows.length <=
            40 + expected.top.length + expected.bottom.length,
          `${name}: unbounded rows`,
        )
        assert.equal(
          actual.stats.rows - actual.stats.unmounts,
          actual.rows.length,
          `${name}: owner lifetime`,
        )
        assert.equal(
          new Set(actual.rows.map((row) => row.key)).size,
          actual.rows.length,
          `${name}: duplicate rendered key`,
        )
        peakRows = Math.max(peakRows, actual.rows.length)
        for (const row of actual.rows) {
          const sequence = expected[row.section]
          const index = sequence.indexOf(row.key)
          assert.ok(index >= 0, `${name}: unexpected row key`)
          if (row.section === 'center')
            assert.equal(row.index, index, `${name}: wrong measurement index`)
          const position =
            row.section === 'top'
              ? index
              : row.section === 'center'
                ? expected.top.length + index
                : expected.top.length + expected.center.length + index
          assert.equal(row.aria, position + 2)
          const [kind, value] = JSON.parse(row.key)
          const members =
            kind === 'group' ? expected.groups.get(value[0][2]) : undefined
          for (const cell of row.cells) {
            const expectedText =
              kind === 'row'
                ? String(
                    records.get(value)[
                      cell.column.startsWith('extra_') ? 'name' : cell.column
                    ],
                  )
                : cell.column === 'id'
                  ? `${expanded.has(value[0][2]) ? '−' : '+'} ${members.length}`
                  : cell.column === 'region'
                    ? value[0][2]
                    : cell.column === 'amount'
                      ? String(
                          members.reduce(
                            (sum, id) => sum + records.get(id).amount,
                            0,
                          ),
                        )
                      : ''
            assert.equal(
              cell.text,
              expectedText,
              `${name}: ${row.key} ${cell.column}`,
            )
            const header = actual.headers.find(
              (item) => item.column === cell.column,
            )
            assert.ok(
              Math.abs(cell.left - header.left) <= 1 &&
                Math.abs(cell.width - header.width) <= 1,
              `${name}: header alignment ${cell.column}`,
            )
          }
        }
        const center = actual.rows.filter((row) => row.section === 'center')
        center.forEach((row, index) => {
          const item = actual.items.find((item) => item.key === row.key)
          assert.ok(item, `${name}: missing geometry`)
          assert.ok(
            Math.abs(item.size - row.height) <= 1,
            `${name}: stale measured height ${item.size} != ${row.height}`,
          )
          if (index)
            assert.ok(
              Math.abs(row.top - center[index - 1].bottom) <= 1,
              `${name}: gap or overlap`,
            )
        })
        assert.ok(
          Math.abs(actual.header.top - (actual.viewport.top + 1)) <= 1,
          `${name}: sticky header`,
        )
        if (expected.center.length)
          assert.ok(center.length, `${name}: blank viewport`)
        assert.ok(
          actual.elements <= actual.rows.length,
          `${name}: detached measured elements retained`,
        )
        const cover = Math.max(
          actual.header.bottom,
          ...actual.rows
            .filter((row) => row.section === 'top')
            .map((row) => row.bottom),
        )
        const anchor = center.find((row) => row.bottom > cover)
        return {
          anchor: anchor && { key: anchor.key, offset: anchor.top - cover },
          rows: actual.rows.length,
          stats: actual.stats,
          total: actual.total,
          measured: actual.measured,
          first: center[0]?.key,
          offset: actual.viewport.scrollTop,
        }
      }
      const initial = await inspect('initial')
      if (process.env.BENCH_SCREENSHOT && repeat === 0)
        await page.screenshot({ path: process.env.BENCH_SCREENSHOT })
      const steps = []
      async function step(name, value, update = () => {}, label = name) {
        update()
        const before = await page.evaluate(() => window.nativeVirtual.stats())
        const began = performance.now()
        await page.evaluate(
          ({ name, value }) => window.nativeVirtual.command(name, value),
          { name, value },
        )
        await settle()
        const after = await page.evaluate(() => window.nativeVirtual.stats())
        const delta = Object.fromEntries(
          Object.entries(after).map(([key, value]) => [
            key,
            value - before[key],
          ]),
        )
        steps.push({
          name: label,
          milliseconds: performance.now() - began,
          counts: delta,
          result: await inspect(label),
        })
        if (label === 'unrelated')
          assert.deepEqual(delta, { rows: 0, cells: 0, unmounts: 0, reads: 0 })
        if (label === 'featureScroll')
          assert.equal(
            delta.reads,
            delta.cells,
            'scroll reran filter or sort data reads',
          )
        if (label === 'visibleEdit') {
          assert.equal(delta.rows, 0)
          assert.equal(delta.cells, 0)
          assert.equal(delta.reads, 1 + extraColumns)
        }
        return steps.at(-1).result
      }
      const loadBefore = loadavg()
      await step(
        'edit',
        { id: 'r1', update: { name: 'Changed' } },
        () => {
          records.get('r1').name = 'Changed'
        },
        'visibleEdit',
      )
      await step(
        'edit',
        { id: 'r0', update: { unused: 1 } },
        () => {},
        'unrelated',
      )
      await step('append', undefined, () => {
        const row = make(next++)
        records.set(row.id, row)
        ids.push(row.id)
      })
      let anchored = await step(
        'scroll',
        Math.floor(size / 2) + 23,
        undefined,
        'middle',
      )
      function sameAnchor(before, after, label) {
        assert.equal(
          after.anchor?.key,
          before.anchor?.key,
          `${label}: anchor key`,
        )
        assert.ok(
          Math.abs(after.anchor.offset - before.anchor.offset) <= 1,
          `${label}: anchor offset ${before.anchor.offset} -> ${after.anchor.offset}`,
        )
      }
      const afterRemoval = await step(
        'remove',
        'r20',
        () => {
          ids = ids.filter((id) => id !== 'r20')
          records.delete('r20')
        },
        'removeAbove',
      )
      sameAnchor(anchored, afterRemoval, 'removeAbove')
      const anchorId = JSON.parse(anchored.anchor.key)[1]
      const aboveId = ids[ids.indexOf(anchorId) - 2]
      const expandedAbove = await step(
        'detail',
        aboveId,
        undefined,
        'expandAbove',
      )
      sameAnchor(anchored, expandedAbove, 'expandAbove')
      const collapsedAbove = await step(
        'detail',
        aboveId,
        undefined,
        'collapseAbove',
      )
      sameAnchor(anchored, collapsedAbove, 'collapseAbove')
      const afterResize = await step('resize', 150, undefined, 'resizeAnchor')
      sameAnchor(anchored, afterResize, 'resizeAnchor')
      anchored = await step('resize', 330, undefined, 'restoreAnchorWidth')
      sameAnchor(afterResize, anchored, 'restoreAnchorWidth')
      const afterSort = await step(
        'sort',
        true,
        () => {
          descending = true
        },
        'sortAnchor',
      )
      sameAnchor(anchored, afterSort, 'sortAnchor')
      const afterClear = await step(
        'sort',
        false,
        () => {
          descending = false
        },
        'clearAnchorSort',
      )
      sameAnchor(afterSort, afterClear, 'clearAnchorSort')
      const vanished = await step(
        'remove',
        anchorId,
        () => {
          ids = ids.filter((id) => id !== anchorId)
          records.delete(anchorId)
        },
        'removeAnchor',
      )
      assert.ok(
        Math.abs(vanished.offset - afterClear.offset) <= 1,
        'removed anchor retains pixel offset',
      )
      await step('scroll', size, undefined, 'end')
      await step('scroll', 0, undefined, 'start')
      await step('select', 'r1')
      await step('pin', { top: ['r0'], bottom: ['r1'] }, () => {
        pinned = { top: ['r0'], bottom: ['r1'] }
      })
      await step('sort', true, () => {
        descending = true
      })
      await step('filter', 80, () => {
        threshold = 80
      })
      await step('scroll', Math.floor(size / 10), undefined, 'featureScroll')
      await step(
        'filter',
        null,
        () => {
          threshold = undefined
        },
        'clearFilter',
      )
      await step(
        'sort',
        false,
        () => {
          descending = false
        },
        'clearSort',
      )
      await step('group', true, () => {
        grouping = true
      })
      await step('expandGroups', true, () => {
        for (let i = 0; i < 5; i++) expanded.add(`Region ${i}`)
      })
      await step('scroll', 100, undefined, 'groupScroll')
      await step('collapseFirst', undefined, () => {
        expanded.delete('Region 0')
      })
      await step(
        'group',
        false,
        () => {
          grouping = false
        },
        'ungroup',
      )
      await step('scroll', 0, undefined, 'returnStart')
      await step('detail', 'r2')
      await step('resize', 150)
      await step('horizontal', 140)
      await step('resize', 500, undefined, 'widen')
      await step('horizontal', 350, undefined, 'wideScroll')
      await step('hide', true)
      await step('hide', false, undefined, 'show')
      await step('remove', 'r0', () => {
        ids = ids.filter((id) => id !== 'r0')
        records.delete('r0')
      })
      await step('refresh', undefined, () => {
        for (const row of records.values()) row.amount = (row.amount + 1) % 100
      })
      await step('empty', true, () => {
        ids = []
      })
      await step('busy', true, () => {
        busy = true
      })
      await step(
        'empty',
        false,
        () => {
          ids = [...records.keys()]
        },
        'restore',
      )
      await step(
        'busy',
        false,
        () => {
          busy = false
        },
        'complete',
      )
      await step('resize', 330, undefined, 'restoreWidth')
      await step('detail', 'r2', undefined, 'closeDetail')
      await step(
        'pin',
        { top: [], bottom: [] },
        () => {
          pinned = { top: [], bottom: [] }
        },
        'unpin',
      )
      // Actual pointer and keyboard events exercise editor lifetime across windows.
      const invoke = async (name, value) => {
        await page.evaluate(
          ({ name, value }) => window.nativeVirtual.command(name, value),
          { name, value },
        )
        await settle()
      }
      const interaction = async () =>
        (await page.evaluate(() => window.nativeVirtual.read())).interaction
      const row = (id) =>
        page.locator('[data-key]').filter({
          has: page.getByRole('button', {
            name: `Select ${id}`,
            exact: true,
          }),
        })
      await invoke('horizontal', 0)
      await invoke('scroll', 0)
      await row('r1').locator('[data-column="name"]').dblclick()
      const editor = page.getByRole('textbox', {
        name: 'Name for r1',
        exact: true,
      })
      await editor.fill('Draft survives scrolling')
      assert.equal((await interaction()).focused, 'r1')
      await invoke('scroll', Math.floor(size / 2))
      assert.equal(
        await editor.count(),
        0,
        JSON.stringify({
          interaction: await interaction(),
          errors,
          geometry: await page.evaluate(() => {
            const value = window.nativeVirtual.read()
            return {
              offset: value.viewport.scrollTop,
              first: value.rows[0]?.key,
              rows: value.rows.length,
            }
          }),
        }),
      )
      let state = await interaction()
      assert.equal(state.focused, 'grid')
      assert.equal(state.drafts.r1.value, 'Draft survives scrolling')
      assert.ok(state.selected.includes('r1'))
      await invoke('scroll', 0)
      assert.equal(await editor.inputValue(), 'Draft survives scrolling')
      assert.equal(
        (await interaction()).focused,
        'grid',
        'remount does not steal focus',
      )
      await page
        .getByRole('checkbox', { name: 'Refuse next save (demo)' })
        .check()
      await page.getByRole('button', { name: 'Save edit', exact: true }).click()
      assert.match(await page.getByRole('alert').innerText(), /refused/)
      await invoke('scroll', Math.floor(size / 2))
      assert.match((await interaction()).drafts.r1.message, /refused/)
      await page.getByRole('button', { name: 'Save edit', exact: true }).click()
      records.get('r1').name = 'Draft survives scrolling'
      await settle()
      assert.deepEqual((await interaction()).drafts, {})
      await inspect('saveAfterRefusal')
      await invoke('scroll', 0)
      await row('r1').locator('[data-column="name"]').dblclick()
      await editor.fill('Local unsaved name')
      await invoke('edit', { id: 'r1', update: { name: 'Concurrent name' } })
      records.get('r1').name = 'Concurrent name'
      await page.getByRole('button', { name: 'Save edit', exact: true }).click()
      assert.match(
        await page.getByRole('alert').innerText(),
        /changed after editing/,
      )
      assert.equal((await interaction()).drafts.r1.value, 'Local unsaved name')
      await page
        .getByRole('button', { name: 'Cancel edit', exact: true })
        .click()
      await settle()
      await inspect('cancelConflict')
      await row('r1').locator('[data-column="name"]').dblclick()
      await editor.fill('Draft survives filtering')
      await invoke('filter', 80)
      threshold = 80
      state = await interaction()
      assert.equal(state.focused, 'grid')
      assert.equal(state.editing, 'r1')
      assert.equal(state.drafts.r1.value, 'Draft survives filtering')
      assert.ok(state.selected.includes('r1'))
      assert.equal(state.descendant, null)
      await invoke('sort', true)
      descending = true
      await invoke('filter', null)
      threshold = undefined
      await page.getByRole('button', { name: 'Save edit', exact: true }).click()
      records.get('r1').name = 'Draft survives filtering'
      await settle()
      await inspect('saveAfterSortAndFilter')
      await invoke('sort', false)
      descending = false
      await invoke('scroll', 0)
      await row('r3').locator('[data-column="name"]').dblclick()
      const removedEditor = page.getByRole('textbox', {
        name: 'Name for r3',
        exact: true,
      })
      await removedEditor.fill('Removed draft')
      await invoke('remove', 'r3')
      ids = ids.filter((id) => id !== 'r3')
      records.delete('r3')
      await page.getByRole('button', { name: 'Save edit', exact: true }).click()
      assert.match(
        await page.getByRole('alert').innerText(),
        /no longer loaded/,
      )
      assert.equal((await interaction()).drafts.r3.value, 'Removed draft')
      await page
        .getByRole('button', { name: 'Cancel edit', exact: true })
        .click()
      await invoke('scroll', 0)
      await row('r1').locator('[data-column="name"]').click()
      const grid = page.getByRole('grid', { name: 'People', exact: true })
      for (let i = 0; i < 25; i++) await grid.press('ArrowDown')
      await settle()
      state = await interaction()
      assert.deepEqual(state.active, { key: rowKey(ids[25]), column: 'name' })
      assert.equal(state.focused, 'grid')
      assert.equal(state.descendantExists, true)
      const activePosition = await page.evaluate(() => {
        const grid = document.querySelector('[role="grid"]')
        const cell = document.getElementById(
          grid.getAttribute('aria-activedescendant'),
        )
        return {
          cell: cell.getBoundingClientRect().toJSON(),
          grid: grid.getBoundingClientRect().toJSON(),
        }
      })
      assert.ok(activePosition.cell.top >= activePosition.grid.top + 36)
      assert.ok(activePosition.cell.bottom <= activePosition.grid.bottom)
      await grid.press('Enter')
      const keyboardEditor = page.getByRole('textbox', {
        name: `Name for ${ids[25]}`,
        exact: true,
      })
      await keyboardEditor.fill('Keyboard draft')
      await keyboardEditor.press('Escape')
      await settle()
      assert.deepEqual((await interaction()).drafts, {})
      await grid.press('Control+End')
      await settle()
      assert.equal((await interaction()).active.key, rowKey(ids.at(-1)))
      assert.equal((await interaction()).descendantExists, true)
      await grid.press('Control+Home')
      await settle()
      assert.equal((await interaction()).active.key, rowKey(ids[0]))
      await grid.press('ArrowRight')
      await grid.press('ArrowRight')
      await grid.press('ArrowRight')
      await settle()
      const horizontalFocus = await page.evaluate(() => {
        const grid = document.querySelector('[role="grid"]')
        const cell = document.getElementById(
          grid.getAttribute('aria-activedescendant'),
        )
        return {
          cell: cell.getBoundingClientRect().toJSON(),
          grid: grid.getBoundingClientRect().toJSON(),
        }
      })
      assert.ok(horizontalFocus.cell.left >= horizontalFocus.grid.left + 100)
      assert.ok(horizontalFocus.cell.right <= horizontalFocus.grid.right - 110)
      await inspect('keyboardAndDrafts')
      const scrollCountsBefore = await page.evaluate(() =>
        window.nativeVirtual.stats(),
      )
      const scrollBefore = await client.send('Performance.getMetrics')
      const frames = await page.evaluate(async () => {
        const viewport = document.querySelector('.native-viewport')
        const times = []
        let previous = performance.now()
        for (let i = 0; i < 90; i++) {
          viewport.scrollTop =
            (i / 89) * (viewport.scrollHeight - viewport.clientHeight)
          await new Promise(requestAnimationFrame)
          const now = performance.now()
          times.push(now - previous)
          previous = now
        }
        return times
      })
      await settle()
      const scrollAfter = await client.send('Performance.getMetrics')
      await inspect('scriptedScroll')
      const scrollCountsAfter = await page.evaluate(() =>
        window.nativeVirtual.stats(),
      )
      const scrollCounts = Object.fromEntries(
        Object.entries(scrollCountsAfter).map(([key, value]) => [
          key,
          value - scrollCountsBefore[key],
        ]),
      )
      assert.equal(
        scrollCounts.reads,
        scrollCounts.cells,
        'scroll reads only newly mounted cells',
      )
      const loaded = await metrics()
      await snapshot('loaded')
      const final = await page.evaluate(() => window.nativeVirtual.dispose())
      await settle()
      assert.equal(final.rows, final.unmounts)
      for (const entry of final.diagnostics ?? []) {
        assert.ok(
          ['sort', 'filter', 'group'].includes(entry.phase),
          `Unexpected diagnostic: ${JSON.stringify(entry)}`,
        )
        for (const event of entry.events) {
          assert.equal(event.code, 'HUGE_FAN_IN')
          assert.equal(event.kind, 'graph')
          assert.ok(event.data.count >= size * 2)
        }
      }
      const disposed = await metrics()
      await snapshot('disposed')
      assert.ok(
        disposed.JSHeapUsedSize - emptyHeap.JSHeapUsedSize <
          Math.max(
            5 * 2 ** 20,
            (loaded.JSHeapUsedSize - emptyHeap.JSHeapUsedSize) * 0.05,
          ),
        `Unbounded retained heap: empty=${emptyHeap.JSHeapUsedSize}, loaded=${loaded.JSHeapUsedSize}, disposed=${disposed.JSHeapUsedSize}`,
      )
      assert.deepEqual(errors, [])
      assert.equal(
        graphWarnings.length,
        (final.diagnostics ?? []).reduce(
          (count, entry) => count + entry.events.length,
          0,
        ),
      )
      samples.push({
        size,
        columnCount: 5 + extraColumns,
        repeat,
        initial,
        steps,
        peakRows,
        final,
        graphWarnings,
        frames,
        scrollCounts,
        scrollBefore,
        scrollAfter,
        emptyHeap,
        loaded,
        disposed,
        loadBefore,
        loadAfter: loadavg(),
      })
      await page.close()
      console.log(
        `${size} records sample ${repeat + 1}: ${steps.length} states, peak ${peakRows} rows, cleanup passed`,
      )
    }
  const assetHashes = {}
  for (const name of await readdir(assets + '/assets'))
    assetHashes[name] = createHash('sha256')
      .update(await readFile(assets + '/assets/' + name))
      .digest('hex')
  await writeFile(
    output,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        browser: browser.version(),
        distribution,
        samples,
        assetHashes,
        contention: 'Shared host. Timing values are advisory.',
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser?.close()
  await new Promise((resolve) => server.close(resolve))
}
