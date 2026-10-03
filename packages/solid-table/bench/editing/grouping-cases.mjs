import assert from 'node:assert/strict'

export async function groupingCases({
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
  focused,
}) {
  const add = () =>
    page.getByRole('combobox', { name: 'Add grouping', exact: true })
  const button = (name) => page.getByRole('button', { name, exact: true })
  const group = (label) =>
    page.locator('tr[data-group]').filter({
      has: page
        .getByRole('button', { name: `Expand ${label}`, exact: true })
        .or(
          page.getByRole('button', {
            name: `Collapse ${label}`,
            exact: true,
          }),
        ),
    })
  const order = (name) =>
    page.getByRole('combobox', { name: `Order ${name} groups`, exact: true })
  async function seed(mode = 'row') {
    await start(8, mode)
    await call('patch', 'R0001', {
      name: 'Alice',
      priority: 'high',
      note: 'Shared note',
    })
    await call('patch', 'R0002', { name: 'Ben', priority: 'low', note: '' })
    await call('patch', 'R0003', {
      name: 'Anna',
      priority: 'high',
      note: 'Shared note',
    })
    await call('patch', 'R0004', {
      name: 'Bea',
      priority: 'normal',
      note: 'Fourth note',
    })
    await add().selectOption('priority')
    await settle()
  }
  await record(
    'group controls add nested levels and preserve keys through expansion and reordering',
    async () => {
      await seed()
      assert.equal(await page.locator('[data-row]').count(), 0)
      assert.equal(await page.locator('[data-group]').count(), 3)
      assert.match(await group('Priority: high').textContent(), /2 records/)
      await group('Priority: high').evaluate((node) => {
        node.dataset.retained = 'yes'
      })
      await add().selectOption('name')
      await button('Expand Priority level').click()
      assert.equal(await page.locator('[data-row]').count(), 0)
      await button('Expand Name initial level').click()
      assert.equal(await page.locator('[data-row]').count(), 8)
      await button('Collapse Priority: high').focus()
      await page.keyboard.press('Space')
      await settle()
      assert.equal(await page.locator('[data-row]').count(), 6)
      assert.ok(await focused(button('Expand Priority: high')))
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('[data-row]').count(), 8)
      assert.equal(
        await group('Priority: high').getAttribute('data-retained'),
        'yes',
      )
      await order('Priority').selectOption('value:desc')
      await button('Move Name initial up').click()
      await settle()
      assert.deepEqual((await read()).grouping, ['name', 'priority'])
      assert.deepEqual((await read()).groupSorting, [
        { depth: 1, id: 'priority', desc: true },
      ])
      assert.ok(await focused(order('Name initial')))
      await button('Remove Name initial grouping').click()
      assert.deepEqual((await read()).grouping, ['priority'])
      assert.deepEqual((await read()).groupSorting, [
        { depth: 0, id: 'priority', desc: true },
      ])
      assert.ok(await focused(add()))
      await button('Clear grouping').click()
      assert.equal(await page.locator('[data-group]').count(), 0)
      assert.equal(await page.locator('[data-row]').count(), 8)
    },
  )
  await record(
    'group ordering uses values or selected summaries while leaf sorting stays independent',
    async () => {
      await seed()
      await order('Priority').selectOption('value:asc')
      assert.equal(
        await page.locator('[data-group-toggle]').first().innerText(),
        '▸ low',
      )
      await order('Priority').selectOption('note:desc')
      assert.equal(
        await page.locator('[data-group-toggle]').first().innerText(),
        '▸ normal',
      )
      assert.equal(
        await group('Priority: high')
          .locator('[data-group-summary=note]')
          .textContent(),
        '2',
      )
      assert.equal(
        await page.locator('[data-summary-header=note]').innerText(),
        'filled',
      )
      await page
        .getByRole('combobox', { name: 'Note summary', exact: true })
        .selectOption('distinct')
      assert.equal(
        await group('Priority: high')
          .locator('[data-group-summary=note]')
          .textContent(),
        '1',
      )
      assert.equal(
        await page.locator('[data-summary-header=note]').innerText(),
        'distinct',
      )
      await button('Expand all groups').click()
      await button('Sort by Name').click()
      assert.deepEqual(
        (await read()).display
          .filter((item) => item.kind === 'row')
          .map((item) => item.id),
        [
          'R0004',
          'R0005',
          'R0006',
          'R0007',
          'R0008',
          'R0001',
          'R0003',
          'R0002',
        ],
      )
      await page
        .getByRole('combobox', { name: 'Note summary', exact: true })
        .selectOption('none')
      assert.equal(await page.locator('[data-group-summary=note]').count(), 0)
    },
  )
  await record(
    'search and column filters change group counts and distinguish an empty result from collapsed groups',
    async () => {
      await seed()
      const search = page.getByRole('searchbox', {
        name: 'Search all columns',
        exact: true,
      })
      await search.fill('Shared note')
      assert.equal(await page.locator('[data-group]').count(), 1)
      assert.match(await group('Priority: high').textContent(), /2 records/)
      assert.equal(
        await page
          .getByText('No records match your search or filters.', {
            exact: true,
          })
          .count(),
        0,
      )
      await page
        .getByRole('textbox', { name: 'Filter saved names', exact: true })
        .fill('Alice')
      assert.match(await group('Priority: high').textContent(), /1 record/)
      await search.fill('not found')
      assert.equal(await page.locator('[data-group]').count(), 0)
      assert.equal(
        await page
          .getByText('No records match your search or filters.', {
            exact: true,
          })
          .count(),
        1,
      )
      await button('Show all records').click()
      assert.equal(await page.locator('[data-group]').count(), 3)
      assert.deepEqual((await read()).grouping, ['priority'])
      await call('patch', 'R0002', { name: '' })
      await call('grouping', ['name'])
      assert.equal(await group('Name initial: (none)').count(), 1)
      await call('visibility', 'name', false)
      assert.equal(await group('Name initial: (none)').count(), 1)
    },
  )
  await record(
    'grouping waits for edits then removes edit bindings from grouped records',
    async () => {
      await seed('table')
      await call('grouping', [])
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Saved before grouping')
      await call('grouping', ['priority', 'name'])
      assert.deepEqual((await read()).grouping, [])
      assert.equal((await read()).drafts.R0001.note, 'Saved before grouping')
      await button('Save all').click()
      await idle()
      await call('grouping', ['priority', 'name'])
      await button('Expand all groups').click()
      assert.equal(await page.locator('[data-edit], [data-editor]').count(), 0)
      assert.equal(await button('Save all').count(), 0)
      assert.deepEqual((await read()).drafts, {})
      assert.match(
        await page.locator('[data-row="R0001"]').textContent(),
        /Saved before grouping/,
      )
      await call('grouping', [])
      await edit('R0001', 'note').click()
      assert.equal(
        await input('R0001', 'note').inputValue(),
        'Saved before grouping',
      )
    },
  )
  await record(
    'source updates move read-only records between groups',
    async () => {
      await seed()
      await button('Expand Priority: normal').click()
      await call('patch', 'R0004', { priority: 'high' })
      assert.match(await group('Priority: high').textContent(), /3 records/)
      assert.match(await group('Priority: normal').textContent(), /4 records/)
      await button('Expand Priority: high').click()
      assert.match(
        await page.locator('[data-row="R0004"]').textContent(),
        /high/,
      )
      assert.equal(await page.locator('[data-edit], [data-editor]').count(), 0)
    },
  )
  await record(
    'grouped columns lead in grouping order and clearing grouping restores the manual order',
    async () => {
      await start(8)
      const manual = ['amount', 'note', 'name', 'id', 'priority', 'dueDate']
      await call('order', manual)
      await call('grouping', ['priority', 'name'])
      assert.deepEqual((await read()).visibleColumns, [
        'priority',
        'name',
        'amount',
        'note',
        'id',
        'dueDate',
      ])
      await call('grouping', ['name', 'priority'])
      assert.deepEqual((await read()).visibleColumns.slice(0, 2), [
        'name',
        'priority',
      ])
      assert.equal(await button('Move Name column').count(), 0)
      assert.equal(await button('Move Priority column').count(), 0)
      await call('pinning', { start: ['id'], end: ['name'] })
      assert.deepEqual((await read()).visibleColumns.slice(0, 3), [
        'name',
        'priority',
        'id',
      ])
      await call('pinning', { start: [], end: [] })
      await call('grouping', [])
      assert.deepEqual((await read()).visibleColumns, manual)
      await start(8)
      await call('grouping', ['priority'])
      await button('Move Note column').focus()
      await page.keyboard.press('End')
      await call('grouping', [])
      assert.deepEqual((await read()).visibleColumns, [
        'id',
        'name',
        'priority',
        'amount',
        'dueDate',
        'note',
      ])
    },
  )
  await record(
    'pending saves block grouping and do not reclaim later focus',
    async () => {
      await seed()
      await call('grouping', [])
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Held before grouping')
      await call('fault', 'hold')
      await save().click()
      assert.equal(await add().isDisabled(), true)
      await call('grouping', ['priority'])
      assert.deepEqual((await read()).grouping, [])
      await button('After table').click()
      await call('release')
      await idle()
      assert.deepEqual((await read()).drafts, {})
      assert.equal((await read()).sample[0].note, 'Held before grouping')
      assert.ok(await focused(button('After table')))
      await add().selectOption('priority')
      assert.equal(await page.locator('[data-row]').count(), 0)
    },
  )
  await record(
    'manual processing and hidden controls retain grouping configuration',
    async () => {
      await seed()
      await button('Expand Priority: high').click()
      await call('controls', { grouping: false })
      assert.equal(await add().count(), 0)
      assert.equal(await page.locator('[data-group]').count(), 3)
      await call('controls', { grouping: true })
      await call('localProcessing', false)
      assert.equal(await add().isDisabled(), true)
      assert.equal(await page.locator('[data-group]').count(), 0)
      assert.equal(await page.locator('[data-row]').count(), 8)
      await call('localProcessing', true)
      assert.equal(await button('Collapse Priority: high').count(), 1)
      assert.equal(await page.locator('[data-row]').count(), 2)
    },
  )
  await record(
    'repeated same-bucket updates and summary changes retain group DOM and release collapsed views',
    async () => {
      await seed()
      await add().selectOption('name')
      await button('Expand all groups').click()
      const target = group('Priority: high / Name initial: A')
      await target.evaluate((node) => {
        node.dataset.retained = 'yes'
      })
      const before = await read()
      for (let index = 0; index < 8; index++) {
        await call('patch', 'R0001', {
          name: `Alice ${index}`,
          note: `Updated ${index}`,
        })
        await settle()
      }
      assert.equal(await target.getAttribute('data-retained'), 'yes')
      assert.equal((await read()).counts.groupViews, before.counts.groupViews)
      assert.equal((await read()).counts.views, before.counts.views)
      for (let index = 0; index < 4; index++) {
        await button('Collapse all groups').click()
        await button('Expand all groups').click()
      }
      const expanded = await read()
      assert.equal(expanded.counts.views - expanded.counts.unmounted, 8)
      assert.equal(
        expanded.counts.groupViews - expanded.counts.groupsUnmounted,
        await page.locator('[data-group]').count(),
      )
      await button('Clear grouping').click()
      const cleared = await read()
      assert.equal(cleared.counts.groupViews, cleared.counts.groupsUnmounted)
      assert.equal(cleared.counts.views - cleared.counts.unmounted, 8)
      assert.equal(cleared.counts.requests, 0)
      assert.equal(cleared.counts.validations, 0)
    },
  )
}
