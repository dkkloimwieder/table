import assert from 'node:assert/strict'

const initial = ['id', 'name', 'note', 'priority', 'amount', 'dueDate']
const labels = {
  id: 'Record',
  name: 'Name',
  note: 'Note',
  priority: 'Priority',
  amount: 'Amount',
  dueDate: 'Due date',
}
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
const handle = (page, id = 'name') =>
  page.getByRole('button', { name: `Move ${labels[id]} column`, exact: true })

async function begin(page, id = 'name') {
  await handle(page, id).scrollIntoViewIfNeeded()
  const box = await handle(page, id).boundingBox()
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  return point
}
async function pointAt(page, id, side) {
  return page.locator(`[data-column-header="${id}"]`).evaluate((node, side) => {
    const box = node.getBoundingClientRect()
    return {
      x: box.left + box.width * (side === 'before' ? 0.25 : 0.75),
      y: box.top + 20,
    }
  }, side)
}
async function drag(page, from, to, side) {
  await begin(page, from)
  const point = await pointAt(page, to, side)
  await page.mouse.move(point.x, point.y, { steps: 5 })
  await page.mouse.up()
}
async function aligned(page, order) {
  const result = await page.locator('table').evaluate((table) => {
    const headers = [...table.querySelectorAll('thead [data-column-header]')]
    const row = table.querySelector('[data-row]')
    return {
      headers: headers.map((node) => node.dataset.columnHeader),
      cols: [...table.querySelectorAll('col[data-column-width]')].map(
        (node) => node.dataset.columnWidth,
      ),
      cells: [...row.querySelectorAll('[data-column]')].map(
        (node) => node.dataset.column,
      ),
      aligned: headers.every((node, index) => {
        const head = node.getBoundingClientRect()
        const body = row.children[index].getBoundingClientRect()
        return (
          Math.abs(head.left - body.left) < 1 &&
          Math.abs(head.width - body.width) < 1
        )
      }),
      actionLast: row.lastElementChild.classList.contains('row-actions'),
      width: table.getBoundingClientRect().width,
    }
  })
  assert.deepEqual(result.headers, order)
  assert.deepEqual(result.cols, order)
  assert.deepEqual(result.cells, order)
  assert.equal(result.aligned, true)
  assert.equal(result.actionLast, true)
  return result
}

