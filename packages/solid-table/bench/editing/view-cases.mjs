import assert from 'node:assert/strict'

const scope = (page, parent) =>
  page.locator(`[data-table-scope="${parent ?? 'root'}"]`)
const toolbar = (page, parent) =>
  scope(page, parent).locator(':scope > .table-views')
const counts = (value) =>
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

export async function viewCases({
  page,
  start,
  call,
  read,
  record,
  settle,
  edit,
  input,
  idle,
}) {
  const state = (parent) => call('viewRead', parent)
  const ready = async (parent) => {
    await page.waitForFunction(
      (parent) => !window.editingFixture.viewRead(parent).busy,
      parent,
    )
    await settle()
  }
  const begin = async () => {
    await start(8, 'table')
    await ready()
  }
  const save = async (name, parent) => {
    const area = toolbar(page, parent)
    await area
      .getByRole('textbox', { name: 'View name', exact: true })
      .fill(name)
    await area
      .getByRole('button', { name: 'Save as new view', exact: true })
      .click()
    await ready(parent)
    assert.equal((await state(parent)).error, '')
    return (await state(parent)).selected
  }
  const choose = async (id, parent) => {
    await toolbar(page, parent)
      .getByRole('combobox', { name: 'Saved view', exact: true })
      .selectOption(id)
    await settle()
  }
  const open = async (id) => {
    await scope(page)
      .getByRole('button', { name: `Expand sub-table ${id}`, exact: true })
      .click()
    await page.waitForFunction(
      (id) => window.editingFixture.childStatus(id) === 'ready',
      id,
    )
    await ready(id)
  }
  await record(
    'views: save, apply, update, rename, delete and reload through the parent controls',
    async () => {
      await begin()
      await call('patch', 'R0001', { priority: 'high' })
      const all = await save('All records')
      await call('filter', 'priority', 'high')
      const high = await save('  High priority  ')
      assert.equal((await state()).views[1].name, 'High priority')
      await choose(all)
      assert.equal((await read()).ids.length, 8)
      await choose(high)
      assert.deepEqual((await read()).ids, ['R0001'])
      await call('filter', 'priority', '')
      await call('filter', 'name', '0002')
      await toolbar(page)
        .getByRole('button', { name: 'Update view', exact: true })
        .click()
      await ready()
      await choose(all)
      await choose(high)
      assert.deepEqual((await read()).ids, ['R0002'])
      const saved = (await state()).views[1].configuration
      await call('filter', 'name', '0003')
      await toolbar(page)
        .getByRole('textbox', { name: 'View name', exact: true })
        .fill('Second record')
      await toolbar(page)
        .getByRole('button', { name: 'Rename view', exact: true })
        .click()
      await ready()
      assert.deepEqual((await state()).views[1].configuration, saved)
      assert.deepEqual((await read()).ids, ['R0003'])
      await toolbar(page)
        .getByRole('button', { name: 'Reload views', exact: true })
        .click()
      await ready()
      assert.equal((await state()).views[1].name, 'Second record')
      await choose(high)
      assert.deepEqual((await read()).ids, ['R0002'])
      await toolbar(page)
        .getByRole('button', { name: 'Delete view', exact: true })
        .click()
      await ready()
      assert.deepEqual((await read()).ids, ['R0002'])
      assert.equal((await state()).selected, '')
      assert.deepEqual(
        (await state()).views.map((v) => v.name),
        ['All records'],
      )
      await begin()
      assert.deepEqual((await state()).views, []) // Demo storage is per App mount.
    },
  )
  await record(
    'views: round trips preserve manual order, pinning and complete column configuration without saving widths',
    async () => {
      await begin()
      await call('remember', 'R0001')
      const base = await save('Base')
      await call('order', ['note', 'name', 'amount', 'id'])
      await call('pinning', { start: ['note'], end: ['dueDate'] })
      await call('grouping', ['priority', 'name'])
      await call('sorting', [{ id: 'amount', desc: true }])
      await call('filter', 'name', 'Record')
      await call('search', 'Note')
      await call('summary', 'amount', 'mean')
      await call('summary', 'note', 'distinct')
      await call('visibility', 'id', false)
      await scope(page)
        .getByRole('combobox', { name: 'Order Priority groups', exact: true })
        .selectOption('amount:desc')
      await call('controls', {
        filters: 'both',
        headerSorting: false,
        globalSearch: false,
        resizeBehavior: 'fixed',
      })
      await call('sizing', { amount: 210 })
      const expected = (await state()).configuration
      assert.deepEqual(expected.columnOrder, ['note', 'name', 'amount', 'id'])
      assert.deepEqual(expected.columnPinning, {
        start: ['note'],
        end: ['dueDate'],
      })
      const grouped = await save('Grouped')
      await choose(base)
      assert.deepEqual((await read()).grouping, [])
      assert.equal((await read()).widths.amount, 210)
      await choose(grouped)
      assert.deepEqual((await state()).configuration, expected)
      assert.equal((await read()).identity, true)
      assert.equal((await read()).widths.amount, 210)
      const payload = (await call('viewStorageRead')).lastSaved.configuration
      assert.deepEqual(
        Object.keys(payload).sort(),
        [
          'version',
          'columnFilters',
          'globalFilter',
          'sorting',
          'grouping',
          'groupSorting',
          'summaries',
          'columnOrder',
          'columnVisibility',
          'columnPinning',
          'controls',
        ].sort(),
      )
      await call('grouping', [])
      assert.equal((await read()).visibleColumns[0], 'note')
    },
  )
  await record(
    'views: keyboard saves restore focus and delayed requests respect later navigation',
    async () => {
      await begin()
      const area = toolbar(page)
      const name = area.getByRole('textbox', { name: 'View name', exact: true })
      const create = area.getByRole('button', {
        name: 'Save as new view',
        exact: true,
      })
      await name.fill('Keyboard view')
      await name.press('Tab')
      assert.equal(
        await create.evaluate((node) => node === document.activeElement),
        true,
      )
      await page.keyboard.press('Enter')
      await ready()
      assert.equal(
        await create.evaluate((node) => node === document.activeElement),
        true,
      )
      await call('viewStorageFault', 'hold')
      await area
        .getByRole('button', { name: 'Update view', exact: true })
        .click()
      await page.getByRole('heading', { name: 'Table', exact: true }).click()
      await call('viewStorageRelease')
      await ready()
      assert.equal(
        await area.evaluate((node) => node.contains(document.activeElement)),
        false,
      )
      await call('viewStorageFault', 'hold')
      await area
        .getByRole('button', { name: 'Reload views', exact: true })
        .click()
      const filter = scope(page).getByRole('textbox', {
        name: 'Filter saved names',
        exact: true,
      })
      await filter.focus()
      await call('viewStorageRelease')
      await ready()
      assert.equal(
        await filter.evaluate((node) => node === document.activeElement),
        true,
      )
      await area
        .getByRole('button', { name: 'Delete view', exact: true })
        .click()
      await ready()
      assert.equal(
        await name.evaluate((node) => node === document.activeElement),
        true,
      )
    },
  )
  await record(
    'views: open editors, drafts and pending record saves block every view operation without a queued switch',
    async () => {
      await begin()
      const base = await save('Base')
      await call('filter', 'name', '0002')
      const second = await save('Second')
      await choose(base)
      await edit().click()
      await input().fill('Unpersisted draft')
      const before = await state()
      const storage = await call('viewStorageRead')
      const area = toolbar(page)
      assert.equal(
        await area
          .getByRole('combobox', { name: 'Saved view', exact: true })
          .isDisabled(),
        true,
      )
      assert.equal(await call('viewChoose', second), false)
      await call('viewSaveAs', 'Blocked')
      await call('viewUpdate')
      await call('viewRename', 'Blocked')
      await call('viewRemove')
      await call('viewReload')
      assert.deepEqual((await state()).configuration, before.configuration)
      assert.deepEqual((await state()).views, before.views)
      assert.deepEqual(await call('viewStorageRead'), storage)
      await call('fault', 'hold')
      await scope(page)
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      assert.equal(await call('viewChoose', second), false)
      await call('release')
      await idle()
      assert.equal((await state()).selected, base)
      assert.equal((await read()).ids.length, 8)
      await choose(second)
      assert.deepEqual((await read()).ids, ['R0002'])
      assert.equal(
        JSON.stringify((await state()).views).includes('Unpersisted draft'),
        false,
      )
    },
  )
  await record(
    'views: failed storage operations preserve views and table configuration and permit retry',
    async () => {
      await begin()
      await call('viewStorageFault', 'throw')
      await call('viewSaveAs', 'Base')
      await ready()
      assert.match((await state()).error, /failed/)
      assert.equal((await state()).views.length, 0)
      const base = await save('Base')
      const saved = (await state()).views
      await call('filter', 'name', '0002')
      for (const action of ['viewUpdate', 'viewRemove', 'viewReload']) {
        await call('viewStorageFault', 'refuse')
        await call(action)
        await ready()
        assert.match((await state()).error, /refused/)
        assert.deepEqual((await state()).views, saved)
        assert.deepEqual((await read()).ids, ['R0002'])
        assert.equal((await state()).selected, base)
      }
      await call('viewUpdate')
      await ready()
      assert.equal((await state()).error, '')
      assert.deepEqual((await state()).views[0].configuration.columnFilters, [
        { id: 'name', value: '0002' },
      ])
    },
  )
  await record(
    'views: blank or duplicate names and invalid or stale stored configurations cannot replace the current list',
    async () => {
      await begin()
      await save('Base')
      const saved = (await state()).views
      for (const name of ['   ', 'base', 'x'.repeat(81)]) {
        const before = await call('viewStorageRead')
        await call('viewSaveAs', name)
        await ready()
        assert.ok((await state()).error)
        assert.deepEqual(await call('viewStorageRead'), before)
      }
      for (const change of [
        (v) => {
          v.configuration.columnOrder = ['removed-column']
        },
        (v) => {
          v.configuration.columnOrder = ['name', 'name']
        },
        (v) => {
          v.configuration.summaries.note = 'median'
        },
        (v) => {
          v.configuration.grouping = ['amount']
        },
        (v) => {
          v.configuration.groupSorting = [
            { depth: 4, id: 'amount', desc: false },
          ]
        },
        (v) => {
          v.configuration.version = 2
        },
        (v) => {
          v.configuration.records = [{ name: 'Must not load' }]
        },
      ]) {
        const broken = structuredClone(saved)
        change(broken[0])
        await call('viewStorageReply', broken)
        await call('viewReload')
        await ready()
        assert.ok((await state()).error)
        assert.deepEqual((await state()).views, saved)
        assert.equal((await read()).ids.length, 8)
      }
      await call('viewStorageReply', [saved[0], saved[0]])
      await call('viewReload')
      await ready()
      assert.match((await state()).error, /duplicate/)
      await call('viewReload')
      await ready()
      assert.equal((await state()).error, '')
    },
  )
  await record(
    'views: pending storage saves capture click-time configuration and never apply over a new edit',
    async () => {
      await begin()
      const base = await save('Base')
      const snapshot = (await state()).configuration
      const before = await call('viewStorageRead')
      await call('viewStorageFault', 'hold')
      await call('viewSaveAs', 'Held')
      await call('viewSaveAs', 'Duplicate')
      assert.equal(await call('viewChoose', base), false)
      await call('filter', 'name', '0001')
      await edit().click()
      await input().fill('Draft during storage request')
      const current = (await state()).configuration
      await call('viewStorageRelease')
      await ready()
      assert.deepEqual((await state()).configuration, current)
      assert.deepEqual((await state()).views[1].configuration, snapshot)
      assert.equal(
        (await read()).drafts.R0001.name,
        'Draft during storage request',
      )
      assert.equal((await call('viewStorageRead')).save - before.save, 1)
      assert.equal(await call('viewChoose', base), false)
    },
  )
  await record(
    'views: reloading never applies a stored configuration over edits started during the request',
    async () => {
      await begin()
      await save('Base')
      const loaded = (await state()).views
      loaded[0].configuration.globalFilter = 'does not match'
      await call('viewStorageReply', loaded)
      await call('viewStorageFault', 'hold')
      await call('viewReload')
      await edit().click()
      await input().fill('Keep me')
      const before = (await state()).configuration
      await call('viewStorageRelease')
      await ready()
      assert.deepEqual((await state()).configuration, before)
      assert.equal((await read()).drafts.R0001.name, 'Keep me')
      assert.equal((await read()).ids.length, 8)
    },
  )
  await record(
    'views: child lists and selected views survive collapse and remain independent from parent and siblings',
    async () => {
      await begin()
      const parent = await save('Parent')
      await open('R0001')
      const first = await save('Child one', 'R0001')
      await open('R0002')
      await save('Child two', 'R0002')
      assert.deepEqual(
        (await state()).views.map((v) => v.name),
        ['Parent'],
      )
      assert.deepEqual(
        (await state('R0001')).views.map((v) => v.name),
        ['Child one'],
      )
      assert.deepEqual(
        (await state('R0002')).views.map((v) => v.name),
        ['Child two'],
      )
      await call('childToggle', 'R0001')
      await call('childToggle', 'R0001')
      await ready('R0001')
      assert.equal((await state('R0001')).selected, first)
      const firstScope = scope(page, 'R0001')
      await firstScope
        .getByRole('button', { name: 'Edit name R0001', exact: true })
        .click()
      await firstScope
        .getByRole('textbox', { name: 'Name R0001', exact: true })
        .fill('Child draft')
      assert.equal(await call('viewChoose', parent), false)
      assert.equal(await call('viewChoose', first, 'R0001'), false)
      await save('Sibling view', 'R0002')
      assert.equal(
        (await call('childRead', 'R0001')).model.drafts.R0001.name,
        'Child draft',
      )
      await firstScope
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await page.waitForFunction(
        () => !window.editingFixture.childRead('R0001').model.locked,
      )
      await choose(parent)
      assert.deepEqual(
        (await state('R0001')).views.map((v) => v.name),
        ['Child one'],
      )
    },
  )
  await record(
    'views: dataset scopes isolate child lists and removal aborts late child view loads',
    async () => {
      await begin()
      await open('R0001')
      await save('Current child', 'R0001')
      await call('childScope', 'previous')
      await settle()
      await open('R0001')
      assert.deepEqual((await state('R0001')).views, [])
      await save('Previous child', 'R0001')
      await call('childScope', 'current')
      await settle()
      await open('R0001')
      assert.deepEqual(
        (await state('R0001')).views.map((v) => v.name),
        ['Current child'],
      )
      await call('viewStorageFault', 'late')
      await call('viewReload', 'R0001')
      const before = await call('viewStorageRead')
      await call('remove', 'R0001')
      await settle()
      assert.equal((await call('viewStorageRead')).aborted, before.aborted + 1)
      await call('viewStorageRelease')
      await settle()
      assert.equal(await scope(page, 'R0001').count(), 0)
      assert.equal((await call('viewStorageRead')).pending, 0)
      assert.deepEqual((await state()).views, [])
    },
  )
  await record(
    'views: storage-only operations do no record work and disposal aborts outstanding requests',
    async () => {
      await begin()
      await call('remember', 'R0001')
      const before = counts(await read())
      await save('Base')
      await call('viewRename', 'Renamed')
      await ready()
      await call('viewReload')
      await ready()
      await call('viewRemove')
      await ready()
      assert.deepEqual(counts(await read()), before)
      assert.equal((await read()).identity, true)
      await call('viewStorageFault', 'hold')
      await call('viewSaveAs', 'Canceled')
      const storage = await call('viewStorageRead')
      await call('stop')
      await settle()
      assert.equal((await call('viewStorageRead')).aborted, storage.aborted + 1)
      assert.equal(await page.locator('[data-table-scope]').count(), 0)
    },
  )
}

