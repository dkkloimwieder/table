import assert from 'node:assert/strict'

export async function overlayCases({ page, url, record, press, settle }) {
  const open = () => page.goto(`${url}?overlays=1`)
  const read = () => page.evaluate(() => window.overlayFixture.read())
  const configure = async (value) => {
    await page.evaluate(
      (value) => window.overlayFixture.configure(value),
      value,
    )
    await settle()
  }
  const button = (name) => page.getByRole('button', { name, exact: true })
  const item = (name) => page.getByRole('menuitem', { name, exact: true })
  const popover = () => page.getByRole('dialog', { name: 'Display options' })
  const focused = () =>
    page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ||
        document.activeElement?.textContent,
    )
  const locks = () =>
    page.evaluate(() => [
      document.body.style.pointerEvents,
      document.body.style.overflow,
      document.documentElement.style.overflow,
    ])
  await record(
    'overlays: Popover custom parts, names, theme and Escape return focus',
    async () => {
      await page.goto(`${url}?overlays=1&dark=1`)
      await button('Open popover').click()
      await popover().waitFor()
      await settle()
      assert.equal(await popover().evaluate((node) => node.tagName), 'SECTION')
      const description = await popover().getAttribute('aria-describedby')
      assert.equal(
        await page.locator(`[id="${description}"]`).textContent(),
        'The application owns these values.',
      )
      assert.equal(
        await popover().evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        ),
        await page
          .locator('main')
          .evaluate((node) => getComputedStyle(node).backgroundColor),
      )
      assert.ok((await read()).refs >= 2)
      await press('Escape')
      await settle()
      assert.equal((await read()).popover, false)
      assert.equal(await focused(), 'Open popover')
    },
  )
  await record(
    'overlays: controlled rejection and prevented actions retain application state',
    async () => {
      await open()
      await configure({ accept: false })
      await button('Open popover').click()
      await button('Open menu').click()
      assert.equal((await read()).popover, false)
      assert.equal((await read()).menu, false)
      await configure({ accept: true, prevent: true })
      await button('Open popover').click()
      await button('Open menu').click()
      await button('Open menu').focus()
      await press('ArrowDown')
      assert.equal((await read()).popover, false)
      assert.equal((await read()).menu, false)
      await configure({ popover: true })
      await button('Close popover').click()
      await press('Escape')
      await button('Outside action').click()
      assert.equal((await read()).popover, true)
    },
  )
  await record(
    'overlays: nonmodal Popover outside focus stays on the chosen control',
    async () => {
      await open()
      await button('Open popover').click()
      await button('Outside action').click()
      await settle()
      assert.equal((await read()).popover, false)
      assert.equal(await focused(), 'Outside action')
    },
  )
  await record(
    'overlays: menu keyboard navigation skips disabled items and invokes application actions',
    async () => {
      await open()
      await button('Open menu').focus()
      await press('ArrowDown')
      await item('Run action').waitFor()
      await settle()
      assert.equal(await focused(), 'Run action')
      assert.equal(
        await page
          .getByRole('menu', { name: 'Open menu', exact: true })
          .evaluate((node) => node.tagName),
        'SECTION',
      )
      await press('ArrowDown')
      assert.equal(await focused(), 'Keep menu open')
      await press('Enter')
      await settle()
      assert.equal((await read()).actions, 1)
      assert.equal((await read()).menu, true)
      await press('Home')
      await press('Enter')
      await settle()
      assert.equal((await read()).actions, 2)
      assert.equal((await read()).menu, false)
      assert.equal(await focused(), 'Open menu')
    },
  )
  await record(
    'overlays: menu pointer selection and checked items preserve native roles',
    async () => {
      await open()
      await button('Open menu').click()
      await item('Run action').click()
      await settle()
      assert.equal((await read()).actions, 1)
      assert.equal((await read()).menu, false)
      await button('Open menu').click()
      await page.getByRole('menuitemcheckbox', { name: 'Show totals' }).click()
      await settle()
      assert.equal((await read()).checked, true)
      await page.getByRole('menuitemradio', { name: 'Comfortable' }).click()
      await settle()
      assert.equal((await read()).radio, 'comfortable')
      await configure({ prevent: true })
      await item('Keep menu open').click()
      await item('Keep menu open').focus()
      await press('Enter')
      assert.equal((await read()).actions, 1)
      await press('Escape')
      assert.equal((await read()).menu, true)
    },
  )
  await record(
    'overlays: submenu arrows and Escape close only the current menu',
    async () => {
      await open()
      await button('Open menu').focus()
      await press('ArrowDown')
      await item('More actions').focus()
      await press('ArrowRight')
      await item('Nested action').waitFor()
      await settle()
      await press('ArrowLeft')
      await settle()
      assert.equal(await item('Nested action').count(), 0)
      assert.equal(await focused(), 'More actions')
      await press('ArrowRight')
      await settle()
      await press('Escape')
      await settle()
      assert.equal(await item('Nested action').count(), 0)
      assert.equal((await read()).menu, true)
      await press('Escape')
      await settle()
      assert.equal((await read()).menu, false)
    },
  )
  await record(
    'overlays: popups inside modal Dialog preserve parent focus and dismissal',
    async () => {
      await open()
      await button('Open parent').click()
      await button('Nested popover').click()
      await page.getByRole('dialog', { name: 'Child options' }).waitFor()
      await settle()
      await page.getByRole('textbox', { name: 'Child value' }).fill('Changed')
      await press('Escape')
      await settle()
      assert.equal((await read()).dialog, true)
      assert.equal(await focused(), 'Nested popover')
      await button('Nested menu').click()
      await item('Child action').waitFor()
      await settle()
      await press('Escape')
      await settle()
      assert.equal((await read()).dialog, true)
      assert.equal(await focused(), 'Nested menu')
      await press('Escape')
      await settle()
      assert.equal((await read()).dialog, false)
    },
  )
  await record(
    'overlays: positioning fits the viewport and follows moved anchors',
    async () => {
      await open()
      await page.setViewportSize({ width: 390, height: 600 })
      await button('Open popover').evaluate((node) => {
        node.style.position = 'fixed'
        node.style.bottom = '0'
        node.style.right = '0'
      })
      await button('Open popover').click()
      await settle()
      const before = await popover().boundingBox()
      assert.ok(before.x >= -0.5 && before.y >= -0.5)
      assert.ok(
        before.x + before.width <= 390.5 && before.y + before.height <= 600.5,
      )
      await button('Open popover').evaluate((node) => {
        node.style.right = '220px'
      })
      await settle()
      const after = await popover().boundingBox()
      assert.ok(Math.abs(after.x - before.x) > 20)
      await page.setViewportSize({ width: 1280, height: 900 })
    },
  )
  await record(
    'overlays: force-mounted closed popups release locks and preserve content',
    async () => {
      await open()
      const before = await locks()
      await configure({ forceMount: true, modal: true })
      assert.deepEqual(await locks(), before)
      await button('Open popover').click()
      await page
        .getByRole('textbox', { name: 'Display name' })
        .fill('Keep draft')
      await button('Close popover').click()
      await settle()
      assert.deepEqual(await locks(), before)
      await button('Open menu').click()
      await press('Escape')
      await settle()
      assert.equal((await read()).menu, false)
      assert.deepEqual(await locks(), before)
      await button('Open popover').click()
      assert.equal(
        await page.getByRole('textbox', { name: 'Display name' }).inputValue(),
        'Keep draft',
      )
    },
  )
  await record(
    'overlays: Tooltip supports focus, hover, Escape and focus-only mode',
    async () => {
      await open()
      await button('Help').focus()
      await page
        .getByRole('tooltip', { name: 'Help for this control' })
        .waitFor()
      assert.ok(await button('Help').getAttribute('aria-describedby'))
      await press('Escape')
      await settle()
      assert.equal(await page.getByRole('tooltip').count(), 0)
      await button('Outside action').focus()
      await button('Help').hover()
      await page.getByRole('tooltip').waitFor()
      await button('Outside action').hover()
      await settle()
      assert.equal(await page.getByRole('tooltip').count(), 0)
      await button('Keyboard help').hover()
      await settle()
      assert.equal(await page.getByRole('tooltip').count(), 0)
      await button('Keyboard help').focus()
      await page.getByRole('tooltip', { name: 'Keyboard content' }).waitFor()
    },
  )
  await record(
    'overlays: disabled triggers reject opens and disposal cancels delayed Tooltip work',
    async () => {
      await open()
      await configure({ disabled: true })
      assert.equal(await button('Open menu').isDisabled(), true)
      await button('Help').focus()
      await settle()
      assert.equal(await page.getByRole('tooltip').count(), 0)
      await button('Delayed help').hover()
      await page.evaluate(() => window.overlayFixture.stop())
      await page.waitForTimeout(650)
      assert.equal(
        await page
          .locator('[data-popper-positioner], .ui-dialog-portal')
          .count(),
        0,
      )
      assert.equal((await read()).cleanups, 1)
    },
  )
  await record(
    'overlays: disposal releases open modal locks and dismissal listeners',
    async () => {
      await open()
      const before = await locks()
      await configure({ modal: true, menu: true })
      await settle()
      await page.evaluate(() => window.overlayFixture.stop())
      await settle()
      assert.deepEqual(await locks(), before)
      assert.equal(await page.locator('[data-popper-positioner]').count(), 0)
      const requests = (await read()).requests
      await press('Escape')
      assert.equal((await read()).requests, requests)
    },
  )
}