export async function reorderCases({
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
  await record(
    'column drag moves headers and cells together on release without record work',
    async () => {
      await start()
      await call('remember', 'R0001')
      const before = await read()
      const layout = await aligned(page, initial)
      await cdp.send('HeapProfiler.collectGarbage')
      const listeners = (await cdp.send('Memory.getDOMCounters'))
        .jsEventListeners
      await begin(page)
      const point = await pointAt(page, 'priority', 'after')
      await page.mouse.move(point.x, point.y, { steps: 5 })
      assert.deepEqual((await read()).visibleColumns, initial)
      assert.equal(
        await page
          .locator('[data-column-drop="after"][data-column-header="priority"]')
          .count(),
        1,
      )
      assert.equal((await read()).counts.reorderListeners, 4)
      await page.mouse.up()
      await settle()
      const after = await read()
      assert.deepEqual(after.visibleColumns, [
        'id',
        'note',
        'priority',
        'name',
        'amount',
        'dueDate',
      ])
      assert.equal(
        (await aligned(page, after.visibleColumns)).width,
        layout.width,
      )
      assert.deepEqual(after.widths, before.widths)
      assert.deepEqual(work(after), work(before))
      assert.equal(after.identity, true)
      assert.equal(after.counts.orderChanges - before.counts.orderChanges, 1)
      assert.equal(after.counts.reorderListeners, 0)
      assert.equal(
        await page
          .locator('[data-column-drop], [data-column-moving], :popover-open')
          .count(),
        0,
      )
      assert.equal(
        await handle(page).evaluate((node) => node === document.activeElement),
        true,
      )
      await cdp.send('HeapProfiler.collectGarbage')
      assert.equal(
        (await cdp.send('Memory.getDOMCounters')).jsEventListeners,
        listeners,
      )
    },
  )
  await record(
    'keyboard moves reach first and last positions while retaining handle focus',
    async () => {
      await start()
      const before = await read()
      await handle(page).focus()
      for (const [key, order] of [
        ['ArrowLeft', ['name', 'id', 'note', 'priority', 'amount', 'dueDate']],
        ['Home', ['name', 'id', 'note', 'priority', 'amount', 'dueDate']],
        ['End', ['id', 'note', 'priority', 'amount', 'dueDate', 'name']],
        ['ArrowRight', ['id', 'note', 'priority', 'amount', 'dueDate', 'name']],
        ['ArrowLeft', ['id', 'note', 'priority', 'amount', 'name', 'dueDate']],
        ['Home', ['name', 'id', 'note', 'priority', 'amount', 'dueDate']],
      ]) {
        await page.keyboard.press(key)
        await settle()
        await aligned(page, order)
        assert.equal(
          await handle(page).evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
      }
      assert.equal(
        (await read()).counts.orderChanges - before.counts.orderChanges,
        4,
      )
      assert.deepEqual(work(await read()), work(before))
      assert.equal(await page.locator('th[aria-sort]').count(), 0)
    },
  )
  await record(
    'move buttons support clicks, Enter, Escape and outside dismissal',
    async () => {
      await start()
      await handle(page).click()
      const menu = page.getByRole('group', {
        name: 'Move Name column',
        exact: true,
      })
      assert.equal(await menu.isVisible(), true)
      await menu
        .getByRole('button', { name: 'Move first', exact: true })
        .click()
      await settle()
      assert.equal((await read()).visibleColumns[0], 'name')
      assert.equal(await menu.isVisible(), false)
      assert.equal(
        await handle(page).evaluate((node) => node === document.activeElement),
        true,
      )
      await page.keyboard.press('Enter')
      assert.equal(
        await menu
          .getByRole('button', { name: 'Move first', exact: true })
          .isDisabled(),
        true,
      )
      await menu.getByRole('button', { name: 'Move last', exact: true }).click()
      await settle()
      assert.equal((await read()).visibleColumns.at(-1), 'name')
      await page.keyboard.press('Space')
      await page.keyboard.press('Escape')
      assert.equal(await menu.isVisible(), false)
      await handle(page).click()
      await page.getByRole('heading', { name: 'Table', exact: true }).click()
      assert.equal(await menu.isVisible(), false)
      assert.equal(await handle(page).getAttribute('aria-expanded'), 'false')
    },
  )
  await record(
    'hidden columns remain in controlled order and return beside unaffected columns',
    async () => {
      await start()
      await call('visibility', 'note', false)
      await handle(page).focus()
      await page.keyboard.press('ArrowRight')
      await settle()
      assert.deepEqual((await read()).columnOrder, [
        'id',
        'note',
        'priority',
        'name',
        'amount',
        'dueDate',
      ])
      await aligned(page, ['id', 'priority', 'name', 'amount', 'dueDate'])
      await call('visibility', 'note', true)
      await aligned(page, [
        'id',
        'note',
        'priority',
        'name',
        'amount',
        'dueDate',
      ])
      await call('order', ['dueDate', 'note'])
      await aligned(page, [
        'dueDate',
        'note',
        'id',
        'name',
        'priority',
        'amount',
      ])
      await call('order', [])
      await aligned(page, initial)
    },
  )
  await record(
    'pinned columns and Actions stay fixed while movable columns stay inside their bounds',
    async () => {
      await start()
      await call('pinning', { start: ['id'], end: ['dueDate'] })
      assert.equal(await handle(page, 'id').count(), 0)
      assert.equal(await handle(page, 'dueDate').count(), 0)
      assert.equal(
        await page.getByRole('button', { name: /Move .*actions/i }).count(),
        0,
      )
      await handle(page).focus()
      await page.keyboard.press('Home')
      assert.deepEqual((await read()).columnOrder, [])
      await page.keyboard.press('End')
      await settle()
      await aligned(page, [
        'id',
        'note',
        'priority',
        'amount',
        'name',
        'dueDate',
      ])
      for (const id of ['note', 'priority', 'amount'])
        await call('visibility', id, false)
      assert.equal(await handle(page).isDisabled(), true)
      await call('pinning', { start: [], end: [] })
      assert.equal(await handle(page).isDisabled(), false)
    },
  )
  await record(
    'blocked caller order changes preserve editor focus, selection and record target',
    async () => {
      await start()
      await edit().click()
      await input().fill('Keep this draft')
      await input().evaluate((node) => node.setSelectionRange(2, 8, 'backward'))
      const editor = await input().elementHandle()
      const before = await read()
      await call('order', [
        'note',
        'priority',
        'amount',
        'dueDate',
        'id',
        'name',
      ])
      await settle()
      assert.equal(
        await editor.evaluate(
          (node) => node === document.activeElement && node.isConnected,
        ),
        true,
      )
      assert.deepEqual(
        await input().evaluate((node) => [
          node.selectionStart,
          node.selectionEnd,
          node.selectionDirection,
        ]),
        [2, 8, 'backward'],
      )
      assert.equal((await read()).drafts.R0001.name, 'Keep this draft')
      assert.equal((await read()).drafts.R0001.expanded, true)
      assert.deepEqual(work(await read()), work(before))
      assert.deepEqual((await read()).visibleColumns, before.visibleColumns)
      await input().press('Enter')
      await idle()
      assert.equal((await read()).sample[0].name, 'Keep this draft')
      assert.equal((await read()).sent[0].id, 'R0001')
      await editor.dispose()
    },
  )
  await record(
    'dropdown edits and pending saves block caller moves and respect later focus',
    async () => {
      await start()
      await edit('R0001', 'priority').click()
      const select = page.getByRole('combobox', {
        name: 'Priority R0001',
        exact: true,
      })
      await select.selectOption('high')
      await select.focus()
      await call('order', ['priority', 'name', 'note'])
      await settle()
      assert.equal(
        await select.evaluate((node) => node === document.activeElement),
        true,
      )
      assert.equal((await read()).drafts.R0001.priority, 'high')
      assert.equal((await read()).counts.requests, 0)
      await call('fault', 'hold')
      await page
        .getByRole('button', { name: 'Save R0001', exact: true })
        .click()
      await page.waitForFunction(
        () => window.editingFixture.read().counts.requests === 1,
      )
      assert.equal(await handle(page, 'priority').isDisabled(), true)
      await page
        .getByRole('button', { name: 'After table', exact: true })
        .click()
      await call('order', ['name', 'priority'])
      await settle()
      await call('release')
      await idle()
      assert.equal((await read()).sample[0].priority, 'high')
      assert.equal(
        await page
          .getByRole('button', { name: 'After table', exact: true })
          .evaluate((node) => node === document.activeElement),
        true,
      )
      assert.equal((await read()).sent[0].id, 'R0001')
    },
  )
  await record(
    'column rearrangement is independently configurable and works with manual processing',
    async () => {
      await start()
      await call('localProcessing', false)
      await call('controls', {
        filters: 'none',
        headerSorting: false,
        columnResizing: false,
      })
      await handle(page).focus()
      await page.keyboard.press('Home')
      await settle()
      assert.equal((await read()).visibleColumns[0], 'name')
      await page.getByText('Display options', { exact: true }).click()
      await page
        .getByRole('checkbox', { name: 'Column rearrangement', exact: true })
        .uncheck()
      assert.equal(await handle(page).count(), 0)
      await page
        .getByRole('checkbox', { name: 'Column rearrangement', exact: true })
        .check()
      assert.equal(await handle(page).count(), 1)
      assert.equal((await read()).visibleColumns[0], 'name')
    },
  )
  await record(
    'rearrangement retains configuration in both resize modes before editing',
    async () => {
      for (const resizeBehavior of ['grow', 'fixed']) {
        await start(8, 'table')
        await call('controls', { resizeBehavior, filters: 'both' })
        await call('sizing', { name: 280, note: 300 })
        await call('filter', 'note', 'Note')
        await call('search', 'Record')
        await call('sorting', [{ id: 'amount', desc: true }])
        await call('grouping', ['priority'])
        await call('expandGroups', true)
        await page.getByRole('heading', { name: 'Table', exact: true }).click()
        const before = await read()
        await drag(page, 'name', 'note', 'after')
        await settle()
        const after = await read()
        for (const key of [
          'widths',
          'filters',
          'search',
          'grouping',
          'groupSorting',
          'summaries',
          'ids',
          'drafts',
        ])
          assert.deepEqual(after[key], before[key], key)
        assert.deepEqual(work(after), work(before))
        await aligned(page, after.visibleColumns)
        const resize = page.getByRole('separator', {
          name: 'Resize Name column',
          exact: true,
        })
        await resize.focus()
        await page.keyboard.press('ArrowRight')
        const resized = await read()
        assert.equal(resized.widths.name, 290)
        assert.equal(
          resized.widths.amount,
          resizeBehavior === 'fixed' ? 110 : 120,
        )
        assert.equal(resized.widths.note, 300)
        await call('grouping', [])
        await edit().click()
        await input().fill('Unsaved reordered name')
        await page
          .getByRole('button', { name: 'Save all', exact: true })
          .click()
        await idle()
        assert.equal((await read()).sample[0].name, 'Unsaved reordered name')
      }
    },
  )
  await record(
    'Escape, blur and pointer cancellation discard drop targets and release listeners',
    async () => {
      for (const interrupt of ['escape', 'blur', 'pointercancel']) {
        await start()
        await begin(page)
        const point = await pointAt(page, 'priority', 'after')
        await page.mouse.move(point.x, point.y)
        if (interrupt === 'escape') await page.keyboard.press('Escape')
        if (interrupt === 'blur')
          await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        if (interrupt === 'pointercancel')
          await handle(page).dispatchEvent('pointercancel', { pointerId: 1 })
        await page.mouse.up()
        await settle()
        assert.deepEqual((await read()).visibleColumns, initial)
        assert.equal((await read()).counts.reorderListeners, 0)
        assert.equal(
          await page
            .locator('[data-column-drop], [data-column-moving]')
            .count(),
          0,
        )
        assert.equal((await read()).counts.orderChanges, 0)
      }
    },
  )
  await record(
    'caller order, visibility, pinning and control changes cancel a stale drag',
    async () => {
      for (const change of ['order', 'visibility', 'pinning', 'controls']) {
        await start()
        await begin(page)
        const point = await pointAt(page, 'priority', 'after')
        await page.mouse.move(point.x, point.y)
        if (change === 'order') await call('order', ['dueDate', 'name'])
        if (change === 'visibility') await call('visibility', 'note', false)
        if (change === 'pinning')
          await call('pinning', { start: ['name'], end: [] })
        if (change === 'controls')
          await call('controls', { columnReordering: false })
        const beforeUp = await read()
        await page.mouse.up()
        await settle()
        assert.deepEqual((await read()).columnOrder, beforeUp.columnOrder)
        assert.equal((await read()).counts.reorderListeners, 0)
        assert.equal(
          await page
            .locator('[data-column-drop], [data-column-moving]')
            .count(),
          0,
        )
      }
      await start()
      await begin(page)
      await call('stop')
      await page.mouse.up()
      assert.equal((await call('lastCounts')).reorderListeners, 0)
    },
  )
  await record(
    'touch dragging reorders columns and secondary pointers cannot take a gesture',
    async () => {
      await start()
      await handle(page).scrollIntoViewIfNeeded()
      const box = await handle(page).boundingBox()
      const point = await pointAt(page, 'priority', 'after')
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
      })
      await handle(page).dispatchEvent('pointerdown', {
        pointerId: 88,
        button: 0,
        isPrimary: false,
      })
      await handle(page).dispatchEvent('pointercancel', { pointerId: 88 })
      assert.equal((await read()).counts.reorderListeners, 4)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [point],
      })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await settle()
      await aligned(page, [
        'id',
        'note',
        'priority',
        'name',
        'amount',
        'dueDate',
      ])
      assert.equal((await read()).counts.reorderListeners, 0)
    },
  )
  await record(
    'dragging at the scroller edge reveals later columns without moving page width',
    async () => {
      await page.setViewportSize({ width: 560, height: 900 })
      try {
        await start()
        await begin(page)
        const box = await page.locator('.table-scroll').boundingBox()
        const header = await handle(page).boundingBox()
        await page.mouse.move(box.x + box.width - 8, header.y + 8)
        await page.waitForFunction(() => {
          const node = document.querySelector('.table-scroll')
          return node.scrollLeft >= node.scrollWidth - node.clientWidth - 1
        })
        const target = await pointAt(page, 'dueDate', 'after')
        await page.mouse.move(target.x, target.y)
        await page.mouse.up()
        await settle()
        assert.equal((await read()).visibleColumns.at(-1), 'name')
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        assert.equal((await read()).counts.reorderListeners, 0)
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 })
      }
    },
  )
}

