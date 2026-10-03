import assert from 'node:assert/strict'

export async function aggregateCases({
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
  const choice = (name) =>
    page.getByRole('combobox', { name: `${name} summary`, exact: true })
  const group = () => page.locator('[data-group]').first()
  const summary = (id) => group().locator(`[data-group-summary="${id}"]`)
  const value = (id) => summary(id).innerText()
  const day = 86_400_000
  async function seed() {
    await start(5, 'table')
    const amounts = [10, 20, 90, null, 20]
    const names = ['Amy', 'Ben', 'Ada', 'Bea', 'Ari']
    for (let i = 0; i < 5; i++)
      await call('patch', `R000${i + 1}`, {
        amount: amounts[i],
        name: names[i],
        dueDate: i === 3 ? null : Date.UTC(2026, 9, 1) + i * day,
      })
    await call('grouping', ['priority'])
    await settle()
  }
  await record(
    'numeric summaries include median, range and span over saved filtered leaves',
    async () => {
      await seed()
      for (const [name, result] of [
        ['sum', '140'],
        ['min', '10'],
        ['max', '90'],
        ['mean', '35'],
        ['median', '20'],
        ['range', '10 – 90'],
        ['span', '80'],
        ['count', '5'],
        ['filled', '4'],
        ['empty', '1'],
        ['distinct', '3'],
      ]) {
        await choice('Amount').selectOption(name)
        assert.ok(
          (await value('amount')).endsWith(`: ${result}`),
          await value('amount'),
        )
      }
      await choice('Amount').selectOption('mean')
      await call('grouping', ['priority', 'name'])
      assert.ok((await value('amount')).endsWith(': 35')) // Child averages would be incorrect.
      await call('filter', 'name', 'a')
      assert.ok((await value('amount')).endsWith(': 40'))
      await choice('Amount').selectOption('median')
      assert.ok((await value('amount')).endsWith(': 20'))
      await call('filter', 'name', '')
      await call('patch', 'R0003', { amount: -10 })
      await choice('Amount').selectOption('range')
      assert.ok((await value('amount')).endsWith(': -10 – 20'))
    },
  )
  await record(
    'date summaries show UTC dates, elapsed days and empty values',
    async () => {
      await seed()
      assert.equal(
        await choice('Due date').locator('option[value=sum]').count(),
        0,
      )
      for (const [name, result] of [
        ['min', '2026-10-01'],
        ['max', '2026-10-05'],
        ['range', '2026-10-01 – 2026-10-05'],
        ['span', '4 days'],
        ['filled', '4'],
        ['empty', '1'],
        ['count', '5'],
      ]) {
        await choice('Due date').selectOption(name)
        assert.ok((await value('dueDate')).endsWith(`: ${result}`))
      }
      await call('filter', 'name', 'Bea')
      await choice('Due date').selectOption('range')
      assert.ok((await value('dueDate')).endsWith(': —'))
      await choice('Amount').selectOption('mean')
      assert.ok((await value('amount')).endsWith(': —'))
      await choice('Amount').selectOption('sum')
      assert.ok((await value('amount')).endsWith(': 0'))
      await call('filter', 'name', 'absent')
      assert.equal(await page.locator('[data-group]').count(), 0)
      await call('filter', 'name', '')
      assert.ok((await value('dueDate')).endsWith(': 2026-10-01 – 2026-10-05'))
    },
  )
  await record(
    'general aggregates count blanks and distinct values without changing source values',
    async () => {
      await seed()
      for (const [id, note] of [
        ['R0001', 'same'],
        ['R0002', 'same'],
        ['R0003', ''],
        ['R0004', '  '],
        ['R0005', ' same '],
      ])
        await call('patch', id, { note })
      for (const [name, result] of [
        ['count', 5],
        ['filled', 3],
        ['empty', 2],
        ['distinct', 2],
      ]) {
        await choice('Note').selectOption(name)
        assert.ok((await value('note')).endsWith(`: ${result}`))
      }
      assert.equal(
        await choice('Note').locator('option[value=median]').count(),
        0,
      )
      await call('summary', 'note', 'median') // Reject a caller choice outside the column catalog.
      assert.equal(await choice('Note').inputValue(), 'distinct')
      assert.equal((await read()).sample[4].note, ' same ')
    },
  )
  await record(
    'first and last follow record sorting independently of expansion and group ordering',
    async () => {
      await seed()
      await call('grouping', ['priority', 'name'])
      await choice('Amount').selectOption('last')
      assert.ok((await value('amount')).endsWith(': 20'))
      await call('sorting', [{ id: 'name', desc: false }])
      assert.ok((await value('amount')).endsWith(': 20')) // Ben is last.
      await choice('Amount').selectOption('first')
      assert.ok((await value('amount')).endsWith(': 90')) // Ada is first.
      await call('sorting', [{ id: 'name', desc: true }])
      assert.ok((await value('amount')).endsWith(': 20'))
      await call('sorting', [{ id: 'dueDate', desc: true }])
      await choice('Amount').selectOption('last')
      assert.ok((await value('amount')).endsWith(': —')) // Missing dates sort last, and first/last preserve blanks.
      assert.equal(await page.locator('[data-row]').count(), 0)
      await call('expandGroups', true)
      assert.ok((await value('amount')).endsWith(': —'))
    },
  )
  await record(
    'grouping columns retain their bucket labels while showing a selected aggregate',
    async () => {
      await seed()
      await choice('Priority').selectOption('count')
      assert.match(await group().innerText(), /Priority: normal/)
      assert.ok((await value('priority')).endsWith(': 5'))
      await call('grouping', ['name'])
      await choice('Name').selectOption('first')
      await call('sorting', [{ id: 'name', desc: false }])
      assert.match(await group().innerText(), /Name initial: A/)
      assert.ok((await value('name')).endsWith(': Ada'))
    },
  )
  await record(
    'summary controls preserve drafts, caller choices and configuration when hidden or gated',
    async () => {
      await seed()
      await call('expandGroups', true)
      await edit('R0001', 'note').click()
      await input('R0001', 'note').fill('')
      assert.match(await value('note'), /Filled notes: 5/)
      await choice('Note').selectOption('empty')
      assert.ok((await value('note')).endsWith(': 0'))
      await choice('Amount').focus()
      await page.keyboard.press('Home')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      assert.equal((await read()).summaries.amount, 'count')
      await call('summary', 'amount', 'median')
      assert.equal(await choice('Amount').inputValue(), 'median')
      await call('controls', { grouping: false })
      assert.equal(await choice('Amount').count(), 0)
      await call('controls', { grouping: true })
      assert.equal(await choice('Amount').inputValue(), 'median')
      await call('localProcessing', false)
      assert.ok(await choice('Amount').isDisabled())
      await call('localProcessing', true)
      await page.getByRole('button', { name: 'Save all', exact: true }).click()
      await idle()
      assert.ok((await value('note')).endsWith(': 1'))
      assert.deepEqual((await read()).drafts, {})
    },
  )
  await record(
    'summary ordering uses numeric and range values and retains its choice when disabled',
    async () => {
      await seed()
      await call('patch', 'R0003', { priority: 'high' })
      const order = page.getByRole('combobox', {
        name: 'Order Priority groups',
        exact: true,
      })
      await order.selectOption('amount:desc')
      assert.match(await group().innerText(), /Priority: high/)
      await choice('Amount').selectOption('range')
      await order.selectOption('amount:asc')
      assert.match(await group().innerText(), /Priority: normal/)
      await call('patch', 'R0001', { amount: 100 })
      await call('patch', 'R0002', { amount: 100 })
      await call('patch', 'R0005', { amount: 100 })
      assert.match(await group().innerText(), /Priority: high/)
      await choice('Amount').selectOption('none')
      assert.equal(await summary('amount').count(), 0)
      assert.equal((await read()).groupSorting[0].id, 'amount')
      await choice('Amount').selectOption('sum')
      assert.match(await group().innerText(), /Priority: high/)
    },
  )
  await record(
    'equivalent ranges and repeated aggregate changes keep views stable and release them',
    async () => {
      await seed()
      await choice('Amount').selectOption('range')
      const before = await read()
      for (let i = 0; i < 8; i++)
        await call('patch', 'R0002', { amount: 21 + i })
      assert.ok((await value('amount')).endsWith(': 10 – 90'))
      for (let i = 0; i < 8; i++) {
        await choice('Amount').selectOption('median')
        await choice('Amount').selectOption('range')
      }
      const after = await read()
      assert.equal(after.counts.groupReads, before.counts.groupReads)
      assert.equal(after.counts.groupViews, before.counts.groupViews)
      assert.equal(after.counts.groupCells, before.counts.groupCells)
      assert.equal(
        after.counts.medianValues - before.counts.medianValues,
        8 * 4,
      )
      assert.equal(after.counts.requests, 0)
      assert.equal(after.counts.validations, 0)
      await call('stop')
      const disposed = await call('lastCounts')
      assert.equal(disposed.groupViews, disposed.groupsUnmounted)
      assert.equal(disposed.views, disposed.unmounted)
    },
  )
}
