import assert from 'node:assert/strict'

export async function headerFilterCases({
  page,
  start,
  call,
  read,
  record,
  settle,
  edit,
  input,
}) {
  const trigger = (id = 'name') => page.locator(`[data-header-filter="${id}"]`)
  const popup = (id = 'name') =>
    page.locator(`[data-header-filter-popup="${id}"]`)
  const text = () =>
    popup().getByRole('textbox', { name: 'Filter saved names', exact: true })
  const focused = (node) =>
    node.evaluate((node) => node === document.activeElement)
  async function headers() {
    await start(8, 'table')
    await call('controls', { filters: 'headers' })
  }
  async function open(id = 'name') {
    await trigger(id).click()
    await settle()
    assert.equal(await popup(id).isVisible(), true)
  }
  await record(
    'header filter: popup edits retain values and show only an active indicator when closed',
    async () => {
      await headers()
      assert.equal(
        await page.locator('thead input:visible, thead select:visible').count(),
        0,
      )
      await open()
      assert.equal(await focused(text()), true)
      await text().fill('0001')
      await settle()
      assert.deepEqual((await read()).ids, ['R0001'])
      assert.equal(await trigger().getAttribute('data-filtered'), 'true')
      await popup()
        .getByRole('button', { name: 'Close Name filter', exact: true })
        .click()
      assert.equal(await popup().isVisible(), false)
      assert.equal(await focused(trigger()), true)
      assert.doesNotMatch(await page.locator('thead').innerText(), /0001/)
      await open()
      assert.equal(await text().inputValue(), '0001')
      await popup()
        .getByRole('button', { name: 'Clear Name filter', exact: true })
        .click()
      await settle()
      assert.equal(await trigger().getAttribute('data-filtered'), null)
      assert.equal((await read()).ids.length, 8)
      assert.deepEqual((await read()).sorting, [])
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'header filter: keyboard opening and dismissal preserve the filter and logical focus',
    async () => {
      await headers()
      await trigger().focus()
      await page.keyboard.press('Enter')
      assert.equal(await focused(text()), true)
      await text().fill('0002')
      await text().press('Escape')
      await settle()
      assert.equal(await popup().isVisible(), false)
      assert.equal(await focused(trigger()), true)
      assert.deepEqual((await read()).ids, ['R0002'])
      await trigger().press('Enter')
      assert.equal(await text().inputValue(), '0002')
      await text().fill('0003')
      await text().press('Enter')
      await settle()
      assert.equal(await popup().isVisible(), false)
      assert.equal(await focused(trigger()), true)
      assert.deepEqual((await read()).ids, ['R0003'])
      await trigger().press('Enter')
      await text().press('Tab')
      await page.keyboard.press('Tab')
      await settle()
      assert.equal(await popup().isVisible(), false)
      assert.equal(
        await page.evaluate(() => document.activeElement === document.body),
        false,
      )
      assert.equal((await read()).counts.requests, 0)
    },
  )
  await record(
    'header filter: external and popup controls share values across changes in placement',
    async () => {
      await headers()
      await call('controls', { filters: 'both' })
      const external = page.getByRole('region', {
        name: 'Column filters',
        exact: true,
      })
      const name = external.getByRole('textbox', {
        name: 'Filter saved names',
        exact: true,
      })
      await name.fill('0001')
      await open()
      assert.equal(await text().inputValue(), '0001')
      await text().fill('0002')
      await settle()
      assert.equal(await name.inputValue(), '0002')
      await text().press('Escape')
      await external
        .getByRole('button', { name: 'Clear Name filter', exact: true })
        .click()
      await settle()
      assert.equal(await trigger().getAttribute('data-filtered'), null)
      await call('filter', 'name', '0003')
      await open()
      assert.equal(await text().inputValue(), '0003')
      await call('controls', { filters: 'none' })
      assert.equal(await popup().count(), 0)
      assert.deepEqual((await read()).ids, ['R0003'])
      await call('controls', { filters: 'headers' })
      await open()
      assert.equal(await text().inputValue(), '0003')
    },
  )
  await record(
    'header filter: priority choices remain editable and clearing removes their active indicator',
    async () => {
      await headers()
      await open('priority')
      const select = popup('priority').getByRole('combobox', {
        name: 'Filter priority',
        exact: true,
      })
      assert.equal(await focused(select), true)
      await select.selectOption('high')
      await select.press('Escape')
      await settle()
      assert.equal(await popup('priority').isVisible(), false)
      assert.equal(
        await trigger('priority').getAttribute('data-filtered'),
        'true',
      )
      assert.deepEqual((await read()).ids, [])
      await open('priority')
      assert.equal(await select.inputValue(), 'high')
      await popup('priority')
        .getByRole('button', { name: 'Clear Priority filter', exact: true })
        .press('Enter')
      await settle()
      assert.equal(
        await trigger('priority').getAttribute('data-filtered'),
        null,
      )
      assert.equal((await read()).ids.length, 8)
    },
  )
  await record(
    'header filter: opening another column closes the first popup without removing its filter',
    async () => {
      await headers()
      await open()
      await text().fill('0001')
      await open('priority')
      assert.equal(await popup().isVisible(), false)
      assert.equal(
        await page.locator('.header-filter-popup:popover-open').count(),
        1,
      )
      assert.equal(await trigger().getAttribute('data-filtered'), 'true')
      assert.deepEqual((await read()).ids, ['R0001'])
      await popup('priority')
        .getByRole('combobox', { name: 'Filter priority', exact: true })
        .press('Escape')
      await open()
      assert.equal(await text().inputValue(), '0001')
    },
  )
  await record(
    'header filter: outside clicks preserve destination focus and editing locks block popup changes',
    async () => {
      await headers()
      await open()
      await text().fill('Record')
      await edit().click()
      await settle()
      assert.equal(await popup().isVisible(), false)
      assert.equal(await focused(input()), true)
      assert.equal(await trigger().isDisabled(), true)
      assert.deepEqual((await read()).filters, [
        { id: 'name', value: 'Record' },
      ])
      await page
        .getByRole('button', { name: 'Cancel R0001', exact: true })
        .click()
      await open()
      const search = page.getByRole('searchbox', {
        name: 'Search all columns',
        exact: true,
      })
      await search.click()
      await settle()
      assert.equal(await popup().isVisible(), false)
      assert.equal(await focused(search), true)
    },
  )
  await record(
    'header filter: popups fit narrow viewports and follow scrolling without page overflow',
    async () => {
      await headers()
      try {
        await page.setViewportSize({ width: 390, height: 844 })
        await trigger('dueDate').scrollIntoViewIfNeeded()
        await open('dueDate')
        await page.evaluate(() => window.scrollBy(0, 16))
        await settle()
        const box = await popup('dueDate').boundingBox()
        assert.ok(box.x >= 0 && box.x + box.width <= 390)
        assert.ok(box.y >= 0 && box.y + box.height <= 844)
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        )
        await page.keyboard.press('Escape')
        assert.equal(await focused(trigger('dueDate')), true)
      } finally {
        await page.setViewportSize({ width: 1280, height: 900 })
      }
    },
  )
  await record(
    'header filter: hiding a column and disposing the table remove open popups',
    async () => {
      await headers()
      await open()
      await call('visibility', 'name', false)
      await settle()
      assert.equal(await popup().count(), 0)
      assert.equal(
        await page.locator('.header-filter-popup:popover-open').count(),
        0,
      )
      await call('visibility', 'name', true)
      await open()
      await call('stop')
      await settle()
      assert.equal(await page.locator('.header-filter-popup').count(), 0)
      await start()
      assert.equal(
        await page.locator('.header-filter-popup:popover-open').count(),
        0,
      )
    },
  )
}
