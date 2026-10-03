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
  select,
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
      assert.match(await group('Priority: high').innerText(), /2 records/)
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
      assert.match(
        await page.locator('[data-group]').first().innerText(),
        /Priority: low/,
      )
      await order('Priority').selectOption('note:desc')
      assert.match(
        await page.locator('[data-group]').first().innerText(),
        /Priority: normal/,
      )
      assert.match(await group('Priority: high').innerText(), /Filled notes: 2/)
      await page
        .getByRole('combobox', { name: 'Note summary', exact: true })
        .selectOption('distinct')
      assert.match(
        await group('Priority: high').innerText(),
        /Distinct notes: 1/,
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
      assert.match(await group('Priority: high').innerText(), /2 records/)
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
      assert.match(await group('Priority: high').innerText(), /1 record/)
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
    'collapsed drafts can reopen only their group path after filters clear',
    async () => {
      await seed('table')
      await add().selectOption('name')
      await button('Expand all groups').click()
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Draft inside group')
      await button('Collapse all groups').click()
      assert.equal(await page.locator('[data-row]').count(), 0)
      assert.equal((await read()).drafts.R0001.note, 'Draft inside group')
      await page
        .getByRole('searchbox', { name: 'Search all columns', exact: true })
        .fill('Fourth note')
      await button('Show R0001').click()
      await settle()
      assert.deepEqual((await read()).grouping, ['priority', 'name'])
      assert.equal((await read()).search, '')
      assert.equal(
        await input('R0001', 'note').inputValue(),
        'Draft inside group',
      )
      assert.equal(await page.locator('[data-row]').count(), 2)
      assert.equal(await button('Expand Priority: normal').count(), 1)
      assert.equal(await button('Expand Priority: low').count(), 1)
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'a saved grouped field moves the row and focuses its collapsed destination',
    async () => {
      await seed()
      await button('Expand Priority: normal').click()
      await edit('R0004', 'priority').click()
      await select('R0004').selectOption('high')
      assert.match(await group('Priority: high').innerText(), /2 records/)
      await save('R0004').click()
      await idle()
      assert.match(await group('Priority: high').innerText(), /3 records/)
      assert.match(await group('Priority: normal').innerText(), /4 records/)
      assert.match(await group('Priority: high').innerText(), /Filled notes: 3/)
      assert.ok(await focused(button('Expand Priority: high')))
      assert.deepEqual((await read()).drafts, {})
      await button('Expand Priority: high').click()
      assert.equal(await edit('R0004', 'priority').innerText(), 'high')
    },
  )
  await record(
    'Save all validates hidden group drafts and retains failed drafts for retry',
    async () => {
      await seed('table')
      await button('Expand all groups').click()
      await edit().click()
      await input().fill('')
      await button('Collapse all groups').click()
      await button('Save all').click()
      await idle()
      assert.equal((await read()).counts.requests, 0)
      assert.ok((await read()).drafts.R0001.fieldErrors.name)
      await button('Show R0001').click()
      await input().fill('Alicia')
      await button('Collapse all groups').click()
      await call('fault', 'refuse')
      await button('Save all').click()
      await idle()
      assert.equal((await read()).drafts.R0001.name, 'Alicia')
      assert.equal(await page.locator('[data-row]').count(), 0)
      await button('Save all').click()
      await idle()
      assert.deepEqual((await read()).drafts, {})
      assert.equal((await read()).sample[0].name, 'Alicia')
      assert.equal(await page.locator('[data-row]').count(), 0)
    },
  )
  await record(
    'a pending save respects later group collapse and keeps its focus',
    async () => {
      await seed()
      await button('Expand all groups').click()
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('Held group save')
      await call('fault', 'hold')
      await save().click()
      await button('Collapse all groups').click()
      assert.equal(await page.locator('[data-row]').count(), 0)
      await call('release')
      await idle()
      assert.deepEqual((await read()).drafts, {})
      assert.equal((await read()).sample[0].note, 'Held group save')
      assert.equal(await page.locator('[data-row]').count(), 0)
      assert.ok(await focused(button('Collapse all groups')))
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
