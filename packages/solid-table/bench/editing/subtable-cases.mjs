import assert from 'node:assert/strict'

export async function subtableCases({
  page,
  start,
  call,
  read,
  record,
  settle,
  idle,
}) {
  const child = (id = 'R0001') => page.locator(`[data-subtable="${id}"]`)
  const rootButton = (name) =>
    page
      .locator('[data-table-scope="root"] > .toolbar')
      .getByRole('button', { name, exact: true })
  const toggle = (id = 'R0001') =>
    page.locator(`[data-subtable-toggle="${id}"]`)
  const row = (id = 'R0001') => child(id).locator('[data-row="R0001"]')
  const childRead = async (id = 'R0001') => (await call('childRead', id))?.model
  async function open(id = 'R0001') {
    await toggle(id).click()
    await page.waitForFunction(
      (id) => window.editingFixture.childRead(id)?.status === 'ready',
      id,
    )
    await settle()
  }
  async function draft(text, id = 'R0001') {
    await row(id)
      .getByRole('button', { name: 'Edit name R0001', exact: true })
      .click()
    await row(id)
      .getByRole('textbox', { name: 'Name R0001', exact: true })
      .fill(text)
    await child(id).getByRole('heading').click()
  }
  async function saved(id = 'R0001') {
    await page.waitForFunction(
      (id) => !window.editingFixture.childRead(id).model.savingAll,
      id,
    )
    await settle()
  }
  await record(
    'nested tables and summary labels remain inside the mobile scroll area',
    async () => {
      await start(8, 'table')
      await call('grouping', ['priority', 'name'])
      await call('expandGroups', true)
      await open()
      try {
        await page.setViewportSize({ width: 390, height: 844 })
        await settle()
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        const width = await child().evaluate(
          (node) => node.getBoundingClientRect().width,
        )
        assert.ok(width <= 342)
        await child()
          .getByRole('combobox', { name: 'Save mode', exact: true })
          .scrollIntoViewIfNeeded()
        await child()
          .getByRole('combobox', { name: 'Save mode', exact: true })
          .selectOption('row')
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 })
      }
    },
  )
  await record(
    'group summaries have no child controls while expanded records can open independent sub-tables',
    async () => {
      await start(8, 'table')
      await call('grouping', ['priority'])
      await call('expandGroups', true)
      await open()
      await draft('Grouped child edit')
      assert.equal(
        await page.locator('[data-group] [data-subtable-toggle]').count(),
        0,
      )
      assert.equal(
        await page
          .locator(
            '[data-table-scope="root"] > .table-scroll > table > tbody > [data-row] [data-edit]',
          )
          .count(),
        0,
      )
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await saved()
      assert.equal((await childRead()).sample[0].name, 'Grouped child edit')
      assert.equal((await read()).counts.requests, 0)
      await toggle().click()
      await open('R0002')
      assert.equal((await call('childCounts')).loads, 2)
      await call('grouping', [])
      assert.equal(await child('R0002').count(), 1)
    },
  )
  await record(
    'sub-tables load lazily and retain one model across collapse',
    async () => {
      await start(8, 'table')
      assert.equal((await call('childCounts')).created, 0)
      await call('childLoadFault', 'hold')
      await toggle().click()
      assert.match(await child().innerText(), /Loading sub-table/)
      await toggle().click()
      await call('childLoadRelease')
      await page.waitForFunction(
        () => window.editingFixture.childRead('R0001')?.status === 'ready',
      )
      assert.equal(await child().count(), 0)
      assert.equal((await childRead()).counts.views, 0)
      await open()
      assert.equal((await childRead()).counts.views, 5)
      await draft('Child draft')
      assert.equal(await toggle().isDisabled(), true)
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await saved()
      await toggle().click()
      const closed = await childRead()
      assert.equal(closed.counts.views, closed.counts.unmounted)
      assert.deepEqual(closed.drafts, {})
      assert.equal(closed.sample[0].name, 'Child draft')
      assert.equal(
        await toggle().evaluate((node) => node === document.activeElement),
        true,
      )
      await open()
      assert.equal((await call('childCounts')).loads, 1)
      assert.match(await row().innerText(), /Child draft/)
    },
  )
  await record(
    'parent and sibling sub-table saves are independent even with identical row IDs',
    async () => {
      await start(8, 'table')
      await open()
      await open('R0002')
      await page
        .locator(
          '[data-table-scope="root"] > .table-scroll > table > tbody > [data-row="R0001"]',
        )
        .getByRole('button', { name: 'Edit name R0001', exact: true })
        .click()
      await page
        .locator(
          '[data-table-scope="root"] > .table-scroll > table > tbody > [data-row="R0001"]',
        )
        .getByRole('textbox', { name: 'Name R0001', exact: true })
        .fill('Parent draft')
      await draft('First child draft')
      await draft('Second child draft', 'R0002')
      await rootButton('Save all').click()
      await idle()
      assert.equal((await read()).sample[0].name, 'Parent draft')
      assert.equal((await childRead()).counts.requests, 0)
      assert.equal((await childRead('R0002')).counts.requests, 0)
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await saved()
      assert.equal((await childRead()).sample[0].name, 'First child draft')
      assert.equal(
        (await childRead('R0002')).drafts.R0001.name,
        'Second child draft',
      )
      const ids = await page
        .locator('[id]')
        .evaluateAll((nodes) => nodes.map((node) => node.id))
      assert.equal(
        ids.length,
        new Set(ids).size,
        'ARIA IDs must be unique across collections',
      )
      assert.equal(
        await page.locator('[aria-describedby]').evaluateAll((nodes) =>
          nodes.every((node) =>
            node
              .getAttribute('aria-describedby')
              .split(' ')
              .every(
                (id) => document.getElementById(id) || id.includes('edited-'),
              ),
          ),
        ),
        true,
      )
    },
  )
  await record(
    'child filters grouping summaries widths order and save mode survive collapse independently',
    async () => {
      await start(8)
      await open()
      await open('R0002')
      await child()
        .getByRole('searchbox', { name: 'Search all columns', exact: true })
        .fill('Record 0001')
      assert.equal((await childRead()).ids.length, 1)
      assert.equal((await read()).ids.length, 8)
      assert.equal((await childRead('R0002')).ids.length, 5)
      await child()
        .getByRole('combobox', { name: 'Save mode', exact: true })
        .selectOption('row')
      const resize = child().getByRole('separator', {
        name: 'Resize Name column',
        exact: true,
      })
      await resize.focus()
      await page.keyboard.press('ArrowRight')
      await child()
        .getByRole('button', { name: 'Move Name column', exact: true })
        .focus()
      await page.keyboard.press('ArrowRight')
      await child()
        .getByRole('combobox', { name: 'Add grouping', exact: true })
        .selectOption('priority')
      await child()
        .getByRole('combobox', { name: 'Amount summary', exact: true })
        .selectOption('median')
      const before = await childRead()
      await toggle().click()
      await open()
      const after = await childRead()
      for (const key of [
        'search',
        'grouping',
        'summaries',
        'widths',
        'columnOrder',
      ])
        assert.deepEqual(after[key], before[key])
      assert.deepEqual((await read()).grouping, [])
      assert.deepEqual((await childRead('R0002')).grouping, [])
      await child()
        .getByRole('button', { name: 'Clear grouping', exact: true })
        .click()
      assert.equal(
        await child()
          .getByRole('combobox', { name: 'Save mode', exact: true })
          .inputValue(),
        'row',
      )
    },
  )
  await record(
    'parent filters and sorting wait for child edits to resolve',
    async () => {
      await start(8, 'table')
      await open()
      await draft('Preserved until save')
      await row()
        .getByRole('button', { name: 'Edit name R0001', exact: true })
        .click()
      await call('filter', 'id', 'R0002')
      await call('sorting', [{ id: 'name', desc: true }])
      assert.deepEqual((await read()).filters, [])
      assert.deepEqual((await read()).sorting, [])
      assert.equal(await child().count(), 1)
      assert.equal(
        (await childRead()).drafts.R0001.name,
        'Preserved until save',
      )
      assert.equal(
        await row()
          .getByRole('textbox', { name: 'Name R0001', exact: true })
          .evaluate((n) => n === document.activeElement),
        true,
      )
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await saved()
      await call('filter', 'id', 'R0002')
      assert.equal(await child().count(), 0)
      await call('filter', 'id', '')
      assert.equal(await child().count(), 1)
      assert.equal((await call('childCounts')).loads, 1)
    },
  )
  await record(
    'empty refused and synchronous failed child loads have scoped retry controls',
    async () => {
      for (const fault of ['empty', 'refuse', 'throw']) {
        await start()
        await call('childLoadFault', fault)
        await toggle().click()
        if (fault === 'empty') {
          await page.waitForFunction(
            () => window.editingFixture.childRead('R0001')?.status === 'ready',
          )
          assert.match(await child().innerText(), /No records yet/)
        } else {
          await child()
            .getByRole('button', { name: 'Retry sub-table', exact: true })
            .waitFor()
          await child()
            .getByRole('button', { name: 'Retry sub-table', exact: true })
            .click()
          await page.waitForFunction(
            () => window.editingFixture.childRead('R0001')?.status === 'ready',
          )
          assert.equal((await childRead()).ids.length, 5)
        }
      }
    },
  )
  await record(
    'scope changes reject obsolete loads and protect existing child drafts',
    async () => {
      await start()
      await call('childLoadFault', 'late')
      await toggle().click()
      await call('childScope', 'previous')
      await settle()
      await open()
      await call('childLoadRelease')
      await settle()
      assert.equal((await call('childCounts')).ignored, 1)
      assert.equal(
        (await childRead()).sample[0].name,
        'R0001 previous · Record 0001',
      )
      await draft('Do not lose this draft')
      assert.equal(await call('childScope', 'current'), false)
      assert.match(
        await page.locator('main').innerText(),
        /Save or cancel edits/,
      )
      assert.equal(
        (await childRead()).drafts.R0001.name,
        'Do not lose this draft',
      )
      assert.equal(await call('childScope', 'current', true), false)
      assert.equal(
        (await childRead()).drafts.R0001.name,
        'Do not lose this draft',
      )
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await saved()
      assert.equal(await call('childScope', 'current'), true)
      await settle()
      assert.equal(await call('childRead', 'R0001'), undefined)
      assert.equal(
        (await call('childCounts')).created,
        (await call('childCounts')).disposed,
      )
    },
  )
  await record(
    'a held child save prevents collapse and respects later focus',
    async () => {
      await start()
      await open()
      await draft('Save before collapse')
      await call('childFault', 'R0001', 'hold')
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await settle()
      assert.equal(await toggle().isDisabled(), true)
      await call('childToggle', 'R0001')
      assert.equal(await child().count(), 1)
      await page.locator('[data-table-scope="root"] > .after-table').click()
      await call('childRelease', 'R0001')
      await saved()
      assert.equal((await childRead()).sample[0].name, 'Save before collapse')
      assert.equal(
        await page
          .locator('[data-table-scope="root"] > .after-table')
          .evaluate((n) => n === document.activeElement),
        true,
      )
      await toggle().click()
      assert.equal(
        (await childRead()).counts.views,
        (await childRead()).counts.unmounted,
      )
    },
  )
  await record(
    'parent removal waits for child saves then aborts remaining loads and releases scopes',
    async () => {
      await start()
      await open()
      await call('childLoadFault', 'hold')
      await toggle('R0002').click()
      await draft('Save before parent removal')
      await call('childFault', 'R0001', 'hold')
      await child()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await call('remove', 'R0001')
      await call('remove', 'R0002')
      await settle()
      assert.equal((await call('childCounts')).entries, 2)
      assert.equal((await call('childCounts')).aborted, 0)
      await call('childRelease', 'R0001')
      await page.waitForFunction(
        () => window.editingFixture.childCounts().entries === 0,
      )
      const counts = await call('childCounts')
      assert.equal(counts.created, counts.disposed)
      assert.equal(counts.aborted, 1)
      await call('childLoadRelease')
      assert.equal(await child().count(), 0)
    },
  )
  await record(
    'repeated child collapse releases views without recreating its collection',
    async () => {
      await start(100)
      await open()
      const parent = (await read()).counts
      for (let index = 0; index < 20; index++) {
        await call('childToggle', 'R0001')
        await call('childToggle', 'R0001')
      }
      await call('childToggle', 'R0001')
      await settle()
      const value = await childRead()
      assert.equal(value.counts.views, value.counts.unmounted)
      assert.equal(value.counts.resizeListeners, 0)
      assert.equal(value.counts.reorderListeners, 0)
      assert.equal((await call('childCounts')).created, 1)
      assert.equal((await call('childCounts')).loads, 1)
      for (const key of [
        'views',
        'cells',
        'unmounted',
        'name',
        'note',
        'priority',
      ])
        assert.equal((await read()).counts[key], parent[key], key)
      await call('stop')
      assert.equal(
        (await call('childCounts')).created,
        (await call('childCounts')).disposed,
      )
    },
  )
}

