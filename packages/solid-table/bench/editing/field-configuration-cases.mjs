import assert from 'node:assert/strict'

export async function fieldConfigurationCases({
  page,
  call,
  read,
  record,
  settle,
  idle,
  popup = false,
}) {
  async function start() {
    await call('start', 8, 'row', 'workflow')
    await page.waitForFunction(() => window.editingFixture.ready())
    await settle()
  }
  const root = () => page.locator('[data-table-scope="root"]')
  const edit = (field, within = root()) =>
    within.getByRole('button', { name: `Edit ${field} R0001`, exact: true })
  const editor = (within = root()) =>
    within.locator('[data-editor="R0001/priority"]')
  async function choose(value, label, within = root()) {
    if (popup) {
      await editor(within).click()
      await page
        .getByRole('listbox')
        .getByRole('option', { name: label, exact: true })
        .click()
    } else await editor(within).selectOption(value)
    await settle()
  }
  await record(
    'field configuration: application labels and choices edit, save, and filter custom values',
    async () => {
      await start()
      await edit('work item').click()
      await root()
        .getByRole('textbox', { name: 'Work item R0001', exact: true })
        .fill('Configured task')
      assert.equal(
        await root()
          .getByRole('textbox', { name: 'Description R0001', exact: true })
          .count(),
        1,
      )
      assert.equal(await editor().getAttribute('aria-label'), 'Workflow R0001')
      if (popup) {
        await editor().click()
        const options = page.getByRole('listbox').getByRole('option')
        assert.equal(await options.count(), 4)
        for (const label of ['Queued', 'Active', 'Done', 'Blocked']) {
          assert.equal(
            await page
              .getByRole('listbox')
              .getByRole('option', { name: label, exact: true })
              .count(),
            1,
          )
        }
        assert.equal(await options.last().getAttribute('aria-disabled'), 'true')
        await page.keyboard.press('Escape')
      } else {
        assert.deepEqual(await editor().locator('option').allTextContents(), [
          'Choose workflow',
          'Queued',
          'Active',
          'Done',
          'Blocked',
        ])
        assert.equal(
          await editor().locator('option[value="blocked"]').isDisabled(),
          true,
        )
      }
      await choose('done', 'Done')
      await root()
        .getByRole('button', { name: 'Save R0001', exact: true })
        .click()
      await idle()
      const value = await read()
      assert.equal(value.sample[0].name, 'Configured task')
      assert.equal(value.sample[0].priority, 'done')
      assert.equal(value.counts.requests, 1)
      await call('controls', { filters: 'external' })
      const filter = root().getByRole('combobox', {
        name: 'Filter workflow',
        exact: true,
      })
      assert.deepEqual(await filter.locator('option').allTextContents(), [
        'All',
        'Queued',
        'Active',
        'Done',
        'Blocked',
      ])
      assert.equal(
        await filter.locator('option[value="blocked"]').isDisabled(),
        true,
      )
      await filter.selectOption('done')
      await settle()
      assert.deepEqual((await read()).ids, ['R0001'])
      await call('controls', { filters: 'headers' })
      await root().locator('[data-header-filter="priority"]').click()
      assert.equal(
        await root()
          .getByRole('combobox', { name: 'Filter workflow', exact: true })
          .inputValue(),
        'done',
      )
    },
  )
  await record(
    'field configuration: default and disabled values fail application validation without a request',
    async () => {
      await start()
      for (const invalid of ['normal', 'blocked']) {
        await call('patch', 'R0001', { priority: invalid })
        await edit('workflow').click()
        await root()
          .getByRole('button', { name: 'Save R0001', exact: true })
          .click()
        await settle()
        const value = await read()
        assert.equal(value.drafts.R0001.status, 'invalid')
        assert.equal(
          value.drafts.R0001.fieldErrors.priority,
          'Choose Queued, Active, or Done.',
        )
        assert.equal(value.counts.requests, 0)
        assert.equal(value.sample[0].priority, invalid)
        await call('cancelDraft', 'R0001')
      }
      await edit('workflow').click()
      await choose('queued', 'Queued')
      await root()
        .getByRole('button', { name: 'Save R0001', exact: true })
        .click()
      await idle()
      assert.equal((await read()).sample[0].priority, 'queued')
      assert.equal((await read()).counts.requests, 1)
    },
  )
  await record(
    'field configuration: choice order sorts records and child tables inherit application fields',
    async () => {
      await start()
      await call('patch', 'R0002', { priority: 'queued' })
      await call('patch', 'R0003', { priority: 'done' })
      await call('sorting', [{ id: 'priority', desc: false }])
      assert.deepEqual((await read()).ids, [
        'R0002',
        'R0001',
        'R0004',
        'R0005',
        'R0006',
        'R0007',
        'R0008',
        'R0003',
      ])
      await call('childToggle', 'R0001')
      await page.waitForFunction(
        () => window.editingFixture.childStatus('R0001') === 'ready',
      )
      const child = page.locator('[data-subtable="R0001"]')
      await edit('workflow', child).click()
      await choose('done', 'Done', child)
      await child.getByRole('button', { name: 'Save all', exact: true }).click()
      await page.waitForFunction(
        () =>
          window.editingFixture.childRead('R0001').model.sample[0].priority ===
          'done',
      )
      assert.equal((await read()).sample[0].priority, 'active')
      await call('stop')
      assert.equal(await page.locator('[data-editor]').count(), 0)
      assert.equal(await page.getByRole('listbox').count(), 0)
    },
  )
}
