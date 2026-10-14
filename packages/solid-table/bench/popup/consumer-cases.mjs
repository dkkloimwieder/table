import assert from 'node:assert/strict'

export async function consumerCases({ page, url, record, press, settle }) {
  const open = (extra = '') => page.goto(`${url}?consumer=1&manual=1${extra}`)
  const read = () => page.evaluate(() => window.consumerFixture.read())
  const requests = () =>
    page.evaluate(() => window.consumerFixture.transport.read())
  const finish = async (id, response) => {
    await page.evaluate(
      ({ id, response }) =>
        window.consumerFixture.transport.finish(id, response),
      { id, response },
    )
    await settle()
  }
  const last = async (kind) =>
    (await requests()).history
      .filter((entry) => entry.request.kind === kind)
      .at(-1)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const input = () =>
    page.getByRole('combobox', { name: 'Find region', exact: true })
  const review = async () => {
    await button('Review record').click()
    await page.getByRole('alertdialog', { name: 'Save this record?' }).waitFor()
    await settle()
  }
  const saved = {
    id: 'created',
    name: 'New record',
    category: 'East',
    enabled: 'No',
  }

  await record(
    'consumer: joined search uses one clear button and keeps native search semantics',
    async () => {
      await open()
      const search = page.getByRole('searchbox', {
        name: 'Search all columns',
        exact: true,
      })
      await search.fill('Existing')
      assert.equal(await search.getAttribute('type'), 'search')
      const bounds = await search.boundingBox()
      await search.click({
        position: { x: bounds.width - 14, y: bounds.height / 2 },
      })
      assert.equal(await search.inputValue(), 'Existing')
      const clear = page.getByRole('button', {
        name: 'Clear search',
        exact: true,
      })
      assert.equal(await clear.count(), 1)
      await clear.focus()
      await press('Space')
      assert.equal(await search.inputValue(), '')
      assert.equal(
        await search.evaluate((node) => node === document.activeElement),
        true,
      )
      await search.fill('Existing')
      await press('Escape')
      assert.equal(await search.inputValue(), '')
    },
  )
  await record(
    'consumer: public controls share styles and accept application updates beside Table',
    async () => {
      await open()
      await page
        .getByRole('textbox', { name: 'Display name', exact: true })
        .fill('New record')
      await page.getByText('Include details', { exact: true }).click()
      await page.getByText('Enable updates', { exact: true }).click()
      assert.equal((await read()).name, 'New record')
      assert.equal((await read()).checked, true)
      assert.equal((await read()).enabled, false)
      await page.evaluate(() =>
        window.consumerFixture.configure({
          name: 'External name',
          checked: false,
          enabled: true,
        }),
      )
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Display name', exact: true })
          .inputValue(),
        'External name',
      )
      assert.equal(
        await page
          .getByRole('checkbox', { name: 'Include details', exact: true })
          .isChecked(),
        false,
      )
      assert.equal(
        await page
          .getByRole('switch', { name: 'Enable updates', exact: true })
          .isChecked(),
        true,
      )
      const fonts = await page
        .locator('input.ui-input')
        .evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).fontSize),
        )
      assert.ok(fonts.length >= 4)
      assert.equal(new Set(fonts).size, 1)
      assert.equal(
        await page.locator('[aria-label="Saved records"] tbody tr').count(),
        1,
      )
    },
  )

  await record(
    'consumer: remote search ignores cancelled responses and appends caller pages without duplicates',
    async () => {
      await open()
      await input().fill('n')
      const first = await last('choices')
      await input().fill('e')
      const second = await last('choices')
      assert.equal(
        (await requests()).history.find((entry) => entry.id === first.id)
          .aborted,
        true,
      )
      await finish(second.id, {
        options: [{ id: 'east', label: 'East' }],
        next: 1,
      })
      await finish(first.id, {
        options: [{ id: 'stale', label: 'Stale' }],
        next: null,
      })
      assert.deepEqual((await read()).options, ['east'])
      await button('More results').click()
      const pageRequest = await last('choices')
      assert.equal(pageRequest.request.page, 1)
      assert.equal(pageRequest.request.query, 'e')
      await finish(pageRequest.id, {
        options: [
          { id: 'east', label: 'East' },
          { id: 'north', label: 'North' },
        ],
        next: null,
      })
      assert.deepEqual((await read()).options, ['east', 'north'])
      await page.getByRole('option', { name: 'North', exact: true }).click()
      assert.equal((await read()).choice, 'north')
      assert.equal(await input().inputValue(), 'North')
      await review()
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        'Keep editing',
      )
      await button('Keep editing').click()
      await settle()
      assert.equal(
        (await requests()).history.some(
          (entry) => entry.request.kind === 'save',
        ),
        false,
      )
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        'Review record',
      )
    },
  )

  await record(
    'consumer: remote loading, empty results, errors and retry remain application state',
    async () => {
      await open()
      await input().fill('empty')
      assert.equal((await read()).loading, true)
      await page.getByText('Loading results', { exact: true }).waitFor()
      await finish((await last('choices')).id, { options: [], next: null })
      await page.getByText('No results', { exact: true }).waitFor()
      await input().fill('failure')
      await finish((await last('choices')).id, {
        error: 'Remote service unavailable.',
      })
      await page
        .getByText('Remote service unavailable.', { exact: true })
        .waitFor()
      await button('Retry search').click()
      assert.equal((await last('choices')).request.query, 'failure')
      await finish((await last('choices')).id, {
        options: [{ id: 'recovered', label: 'Recovered' }],
        next: null,
      })
      await page.getByRole('option', { name: 'Recovered', exact: true }).click()
      assert.equal((await read()).choice, 'recovered')
      assert.equal((await read()).loading, false)
    },
  )

  await record(
    'consumer: validation, confirmation, failed save and retry preserve form and canonical rows',
    async () => {
      await open()
      await page
        .getByRole('textbox', { name: 'Display name', exact: true })
        .fill('')
      await button('Review record').click()
      assert.equal(await page.getByRole('alertdialog').count(), 0)
      assert.equal((await requests()).history.length, 0)
      await page
        .getByText('Enter a name and choose a result.', { exact: true })
        .waitFor()
      await page
        .getByRole('textbox', { name: 'Display name', exact: true })
        .fill('New record')
      await review()
      await button('Save record').click()
      const failed = await last('save')
      assert.deepEqual(failed.request.values, {
        displayName: 'New record',
        regionId: 'west',
        includeDetails: false,
        enabled: true,
      })
      assert.equal(await button('Saving record').isDisabled(), true)
      assert.equal(await button('Keep editing').isDisabled(), true)
      await press('Escape')
      assert.equal((await read()).confirm, true)
      await finish(failed.id, { error: 'Server rejected this record.' })
      await page
        .getByText('Server rejected this record.', { exact: true })
        .waitFor()
      assert.equal((await read()).rows.length, 1)
      assert.equal((await read()).name, 'New record')
      await button('Save record').click()
      await finish((await last('save')).id, saved)
      assert.equal((await read()).confirm, false)
      assert.equal((await read()).rows.length, 2)
      assert.equal(
        await page.locator('[aria-label="Saved records"] tbody tr').count(),
        2,
      )
      assert.equal(
        await page.evaluate(() => document.activeElement?.textContent),
        'Review record',
      )
      await page
        .getByRole('textbox', { name: 'Filter Name', exact: true })
        .fill('Existing')
      assert.equal(
        await page.locator('[aria-label="Saved records"] tbody tr').count(),
        1,
      )
      assert.equal((await read()).rows.length, 2)
      assert.equal((await read()).name, 'New record')
    },
  )

  await record(
    'consumer: alternate field names and stacked layout submit through the same public controls',
    async () => {
      await open('&alternate=1')
      await page
        .getByRole('textbox', { name: 'Project title', exact: true })
        .fill('Project A')
      await page.getByText('Archive project', { exact: true }).click()
      await page.getByText('Notify members', { exact: true }).click()
      await review()
      await button('Save record').click()
      assert.deepEqual((await last('save')).request.values, {
        projectTitle: 'Project A',
        teamId: 'west',
        archived: true,
        notify: false,
      })
      await finish((await last('save')).id, { ...saved, name: 'Project A' })
      assert.equal(
        await page.locator('main').getAttribute('data-layout'),
        'stacked',
      )
      assert.equal(
        await page.getByRole('columnheader', { name: /Project/ }).count(),
        1,
      )
      assert.equal((await read()).rows.length, 2)
    },
  )

  await record(
    'consumer: disposal cancels requests, removes portals and ignores late server completion',
    async () => {
      await open()
      await input().fill('pending')
      const search = await last('choices')
      await press('Escape')
      await review()
      await button('Save record').click()
      const save = await last('save')
      await page.evaluate(() => window.consumerFixture.stop())
      await settle()
      assert.equal((await read()).cleanups, 1)
      assert.deepEqual((await requests()).pending, [])
      assert.ok((await requests()).history.every((entry) => entry.aborted))
      assert.equal(
        await page.locator('.ui-dialog-portal, .ui-combobox-portal').count(),
        0,
      )
      assert.equal(await page.locator('main').count(), 0)
      assert.equal(
        await page.evaluate(() => document.body.style.pointerEvents),
        '',
      )
      const before = await read()
      await finish(search.id, {
        options: [{ id: 'late', label: 'Late' }],
        next: null,
      })
      await finish(save.id, saved)
      await press('Escape')
      assert.deepEqual(await read(), before)
    },
  )

  await record(
    'consumer: interactive fake server supports browser review without test commands',
    async () => {
      await page.goto(`${url}?consumer=1`)
      await input().fill('e')
      await page.getByRole('option', { name: 'East', exact: true }).waitFor()
      await page.getByRole('option', { name: 'East', exact: true }).click()
      await review()
      await button('Save record').click()
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' })
      assert.equal((await read()).rows.length, 2)
      assert.equal((await read()).rows[1].category, 'east')
    },
  )
}
