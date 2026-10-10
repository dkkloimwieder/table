import assert from 'node:assert/strict'

export async function applicationRecordCases({
  page,
  call,
  read,
  record,
  settle,
  idle,
  popup = false,
}) {
  const west = 'item:west'
  const east = 'item:east'
  const initial = () => [
    {
      id: west,
      name: 'App Zulu',
      note: 'From the application',
      priority: 'high',
      revision: 'west:1',
      amount: 73,
      dueDate: Date.UTC(2026, 9, 5),
    },
    {
      id: east,
      name: 'App Alpha',
      note: 'Another supplied record',
      priority: 'low',
      revision: 'east:1',
      amount: 19,
      dueDate: null,
    },
  ]
  const root = () => page.locator('[data-table-scope="root"]')
  async function start(records = initial()) {
    await call('start', 8, 'row', 'default', 'application', records)
    await page.waitForFunction(() => window.editingFixture.ready())
    await settle()
  }
  const input = () =>
    root().getByRole('textbox', { name: `Name ${west}`, exact: true })
  async function edit(name) {
    await root()
      .getByRole('button', { name: `Edit name ${west}`, exact: true })
      .click()
    await input().fill(name)
  }
  const save = () =>
    root()
      .getByRole('button', { name: `Save ${west}`, exact: true })
      .click()
  await record(
    'application records: supplied IDs, values and revisions reach rendering, actions and saves',
    async () => {
      await start()
      const before = await read()
      assert.deepEqual(before.ids, [west, east])
      assert.deepEqual(before.sample, initial())
      await call('remember', west)
      await root()
        .getByRole('button', { name: `Inspect ${west}`, exact: true })
        .click()
      assert.equal(
        await page.locator('[data-row-action-result]').innerText(),
        `Inspected row ${west}.`,
      )
      await edit('  App supplied save  ')
      const editor = root().locator(`[data-editor="${west}/priority"]`)
      if (popup) {
        await editor.click()
        await page
          .getByRole('listbox')
          .getByRole('option', { name: 'Normal', exact: true })
          .click()
      } else await editor.selectOption('normal')
      await save()
      await idle()
      const value = await read()
      assert.equal(value.identity, true)
      assert.deepEqual(value.sample[0], {
        ...initial()[0],
        name: 'App supplied save',
        priority: 'normal',
        revision: 'application-1',
      })
      assert.deepEqual(value.sample[1], initial()[1])
      assert.deepEqual((await call('applicationRead')).sent[0].request, {
        id: west,
        expectedRevision: 'west:1',
        changes: { name: 'App supplied save', priority: 'normal' },
      })
    },
  )
  await record(
    'application records: background updates keep the draft and defer filter changes until cancellation',
    async () => {
      await start()
      await call('controls', { filters: 'external' })
      await call('filter', 'name', 'Zulu')
      await edit('App local draft')
      await call('patch', west, {
        name: 'App background',
        note: 'Current server note',
        revision: 'west:2',
      })
      await settle()
      assert.equal(await input().inputValue(), 'App local draft')
      let value = await read()
      assert.deepEqual(value.ids, [west])
      assert.equal(value.sample[0].name, 'App background')
      assert.equal(value.sample[0].revision, 'west:2')
      assert.equal(value.drafts[west].revision, 'west:1')
      await save()
      await idle()
      value = await read()
      assert.equal(value.drafts[west].status, 'conflict')
      assert.equal((await call('applicationRead')).sent.length, 0)
      await call('cancelDraft', west)
      await settle()
      assert.deepEqual((await read()).ids, [])
      await call('filter', 'name', '')
      await settle()
      assert.deepEqual((await read()).ids, [west, east])
      assert.equal((await read()).sample[0].note, 'Current server note')
    },
  )
  await record(
    'application records: an in-flight save cannot replace a background revision and retry uses the new token',
    async () => {
      await start()
      await call('remember', west)
      await edit('App held save')
      await call('applicationFault', 'hold')
      await call('saveTwice', west)
      await settle()
      assert.equal((await call('applicationRead')).sent.length, 1)
      await call('patch', west, {
        name: 'App newer record',
        revision: 'west:2',
      })
      await call('applicationRelease')
      await idle()
      let value = await read()
      assert.equal(value.drafts[west].status, 'conflict')
      assert.equal(value.sample[0].name, 'App newer record')
      assert.equal(value.sample[0].revision, 'west:2')
      assert.equal(value.identity, true)
      await call('cancelDraft', west)
      await edit('App retry')
      await save()
      await idle()
      value = await read()
      assert.equal(value.sample[0].name, 'App retry')
      assert.equal(value.sample[0].revision, 'application-2')
      assert.equal(
        (await call('applicationRead')).sent[1].request.expectedRevision,
        'west:2',
      )
      assert.deepEqual(value.sample[1], initial()[1])
    },
  )
  await record(
    'application records: deletion during a save rejects its response and removes the row after draft cancellation',
    async () => {
      await start()
      await edit('App removed save')
      await call('applicationFault', 'hold')
      await save()
      await settle()
      await call('remove', west)
      await settle()
      assert.deepEqual((await read()).ids, [west, east])
      await call('applicationRelease')
      await idle()
      const value = await read()
      assert.equal(value.drafts[west].status, 'conflict')
      assert.equal(value.sample[0].name, 'App Zulu')
      assert.equal(value.sample[0].revision, 'west:1')
      await call('cancelDraft', west)
      await settle()
      assert.deepEqual((await read()).ids, [east])
      assert.deepEqual((await read()).sample, [initial()[1]])
      assert.equal(
        await root()
          .getByRole('button', { name: `Inspect ${west}`, exact: true })
          .count(),
        0,
      )
    },
  )
  await record(
    'application records: an empty supplied array overrides size and omitted records preserve demo generation',
    async () => {
      await start([])
      assert.deepEqual((await read()).ids, [])
      assert.deepEqual((await read()).sample, [])
      assert.equal(
        await root().getByText('No records yet.', { exact: true }).count(),
        1,
      )
      await call('start', 2)
      await page.waitForFunction(() => window.editingFixture.ready())
      await settle()
      assert.deepEqual((await read()).ids, ['R0001', 'R0002'])
      assert.equal((await read()).sample[0].name, 'Record 0001')
      await call('stop')
      assert.equal(await page.locator('table').count(), 0)
    },
  )
}