export async function viewWorkload({ page, start, call, read, metrics, heap }) {
  const ready = () =>
    page.waitForFunction(() => !window.editingFixture.viewRead().busy)
  await start(100, 'table')
  await ready()
  await call('sorting', [{ id: 'name', desc: false }])
  const controls = toolbar(page)
  await controls
    .getByRole('textbox', { name: 'View name', exact: true })
    .fill('Ascending')
  await controls
    .getByRole('button', { name: 'Save as new view', exact: true })
    .click()
  await ready()
  const ascending = (await call('viewRead')).selected
  await call('sorting', [{ id: 'name', desc: true }])
  await call('viewSaveAs', 'Descending')
  await ready()
  const descending = (await call('viewRead')).selected
  await call('childToggle', 'R0001')
  await page.waitForFunction(
    () => window.editingFixture.childStatus('R0001') === 'ready',
  )
  await page.waitForFunction(
    () => !window.editingFixture.viewRead('R0001').busy,
  )
  await call('viewSaveAs', 'Child defaults', 'R0001')
  await page.waitForFunction(
    () => !window.editingFixture.viewRead('R0001').busy,
  )
  await call('childToggle', 'R0001')
  await call('remember', 'R0001')
  const cycle = async (from, to) => {
    for (let i = from; i < to; i++) {
      await call('viewChoose', ascending)
      await call('viewChoose', descending)
    }
  }
  await cycle(0, 10)
  const before = await read()
  const warm = await metrics()
  const warmObjects = await heap('views-10')
  await cycle(10, 100)
  const hundred = await metrics()
  const hundredObjects = await heap('views-100')
  await cycle(100, 200)
  const twoHundred = await metrics()
  const twoHundredObjects = await heap('views-200')
  const after = await read()
  assert.equal(after.identity, true)
  assert.equal(after.counts.views, before.counts.views)
  assert.equal(after.counts.cells, before.counts.cells)
  assert.equal((await call('viewRead')).views.length, 2)
  assert.equal((await call('viewStorageRead')).save, 3)
  const categories = [
    'Data records',
    'Native row views',
    'Table cells',
    'Solid store targets',
    'Solid owner scopes',
    'Solid computations and effects',
    'Solid dependency links',
    'Saved Table views',
    'Saved Table configurations',
    'Table view controllers',
  ]
  if (warmObjects)
    for (const category of categories) {
      assert.equal(
        hundredObjects[category] ?? 0,
        warmObjects[category] ?? 0,
        category,
      )
      assert.equal(
        twoHundredObjects[category] ?? 0,
        warmObjects[category] ?? 0,
        category,
      )
    }
  await call('stop')
  const disposed = await metrics()
  const disposedObjects = await heap('views-disposed')
  if (disposedObjects)
    for (const category of categories)
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