export async function reorderWorkload({ page, cdp, read, settle }) {
  await handle(page, 'note').scrollIntoViewIfNeeded()
  await cdp.send('HeapProfiler.collectGarbage')
  const listeners = (await cdp.send('Memory.getDOMCounters')).jsEventListeners
  const before = await read()
  const started = performance.now()
  for (let cycle = 0; cycle < 3; cycle++) {
    await drag(page, 'note', 'amount', 'after')
    await drag(page, 'note', 'amount', 'before')
    await handle(page, 'note').focus()
    await page.keyboard.press('End')
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowRight')
  }
  await settle()
  const after = await read()
  assert.deepEqual(after.visibleColumns, before.visibleColumns)
  assert.deepEqual(work(after), work(before))
  assert.deepEqual(after.widths, before.widths)
  assert.equal(after.counts.orderChanges - before.counts.orderChanges, 15)
  assert.equal(after.counts.reorderListeners, 0)
  await cdp.send('HeapProfiler.collectGarbage')
  assert.equal(
    (await cdp.send('Memory.getDOMCounters')).jsEventListeners,
    listeners,
  )
  return {
    elapsedMs: performance.now() - started,
    orderChanges: 15,
    additionalRecordWork: 0,
    retainedGestureListeners: 0,
  }
}
