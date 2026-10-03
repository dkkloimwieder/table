import assert from 'node:assert/strict'

const work = (value) =>
  Object.fromEntries(
    [
      'name',
      'note',
      'priority',
      'amount',
      'dueDate',
      'groupReads',
      'aggregates',
      'views',
      'cells',
      'groupViews',
      'groupCells',
      'validations',
      'requests',
    ].map((key) => [key, value.counts[key]]),
  )

export async function resizeCases({
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
}) {
  const handle = (label = 'Name') =>
    page.getByRole('separator', { name: `Resize ${label} column`, exact: true })
  async function begin(label = 'Name', beforeDown = async () => {}) {
    await handle(label).scrollIntoViewIfNeeded()
    const box = await handle(label).boundingBox()
    const point = {
      x: box.x + box.width / 2,
      y: box.y + Math.min(box.height / 2, 24),
    }
    await page.mouse.move(point.x, point.y)
    await beforeDown()
    await page.mouse.down()
    return point
  }
  async function drag(label, delta) {
    const point = await begin(label)
    await page.mouse.move(point.x + delta, point.y, { steps: 5 })
    await page.mouse.up()
    await settle()
  }
  async function aligned() {
    const layout = await page.evaluate(() => {
      const table = document.querySelector('table')
      const headings = [...table.querySelectorAll('th[data-column-header]')]
      const row = table.querySelector('[data-row]')
      return {
        width: table.getBoundingClientRect().width,
        configured: [...table.querySelectorAll('col')].reduce(
          (sum, col) => sum + parseFloat(col.style.width),
          0,
        ),
        columns: headings.map((heading, index) => {
          const header = heading.getBoundingClientRect()
          const body = row?.children[index]?.getBoundingClientRect()
          return {
            id: heading.dataset.columnHeader,
            headerWidth: header.width,
            bodyWidth: body?.width,
            offset: body ? header.left - body.left : 0,
          }
        }),
        groups: [...table.querySelectorAll('[data-group] [data-column]')].map(
          (cell) => {
            const header = headings.find(
              (h) => h.dataset.columnHeader === cell.dataset.column,
            )
            const a = header.getBoundingClientRect()
            const b = cell.getBoundingClientRect()
            return { width: a.width - b.width, offset: a.left - b.left }
          },
        ),
      }
    })
    assert.ok(
      Math.abs(layout.width - layout.configured) <= 1,
      JSON.stringify(layout),
    )
    for (const column of layout.columns) {
      assert.ok(
        Math.abs(column.headerWidth - (await read()).widths[column.id]) <= 1,
        JSON.stringify(column),
      )
      if (column.bodyWidth != null)
        assert.ok(
          Math.abs(column.headerWidth - column.bodyWidth) <= 1 &&
            Math.abs(column.offset) <= 1,
          JSON.stringify(column),
        )
    }
    for (const cell of layout.groups)
      assert.ok(
        Math.abs(cell.width) <= 1 && Math.abs(cell.offset) <= 1,
        JSON.stringify(cell),
      )
  }
  await record(
    'pointer resizing moves headers and cells together before release without scanning records',
    async () => {
      await start()
      await call('remember', 'R0001')
      const before = await read()
      let listeners
      const point = await begin('Name', async () => {
        await cdp.send('HeapProfiler.collectGarbage')
        listeners = (await cdp.send('Memory.getDOMCounters')).jsEventListeners
      })
      await page.mouse.move(point.x + 87, point.y, { steps: 8 })
      await settle()
      const preview = await read()
      assert.equal(preview.widths.name, before.widths.name + 87)
      assert.equal(
        preview.counts.sizingChanges - before.counts.sizingChanges,
        8,
      )
      await aligned()
      assert.equal(preview.counts.resizeListeners, 4)
      assert.equal(
        Number(await handle().getAttribute('aria-valuenow')),
        before.widths.name + 87,
      )
      assert.deepEqual(work(preview), work(before))
      // CDP counts unreachable automation listeners until collection.
      await cdp.send('HeapProfiler.collectGarbage')
      assert.equal(
        (await cdp.send('Memory.getDOMCounters')).jsEventListeners,
        listeners + 4,
      )
      await page.mouse.up()
      await settle()
      const after = await read()
      assert.equal(after.widths.name, before.widths.name + 87)
      assert.equal(after.widths.note, before.widths.note)
      assert.equal(after.counts.sizingChanges - before.counts.sizingChanges, 8)
      assert.equal(after.counts.resizeListeners, 0)
      assert.equal(after.identity, true)
      assert.deepEqual(work(after), work(before))
      // CDP counts unreachable automation listeners until collection.
      await cdp.send('HeapProfiler.collectGarbage')
      assert.equal(
        (await cdp.send('Memory.getDOMCounters')).jsEventListeners,
        listeners,
      )
      await aligned()
    },
  )
  await record(
    'keyboard resizing honors bounds without reset controls or column sorting',
    async () => {
      await start()
      const before = await read()
      await handle().focus()
      await page.keyboard.press('ArrowRight')
      assert.equal((await read()).widths.name, 230)
      await page.keyboard.press('Shift+ArrowRight')
      assert.equal((await read()).widths.name, 280)
      await page.keyboard.press('ArrowLeft')
      assert.equal((await read()).widths.name, 270)
      await page.keyboard.press('Home')
      assert.equal((await read()).widths.name, 140)
      await page.keyboard.press('ArrowLeft')
      assert.equal((await read()).widths.name, 140)
      await page.keyboard.press('End')
      assert.equal((await read()).widths.name, 640)
      await handle().dblclick()
      assert.equal((await read()).widths.name, 640)
      assert.equal(
        await page.getByRole('button', { name: /Reset .*width/ }).count(),
        0,
      )
      assert.deepEqual((await read()).ids, before.ids)
      assert.equal(await page.locator('th[aria-sort]').count(), 0)
      assert.deepEqual(work(await read()), work(before))
      await aligned()
    },
  )
  await record(
    'fixed-width resizing transfers space to the adjacent column and respects both bounds',
    async () => {
      await start()
      await page.getByText('Display options', { exact: true }).click()
      await page
        .getByRole('combobox', { name: 'Resize behavior', exact: true })
        .selectOption('fixed')
      const before = await read()
      const tableWidth = async () =>
        page
          .locator('table')
          .evaluate((node) => node.getBoundingClientRect().width)
      const total = await tableWidth()
      const point = await begin()
      await page.mouse.move(point.x + 87, point.y, { steps: 8 })
      await settle()
      assert.equal((await read()).widths.name, 307)
      assert.equal((await read()).widths.note, 173)
      assert.equal(await tableWidth(), total)
      await aligned()
      await page.mouse.up()
      await handle().focus()
      await page.keyboard.press('End')
      assert.equal((await read()).widths.name, 340)
      assert.equal((await read()).widths.note, 140)
      await page.keyboard.press('ArrowRight')
      assert.equal((await read()).widths.name, 340)
      await page.keyboard.press('Home')
      assert.equal((await read()).widths.name, 140)
      assert.equal((await read()).widths.note, 340)
      assert.equal(await tableWidth(), total)
      assert.equal(await handle('Due date').count(), 0)
      assert.deepEqual(work(await read()), work(before))
      await aligned()
      await page
        .getByRole('combobox', { name: 'Resize behavior', exact: true })
        .selectOption('grow')
      await drag('Name', 20)
      assert.equal((await read()).widths.note, 340)
      assert.equal(await tableWidth(), total + 20)
      await page
        .getByRole('combobox', { name: 'Resize behavior', exact: true })
        .selectOption('fixed')
      await drag('Name', 20)
      assert.equal(await tableWidth(), total + 20)
      await aligned()
    },
  )
  await record(
    'fixed-width mode uses the next visible column and unmounting the table discards widths',
    async () => {
      await start()
      await call('controls', { resizeBehavior: 'fixed' })
      await call('visibility', 'note', false)
      const total = await page
        .locator('table')
        .evaluate((node) => node.getBoundingClientRect().width)
      await drag('Name', 100)
      assert.equal((await read()).widths.name, 240)
      assert.equal((await read()).widths.priority, 120)
      assert.equal((await read()).widths.note, 260)
      assert.equal(
        await page
          .locator('table')
          .evaluate((node) => node.getBoundingClientRect().width),
        total,
      )
      await aligned()
      await start()
      assert.equal((await read()).widths.name, 220)
      assert.deepEqual((await read()).columnSizing, {})
    },
  )
  await record(
    'pointer bounds clamp widths and secondary pointers cannot start a resize',
    async () => {
      await start()
      const before = await read()
      await handle().dispatchEvent('pointerdown', {
        pointerId: 2,
        button: 0,
        isPrimary: false,
      })
      await handle().dispatchEvent('pointerdown', {
        pointerId: 1,
        button: 2,
        isPrimary: true,
      })
      assert.equal(
        (await read()).counts.resizeStarts,
        before.counts.resizeStarts,
      )
      await drag('Name', 850)
      assert.equal((await read()).widths.name, 640)
      await drag('Name', -600)
      assert.equal((await read()).widths.name, 140)
      assert.deepEqual(work(await read()), work(before))
      await aligned()
    },
  )
  await record(
    'Escape, pointer cancellation, lost capture and blur end live resizing at the current width',
    async () => {
      await start()
      const before = await read()
      for (const event of [
        'escape',
        'pointercancel',
        'lostpointercapture',
        'blur',
      ]) {
        const width = (await read()).widths.name
        const point = await begin()
        await page.mouse.move(point.x + 45, point.y)
        if (event === 'escape') await page.keyboard.press('Escape')
        else if (event === 'blur')
          await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        else await handle().dispatchEvent(event, { pointerId: 1 })
        await page.mouse.up()
        await settle()
        assert.equal((await read()).widths.name, width + 45)
        assert.equal((await read()).counts.resizeListeners, 0)
      }
      assert.deepEqual(work(await read()), work(before))
      assert.equal(
        (await read()).counts.sizingChanges,
        before.counts.sizingChanges + 4,
      )
    },
  )
  await record(
    'caller width updates cancel stale gestures and preserve unrelated widths',
    async () => {
      await start()
      const point = await begin()
      await page.mouse.move(point.x + 80, point.y)
      await call('sizing', { name: 310, note: 360 })
      await settle()
      assert.equal((await read()).counts.resizeListeners, 0)
      await page.mouse.up()
      assert.equal((await read()).widths.name, 310)
      assert.equal((await read()).widths.note, 360)
      await aligned()
    },
  )
  await record(
    'resizing survives grouping, headers and draft saving with aligned record and summary cells',
    async () => {
      await start(8, 'table')
      await call('controls', { filters: 'headers' })
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Retained resize draft')
      await call('grouping', ['priority', 'name'])
      await call('expandGroups', true)
      await drag('Note', 100)
      assert.equal((await read()).drafts.R0001.note, 'Retained resize draft')
      assert.equal((await read()).counts.requests, 0)
      await aligned()
      await call('visibility', 'amount', false)
      await aligned()
      await call('visibility', 'amount', true)
      await call('grouping', [])
      await page.getByRole('button', { name: 'Save all', exact: true }).click()
      await idle()
      assert.equal((await read()).sample[0].note, 'Retained resize draft')
      assert.equal((await read()).widths.note, 360)
      assert.deepEqual((await read()).drafts, {})
    },
  )
  await record(
    'resizing is independently configurable and remains available with manual processing',
    async () => {
      await start()
      await call('sizing', { name: 300 })
      await call('controls', { columnResizing: false, headerSorting: false })
      assert.equal(await page.getByRole('separator').count(), 0)
      assert.equal((await read()).widths.name, 300)
      await call('controls', { columnResizing: true })
      await call('localProcessing', false)
      await drag('Name', 20)
      assert.equal((await read()).widths.name, 320)
      assert.equal(
        await page
          .getByRole('button', { name: 'Sort by Name', exact: true })
          .count(),
        0,
      )
    },
  )
  await record(
    'touch resizing changes the whole column live and cancellation keeps the current width',
    async () => {
      for (const behavior of ['grow', 'fixed']) {
        await start()
        await call('controls', { resizeBehavior: behavior })
        await handle().scrollIntoViewIfNeeded()
        const box = await handle().boundingBox()
        const touch = { x: box.x + box.width / 2, y: box.y + 20, id: 1 }
        await cdp.send('Emulation.setTouchEmulationEnabled', {
          enabled: true,
          maxTouchPoints: 1,
        })
        try {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [touch],
          })
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...touch, x: touch.x + 60 }],
          })
          assert.equal((await read()).widths.name, 280)
          await aligned()
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          })
          await settle()
          assert.equal((await read()).widths.name, 280)
          const next = { ...touch, x: touch.x + 60 }
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [next],
          })
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...next, x: next.x + 40 }],
          })
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchCancel',
            touchPoints: [],
          })
          await settle()
          assert.equal((await read()).widths.name, 320)
          assert.equal(
            (await read()).widths.note,
            behavior === 'fixed' ? 160 : 260,
          )
          assert.equal((await read()).counts.resizeListeners, 0)
        } finally {
          await cdp.send('Emulation.setTouchEmulationEnabled', {
            enabled: false,
          })
        }
      }
    },
  )
  await record(
    'horizontal scrolling during live resizing keeps cells aligned without page overflow',
    async () => {
      await page.setViewportSize({ width: 390, height: 844 })
      try {
        await start()
        const point = await begin()
        const before = await read()
        const shift = await page.locator('.table-scroll').evaluate((node) => {
          const previous = node.scrollLeft
          node.scrollLeft += 55
          return node.scrollLeft - previous
        })
        await settle()
        assert.equal((await read()).widths.name, before.widths.name + shift)
        assert.equal(
          Number(await handle().getAttribute('aria-valuenow')),
          before.widths.name + shift,
        )
        await page.mouse.up()
        await settle()
        assert.equal((await read()).widths.name, before.widths.name + shift)
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth),
          390,
        )
        await aligned()
        assert.ok(point.x < 390)
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 })
      }
    },
  )
  await record(
    'hiding controls or columns and disposing mid-drag releases gesture listeners',
    async () => {
      await start()
      for (const target of ['controls', 'column', 'root']) {
        const point = await begin()
        await page.mouse.move(point.x + 50, point.y)
        if (target === 'controls')
          await call('controls', { columnResizing: false })
        else if (target === 'column') await call('visibility', 'name', false)
        else await call('stop')
        await page.mouse.up()
        await settle()
        assert.equal(
          (target === 'root' ? await call('lastCounts') : (await read()).counts)
            .resizeListeners,
          0,
        )
        if (target === 'controls')
          await call('controls', { columnResizing: true })
        if (target === 'column') await call('visibility', 'name', true)
      }
      await start()
      await drag('Name', 30)
      assert.equal((await read()).widths.name, 250)
    },
  )
}

