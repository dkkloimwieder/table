import assert from 'node:assert/strict'

export async function editingCallbackCases({
  page,
  call,
  read,
  record,
  settle,
  idle,
  popup = false,
}) {
  const root = () => page.locator('[data-table-scope="root"]')
  async function start(mode = 'row') {
    await call('start', 8, mode, 'default', 'application')
    await page.waitForFunction(() => window.editingFixture.ready())
    await settle()
  }
  async function edit(name, within = root(), id = 'R0001') {
    await within
      .getByRole('button', { name: `Edit name ${id}`, exact: true })
      .click()
    await within
      .getByRole('textbox', { name: `Name ${id}`, exact: true })
      .fill(name)
  }
  const save = () =>
    root().getByRole('button', { name: 'Save R0001', exact: true }).click()
  await record(
    'editing callbacks: application validation and parsed values reach the supplied save',
    async () => {
      await start()
      await call('remember', 'R0001')
      await edit('Outside application rule')
      await save()
      await settle()
      assert.equal(
        (await read()).drafts.R0001.fieldErrors.name,
        'Start the name with App.',
      )
      assert.equal((await call('applicationRead')).sent.length, 0)
      await root()
        .getByRole('textbox', { name: 'Name R0001', exact: true })
        .fill('  App accepted  ')
      const editor = root().locator('[data-editor="R0001/priority"]')
      if (popup) {
        await editor.click()
        await page
          .getByRole('listbox')
          .getByRole('option', { name: 'Low', exact: true })
          .click()
      } else await editor.selectOption('low')
      await save()
      await idle()
      const application = await call('applicationRead')
      assert.deepEqual(application.collections, [{ kind: 'root' }])
      assert.deepEqual(application.sent, [
        {
          collection: { kind: 'root' },
          request: {
            id: 'R0001',
            expectedRevision: '9007199254740993',
            changes: { name: 'App accepted', priority: 'low' },
          },
          aborted: false,
        },
      ])
      const value = await read()
      assert.equal(value.sample[0].name, 'App accepted')
      assert.equal(value.sample[0].priority, 'low')
      assert.equal(value.sample[0].revision, 'application-1')
      assert.equal(value.identity, true)
      assert.equal(value.counts.requests, 1)
    },
  )
  await record(
    'editing callbacks: application refusal, thrown save and mismatched identity preserve drafts',
    async () => {
      await start()
      for (const fault of ['refuse', 'throw', 'wrong-id']) {
        await edit(`App ${fault}`)
        await call('applicationFault', fault)
        await save()
        await idle()
        const value = await read()
        assert.equal(
          value.drafts.R0001.status,
          fault === 'refuse' ? 'refused' : 'uncertain',
        )
        assert.equal(value.drafts.R0001.name, `App ${fault}`)
        assert.equal(value.sample[0].name, 'Record 0001')
        assert.equal(value.sample[0].revision, '9007199254740993')
        if (fault === 'refuse')
          assert.equal(
            value.drafts.R0001.message,
            'Application refused this save.',
          )
        await call('cancelDraft', 'R0001')
      }
      await edit('App retry')
      await save()
      await idle()
      assert.equal((await read()).sample[0].name, 'App retry')
      assert.equal((await call('applicationRead')).sent.length, 4)
    },
  )
  await record(
    'editing callbacks: duplicate saves are guarded and late success cannot overwrite a newer revision',
    async () => {
      await start()
      await edit('App stale')
      await call('applicationFault', 'hold')
      await call('saveTwice', 'R0001')
      await settle()
      assert.equal((await call('applicationRead')).sent.length, 1)
      assert.equal((await read()).drafts.R0001.status, 'pending')
      await call('patch', 'R0001', { name: 'Current application record' })
      await call('applicationRelease')
      await idle()
      const value = await read()
      assert.equal(value.sample[0].name, 'Current application record')
      assert.equal(value.sample[0].revision, '9007199254740994')
      assert.equal(value.drafts.R0001.status, 'conflict')
      assert.equal(value.drafts.R0001.name, 'App stale')
    },
  )
  await record(
    'editing callbacks: whole-table validation blocks every save before application callbacks run',
    async () => {
      await start('table')
      await call('draft', 'R0001', 'App first')
      await call('draft', 'R0002', 'Invalid second')
      await root()
        .getByRole('button', { name: 'Save all', exact: true })
        .click()
      await settle()
      assert.equal((await call('applicationRead')).sent.length, 0)
      assert.equal((await read()).drafts.R0002.status, 'invalid')
      await call('draft', 'R0002', 'App second')
      await call('saveAllTwice')
      await idle()
      const application = await call('applicationRead')
      assert.deepEqual(
        application.sent.map(({ request }) => request.id).sort(),
        ['R0001', 'R0002'],
      )
      assert.equal((await read()).sample[0].name, 'App first')
      assert.equal((await read()).sample[1].name, 'App second')
      assert.deepEqual((await read()).drafts, {})
    },
  )
  await record(
    'editing callbacks: child saves use collection scope rather than root or sibling row IDs',
    async () => {
      await start()
      for (const parentId of ['R0001', 'R0002']) {
        await call('childToggle', parentId)
        await page.waitForFunction(
          (id) => window.editingFixture.childStatus(id) === 'ready',
          parentId,
        )
        const child = page.locator(`[data-subtable="${parentId}"]`)
        await edit(`App child ${parentId}`, child)
        await child
          .getByRole('button', { name: 'Save all', exact: true })
          .click()
        await page.waitForFunction(
          (id) =>
            window.editingFixture.childRead(id).model.sample[0].name ===
            `App child ${id}`,
          parentId,
        )
        await settle()
      }
      assert.equal((await read()).sample[0].name, 'Record 0001')
      assert.equal(
        (await call('childRead', 'R0001')).model.sample[0].name,
        'App child R0001',
      )
      assert.equal(
        (await call('childRead', 'R0002')).model.sample[0].name,
        'App child R0002',
      )
      let application = await call('applicationRead')
      assert.equal(application.collections.length, 3)
      await call('childToggle', 'R0001')
      await call('childToggle', 'R0001')
      assert.equal((await call('applicationRead')).collections.length, 3)
      assert.deepEqual(
        application.sent.map(({ collection, request }) => ({
          collection,
          id: request.id,
        })),
        [
          {
            collection: { kind: 'child', scope: 'current', parentId: 'R0001' },
            id: 'R0001',
          },
          {
            collection: { kind: 'child', scope: 'current', parentId: 'R0002' },
            id: 'R0001',
          },
        ],
      )
      await call('childScope', 'other')
      await call('childToggle', 'R0001')
      await page.waitForFunction(
        () => window.editingFixture.childStatus('R0001') === 'ready',
      )
      const child = page.locator('[data-subtable="R0001"]')
      await edit('App other dataset', child)
      await child.getByRole('button', { name: 'Save all', exact: true }).click()
      await page.waitForFunction(
        () =>
          window.editingFixture.childRead('R0001').model.sample[0].name ===
          'App other dataset',
      )
      application = await call('applicationRead')
      assert.deepEqual(application.sent.at(-1).collection, {
        kind: 'child',
        scope: 'other',
        parentId: 'R0001',
      })
    },
  )
  await record(
    'editing callbacks: disposal aborts application signals and ignores callbacks that resolve afterward',
    async () => {
      await start()
      await edit('App late')
      await call('applicationFault', 'hold')
      await save()
      await settle()
      assert.equal((await call('applicationRead')).pending, 1)
      await call('stop')
      assert.equal((await call('applicationRead')).sent[0].aborted, true)
      await call('applicationRelease')
      await settle()
      assert.equal((await call('applicationRead')).pending, 0)
      assert.equal(await page.locator('[data-editor]').count(), 0)
      assert.equal(await page.getByRole('listbox').count(), 0)
      assert.equal(await page.locator('table').count(), 0)
    },
  )
}
