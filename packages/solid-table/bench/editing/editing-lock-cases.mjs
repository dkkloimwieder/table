import assert from 'node:assert/strict'

const root = (page) => page.locator('[data-table-scope="root"]')
const child = (page, id) => page.locator(`[data-table-scope="${id}"]`)
const cancel = (scope, id) => ({
  click: async () => {
    const button = scope.getByRole('button', {
      name: `Cancel ${id}`,
      exact: true,
    })
    if (!(await button.count()))
      await scope
        .getByRole('button', { name: `Edit name ${id}`, exact: true })
        .click()
    await button.click()
  },
})
const rows = (scope) =>
  scope
    .locator(':scope > .table-scroll > table > tbody > tr[data-row]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.row))
const config = (value) =>
  Object.fromEntries(
    [
      'ids',
      'filters',
      'search',
      'sorting',
      'grouping',
      'groupSorting',
      'summaries',
      'columnSizing',
      'columnOrder',
      'columnPinning',
      'columnVisibility',
      'visibleColumns',
      'widths',
      'saveMode',
    ].map((key) => [key, value[key]]),
  )

export async function editingLockCases({
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
}) {
  await record(
    'editing lock: blur keeps drafts locked and untouched editors release',
    async () => {
      await start()
      const sort = root(page).getByRole('button', {
        name: 'Sort by Name',
        exact: true,
      })
      await edit().click()
      assert.equal((await read()).locked, true)
      assert.equal(await sort.isDisabled(), true)
      await page
        .getByRole('button', { name: 'After table', exact: true })
        .click()
      await settle()
      assert.equal((await read()).locked, false)
      await edit().click()
      await input().fill('Draft remains')
      await page
        .getByRole('button', { name: 'After table', exact: true })
        .click()
      await settle()
      assert.equal((await read()).locked, true)
      assert.equal(await sort.isDisabled(), true)
      assert.equal(await input().count(), 0)
      await cancel(root(page), 'R0001').click()
      await settle()
      assert.equal((await read()).locked, false)
      assert.equal(await sort.isEnabled(), true)
    },
  )
  await record(
    'editing lock: controlled options and pointer or keyboard structural controls cannot change state',
    async () => {
      await start()
      await call('controls', { filters: 'both' })
      await edit().click()
      await input().fill('Locked value')
      const before = await read()
      for (const [name, ...args] of [
        ['filter', 'name', 'other'],
        ['search', 'other'],
        ['sorting', [{ id: 'name', desc: true }]],
        ['grouping', ['priority']],
        ['summary', 'amount', 'max'],
        ['order', ['note', 'id']],
        ['visibility', 'name', false],
        ['pinning', { start: ['note'], end: [] }],
        ['sizing', { name: 410 }],
        ['localProcessing', false],
        ['controls', { filters: 'none', columnResizing: false }],
      ])
        await call(name, ...args)
      assert.deepEqual(config(await read()), config(before))
      assert.equal(
        await root(page)
          .getByRole('button', { name: 'Move Name column', exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(
        await root(page)
          .getByRole('combobox', { name: 'Add grouping', exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(
        await root(page)
          .getByRole('combobox', { name: 'Save mode', exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(await root(page).getByRole('searchbox').isDisabled(), true)
      for (const filter of await root(page)
        .getByRole('textbox', { name: 'Filter saved names', exact: true })
        .all())
        assert.equal(await filter.isDisabled(), true)
      const resize = root(page).getByRole('separator', {
        name: 'Resize Name column',
        exact: true,
      })
      assert.equal(await resize.getAttribute('aria-disabled'), 'true')
      await resize.dispatchEvent('keydown', { key: 'ArrowRight' })
      await resize.dispatchEvent('pointerdown', {
        pointerId: 1,
        isPrimary: true,
        button: 0,
      })
      assert.deepEqual(config(await read()), config(before))
      assert.equal(
        (await read()).counts.resizeStarts,
        before.counts.resizeStarts,
      )
      await cancel(root(page), 'R0001').click()
      await settle()
      await call('sizing', { name: 410 })
      assert.equal((await read()).widths.name, 410)
    },
  )
  await record(
    'editing lock: saving one row leaves filter membership and sorting fixed until the last draft resolves',
    async () => {
      await start()
      await call('sorting', [{ id: 'name', desc: false }])
      await call('filter', 'priority', 'normal')
      await edit().click()
      await input().fill('ZZZ saved row')
      await root(page)
        .getByRole('combobox', { name: 'Priority R0001', exact: true })
        .selectOption('high')
      await edit('R0002').click()
      await input('R0002').fill('Second draft')
      const before = await rows(root(page))
      await edit('R0001').click()
      await save('R0001').click()
      await idle()
      const state = await read()
      assert.equal(state.sample[0].name, 'ZZZ saved row')
      assert.equal(state.sample[0].priority, 'high')
      assert.equal(state.locked, true)
      assert.deepEqual(await rows(root(page)), before)
      assert.deepEqual(state.ids, before)
      await cancel(root(page), 'R0002').click()
      await settle()
      assert.equal((await read()).locked, false)
      assert.ok(!(await rows(root(page))).includes('R0001'))
    },
  )
  await record(
    'editing lock: background revisions still detect conflicts and deletion waits for draft resolution',
    async () => {
      await start()
      await call('sorting', [{ id: 'name', desc: false }])
      await edit().click()
      await input().fill('Local edit')
      const before = await rows(root(page))
      await call('patch', 'R0001', { name: 'ZZZ remote value' })
      assert.deepEqual(await rows(root(page)), before)
      await save().click()
      await idle()
      assert.equal((await read()).drafts.R0001.status, 'conflict')
      assert.equal((await read()).locked, true)
      await call('remove', 'R0001')
      await settle()
      assert.deepEqual(await rows(root(page)), before)
      await cancel(root(page), 'R0001').click()
      await settle()
      assert.equal((await read()).locked, false)
      assert.ok(!(await rows(root(page))).includes('R0001'))
    },
  )
  await record(
    'editing lock: failed and pending global saves retain the lock',
    async () => {
      await start(8, 'table')
      await edit().click()
      await input().fill('Refused draft')
      await call('fault', 'refuse')
      await root(page)
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await idle()
      assert.equal((await read()).locked, true)
      assert.equal((await read()).drafts.R0001.status, 'refused')
      await call('fault', 'hold')
      await root(page)
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await settle()
      assert.equal((await read()).locked, true)
      await call('grouping', ['priority'])
      assert.deepEqual((await read()).grouping, [])
      await call('release')
      await idle()
      assert.equal((await read()).locked, false)
    },
  )
  await record(
    'editing lock: grouped parents cannot hide child edits and child saves remain independent',
    async () => {
      await start()
      await call('grouping', ['priority'])
      await call('expandGroups', true)
      await call('childToggle', 'R0001')
      await page.waitForFunction(
        () => window.editingFixture.childStatus('R0001') === 'ready',
      )
      await child(page, 'R0001')
        .getByRole('button', { name: 'Edit name R0001', exact: true })
        .click()
      await child(page, 'R0001')
        .getByRole('textbox', { name: 'Name R0001', exact: true })
        .fill('Child draft')
      await settle()
      assert.equal((await read()).locked, true)
      assert.equal(
        await root(page)
          .getByRole('button', { name: 'Collapse all groups', exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(
        await root(page)
          .getByRole('button', {
            name: 'Collapse sub-table R0001',
            exact: true,
          })
          .isDisabled(),
        true,
      )
      const display = (await read()).display
      await call('grouping', [])
      await call('expandGroups', false)
      await call('childToggle', 'R0001')
      assert.equal(await call('childScope', 'previous', true), false)
      await call('patch', 'R0001', { priority: 'high' })
      assert.deepEqual((await read()).display, display)
      assert.equal((await call('childRead', 'R0001')).expanded, true)
      await child(page, 'R0001')
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await page.waitForFunction(
        () => !window.editingFixture.childRead('R0001').model.locked,
      )
      await settle()
      assert.equal((await read()).locked, false)
      assert.equal((await read()).counts.requests, 0)
      assert.equal((await call('childRead', 'R0001')).model.counts.requests, 1)
      assert.equal((await read()).grouping[0], 'priority')
    },
  )
  await record(
    'editing lock: repeated sessions preserve record identity and avoid row or cell recreation',
    async () => {
      await start(250)
      await call('remember', 'R0001')
      await call('sorting', [{ id: 'name', desc: false }])
      const before = await read()
      for (let i = 0; i < 50; i++) {
        await call('draft', 'R0001', `Draft ${i}`)
        await call('sorting', [{ id: 'name', desc: true }])
        await call('cancelDraft', 'R0001')
      }
      await settle()
      const after = await read()
      assert.equal(after.identity, true)
      assert.equal(after.locked, false)
      assert.equal(after.counts.views, before.counts.views)
      assert.equal(after.counts.cells, before.counts.cells)
      assert.equal(after.counts.requests, before.counts.requests)
      assert.deepEqual(after.ids, before.ids)
    },
  )
}

export async function editingLockWorkload({
  start,
  call,
  read,
  settle,
  metrics,
  heap,
}) {
  await start(250, 'table')
  await call('filter', 'name', 'Record')
  await call('sorting', [{ id: 'name', desc: false }])
  await call('remember', 'R0001')
  async function cycles(count) {
    for (let i = 0; i < count; i++) {
      await call('draft', 'R0001', `Repeated draft ${i}`)
      await call('cancelDraft', 'R0001')
    }
    await settle()
  }
  await cycles(10)
  const warm = await metrics()
  const warmObjects = await heap('editing-lock-10')
  const before = await read()
  await cycles(90)
  const hundred = await metrics()
  const hundredObjects = await heap('editing-lock-100')
  await cycles(100)
  const twoHundred = await metrics()
  const twoHundredObjects = await heap('editing-lock-200')
  const after = await read()
  assert.equal(after.identity, true)
  assert.equal(after.counts.views, before.counts.views)
  assert.equal(after.counts.cells, before.counts.cells)
  assert.equal(after.counts.requests, 0)
  assert.equal(after.locked, false)
  if (hundredObjects && twoHundredObjects)
    for (const [category, count] of Object.entries(hundredObjects)) {
      if (['JavaScript Maps', 'V8 allocation templates'].includes(category))
        continue
      assert.ok(
        twoHundredObjects[category] <= count,
        `Repeated editing retains more ${category}`,
      )
    }
  await call('stop')
  const disposed = await metrics()
  const disposedObjects = await heap('editing-lock-disposed')
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
      assert.equal(disposedObjects[category] ?? 0, 0, category)
  return {
    warm,
    hundred,
    twoHundred,
    disposed,
    warmObjects,
    hundredObjects,
    twoHundredObjects,
    disposedObjects,
    before: before.counts,
    after: after.counts,
  }
}