export async function subtableWorkload({
  page,
  call,
  start,
  settle,
  metrics,
  heap,
}) {
  await start(100, 'table')
  const before = await metrics()
  await call('childToggle', 'R0001')
  await page.waitForFunction(
    () => window.editingFixture.childStatus('R0001') === 'ready',
  )
  await call('childToggle', 'R0001')
  async function cycles(count) {
    for (let index = 0; index < count; index++) {
      await call('childToggle', 'R0001')
      await call('childToggle', 'R0001')
    }
    await settle()
    const value = (await call('childRead', 'R0001')).model
    assert.equal(value.counts.views, value.counts.unmounted)
    assert.equal(value.counts.resizeListeners, 0)
    assert.equal(value.counts.reorderListeners, 0)
  }
  await cycles(10)
  const warmed = await metrics()
  const warmObjects = await heap('child-closed-10')
  await cycles(90)
  const repeated = await metrics()
  const repeatedObjects = await heap('child-closed-100')
  await cycles(100)
  const settled = await metrics()
  const settledObjects = await heap('child-closed-200')
  const categories = [
    'Data records',
    'Native row views',
    'Table cells',
    'Native group views',
    'Native group cells',
    'Solid store targets',
    'Solid store property signals',
    'Solid owner scopes',
    'Solid computations and effects',
    'Solid dependency links',
  ]
  for (const objects of [repeatedObjects, settledObjects])
    if (objects) {
      for (const category of categories)
        assert.equal(
          objects[category] ?? 0,
          warmObjects[category] ?? 0,
          `Child collapse retains ${category}`,
        )
      assert.equal(objects['Data records'], 105)
      assert.equal(objects['Native row views'], 100)
    }
  assert.equal((await call('childCounts')).loads, 1)
  assert.equal((await call('childCounts')).created, 1)
  await call('childToggle', 'R0001')
  const expanded = await metrics()
  const expandedObjects = await heap('child-open')
  if (expandedObjects) {
    assert.equal(expandedObjects['Data records'], 105)
    assert.equal(expandedObjects['Native row views'], 105)
    assert.equal(expandedObjects['Table cells'], 630)
  }
  await call('remove', 'R0001')
  await settle()
  const removed = await metrics()
  const removedObjects = await heap('child-parent-removed')
  if (removedObjects) {
    assert.equal(removedObjects['Data records'], 99)
    assert.equal(removedObjects['Native row views'], 99)
    assert.equal(removedObjects['Table cells'], 594)
  }
  const counts = await call('childCounts')
  assert.equal(counts.created, counts.disposed)
  await call('stop')
  await settle()
  const disposed = await metrics()
  const disposedObjects = await heap('child-disposed')
  if (disposedObjects)
    for (const category of categories)
      assert.equal(
        disposedObjects[category] ?? 0,
        0,
        `Disposed child fixture retains ${category}`,
      )
  return {
    cycles: 200,
    counts,
    before,
    warmed,
    repeated,
    settled,
    expanded,
    removed,
    disposed,
    warmObjects,
    repeatedObjects,
    settledObjects,
    expandedObjects,
    removedObjects,
    disposedObjects,
  }
}