export async function resizeWorkload({ page, cdp, read, settle }) {
  const handle = page.getByRole('separator', {
    name: 'Resize Name column',
    exact: true,
  })
  await handle.scrollIntoViewIfNeeded()
  await handle.hover()
  await cdp.send('HeapProfiler.collectGarbage')
  const listeners = (await cdp.send('Memory.getDOMCounters')).jsEventListeners
  const before = await read()
  const begin = performance.now()
  for (let cycle = 0; cycle < 6; cycle++) {
    const box = await handle.boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + 20
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + (cycle % 2 ? -25 : 25), y, { steps: 5 })
    const preview = await read()
    assert.equal(
      preview.counts.sizingChanges - before.counts.sizingChanges,
      (cycle + 1) * 5,
    )
    assert.equal(preview.widths.name, before.widths.name + (cycle % 2 ? 0 : 25))
    await page.mouse.up()
    await settle()
  }
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await settle()
  const elapsedMs = performance.now() - begin
  const after = await read()
  assert.deepEqual(work(after), work(before))
  assert.deepEqual(after.widths, before.widths)
  assert.equal(after.identity, true)
  assert.equal(after.counts.resizeStarts - before.counts.resizeStarts, 6)
  assert.equal(after.counts.resizeChanges - before.counts.resizeChanges, 32)
  assert.equal(after.counts.sizingChanges - before.counts.sizingChanges, 32)
  assert.equal(after.counts.resizeListeners, 0)
  await cdp.send('HeapProfiler.collectGarbage')
  const retainedListeners =
    (await cdp.send('Memory.getDOMCounters')).jsEventListeners - listeners
  assert.equal(retainedListeners, 0)
  return {
    elapsedMs,
    gestures: 6,
    moves: after.counts.resizeMoves - before.counts.resizeMoves,
    sizingChanges: after.counts.sizingChanges - before.counts.sizingChanges,
    retainedListeners,
    work: Object.fromEntries(
      Object.entries(work(after)).map(([key, value]) => [
        key,
        value - work(before)[key],
      ]),
    ),
  }
}
