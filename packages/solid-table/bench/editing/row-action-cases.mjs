import assert from 'node:assert/strict'

export async function rowActionCases({
  page,
  start,
  call,
  read,
  record,
  settle,
  edit,
  input,
}) {
  const inspect = (id) =>
    page.getByRole('button', { name: `Inspect ${id}`, exact: true })
  const result = () => page.locator('[data-row-action-result]')
  await record(
    'row action: pointer invokes the application callback without changing records',
    async () => {
      await start()
      const before = await read()
      await inspect('R0002').click()
      await settle()
      assert.equal(await result().innerText(), 'Inspected row R0002.')
      const after = await read()
      assert.deepEqual(after.sample, before.sample)
      assert.deepEqual(after.drafts, {})
      assert.equal(after.counts.requests, 0)
      assert.equal(
        await inspect('R0002').evaluate(
          (node) => node === document.activeElement,
        ),
        true,
      )
    },
  )
  await record(
    'row action: Enter and Space activate the focused row button',
    async () => {
      await start()
      await inspect('R0003').focus()
      await page.keyboard.press('Enter')
      await settle()
      assert.equal(await result().innerText(), 'Inspected row R0003.')
      await inspect('R0004').focus()
      await page.keyboard.press('Space')
      await settle()
      assert.equal(await result().innerText(), 'Inspected row R0004.')
      assert.equal(
        await inspect('R0004').evaluate(
          (node) => node === document.activeElement,
        ),
        true,
      )
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'row action: sorting and filtering preserve the callback row ID',
    async () => {
      await start()
      await call('sorting', [{ id: 'name', desc: true }])
      await call('filter', 'id', 'R0002')
      await settle()
      assert.deepEqual((await read()).ids, ['R0002'])
      await inspect('R0002').click()
      await settle()
      assert.equal(await result().innerText(), 'Inspected row R0002.')
      await call('filter', 'id', '')
      await call('remove', 'R0002')
      await settle()
      assert.equal(await inspect('R0002').count(), 0)
      await inspect('R0001').click()
      await settle()
      assert.equal(await result().innerText(), 'Inspected row R0001.')
    },
  )
  await record(
    'row action: inspection preserves an unsaved draft and is optional for child tables',
    async () => {
      await start(8, 'table')
      await edit().click()
      await input().fill('Unsaved inspection draft')
      await settle()
      const before = await read()
      await inspect('R0001').click()
      await settle()
      const after = await read()
      assert.equal(await result().innerText(), 'Inspected row R0001.')
      assert.equal(after.drafts.R0001.name, 'Unsaved inspection draft')
      assert.equal(after.drafts.R0001.note, before.drafts.R0001.note)
      assert.equal(after.drafts.R0001.priority, before.drafts.R0001.priority)
      assert.equal(after.drafts.R0001.revision, before.drafts.R0001.revision)
      assert.deepEqual(after.sample, before.sample)
      assert.equal(after.locked, true)
      assert.equal(after.counts.requests, 0)
      await call('cancelDraft', 'R0001')
      await call('childToggle', 'R0001')
      await page.waitForFunction(
        () => window.editingFixture.childStatus('R0001') === 'ready',
      )
      assert.equal(
        await page
          .locator('[data-subtable="R0001"]')
          .getByRole('button', { name: /^Inspect / })
          .count(),
        0,
      )
      await call('stop')
      assert.equal(
        await page.getByRole('button', { name: /^Inspect / }).count(),
        0,
      )
      assert.equal(await result().count(), 0)
    },
  )
}
