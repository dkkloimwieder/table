import assert from 'node:assert/strict'

export async function dialogCases({ page, url, record, press, settle }) {
  const open = () => page.goto(`${url}?dialogs=1`)
  const configure = async (value) => {
    await page.evaluate((value) => window.dialogFixture.configure(value), value)
    await settle()
  }
  const read = () => page.evaluate(() => window.dialogFixture.read())
  const main = () =>
    page.getByRole('dialog', { name: 'Edit details', exact: true })
  const trigger = () =>
    page.getByRole('button', { name: 'Open dialog', exact: true })
  const focused = () =>
    page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ||
        document.activeElement?.textContent,
    )
  const styles = () =>
    page.evaluate(() => ({
      pointer: document.body.style.pointerEvents,
      bodyOverflow: document.body.style.overflow,
      rootOverflow: document.documentElement.style.overflow,
    }))
  await record(
    'dialogs: custom elements, names, focus trapping and Escape preserve the page layout',
    async () => {
      await open()
      const bounds = await page.locator('#reserved').boundingBox()
      await trigger().click()
      await main().waitFor()
      await settle()
      assert.equal(await main().evaluate((node) => node.tagName), 'SECTION')
      assert.equal(await main().getAttribute('aria-modal'), 'true')
      const title = await main().getAttribute('aria-labelledby')
      const description = await main().getAttribute('aria-describedby')
      assert.equal(
        await page.locator(`[id="${title}"]`).textContent(),
        'Edit details',
      )
      assert.equal(
        await page.locator(`[id="${description}"]`).textContent(),
        'The application owns these values.',
      )
      assert.equal(await focused(), 'Dialog name')
      assert.deepEqual(await page.locator('#reserved').boundingBox(), bounds)
      await page
        .getByRole('button', { name: 'Close details', exact: true })
        .focus()
      await press('Tab')
      assert.equal(await focused(), 'Dialog name')
      await press('Shift+Tab')
      assert.equal(await focused(), 'Close details')
      await press('Escape')
      assert.equal((await read()).open, false)
      assert.equal(await focused(), 'Open dialog')
      assert.ok((await read()).refs >= 2)
    },
  )
  await record(
    'dialogs: default-open dialogs inherit the owning theme and uncontrolled closure',
    async () => {
      await page.goto(`${url}?dialogs=1&defaultDialog=1&dark=1`)
      await main().waitFor()
      await settle()
      const colors = await page.evaluate(() =>
        [
          document.querySelector('main'),
          document.querySelector('[data-content=main]'),
        ].map((node) => getComputedStyle(node).backgroundColor),
      )
      assert.equal(colors[1], colors[0])
      assert.equal(
        await page
          .locator('.ui-dialog-portal')
          .evaluate((node) => Boolean(node.closest('[data-ui-portal-root]'))),
        true,
      )
      await press('Escape')
      await settle()
      assert.equal(await main().count(), 0)
    },
  )
  await record(
    'dialogs: triggerless controlled dialogs return focus to the application opener',
    async () => {
      await page.goto(`${url}?dialogs=1&triggerless=1`)
      await page
        .getByRole('button', { name: 'Outside action', exact: true })
        .click()
      await main().waitFor()
      await settle()
      assert.equal(await focused(), 'Dialog name')
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await settle()
      assert.equal(await focused(), 'Outside action')
    },
  )
  await record(
    'dialogs: controlled rejection and prevented dismissal keep content open',
    async () => {
      await open()
      await configure({ accept: false })
      await trigger().click()
      assert.equal((await read()).open, false)
      await configure({
        open: true,
        preventEscape: true,
        preventOutside: true,
        preventClose: true,
      })
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await press('Escape')
      await page
        .locator('[data-overlay=main]')
        .click({ position: { x: 3, y: 3 } })
      assert.equal((await read()).open, true)
      await configure({
        accept: true,
        preventEscape: false,
        preventOutside: false,
        preventClose: false,
      })
      await page
        .locator('[data-overlay=main]')
        .click({ position: { x: 3, y: 3 } })
      await settle()
      assert.equal((await read()).open, false)
    },
  )
  await record(
    'dialogs: nonmodal outside focus and caller focus restoration retain the chosen target',
    async () => {
      await open()
      await configure({ modal: false })
      await trigger().click()
      await settle()
      await page.locator('#outside-button').click()
      await settle()
      assert.equal((await read()).open, false)
      assert.equal(await focused(), 'Outside action')
      await configure({ modal: true, redirect: true })
      await trigger().click()
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await settle()
      assert.equal(await focused(), 'Outside action')
    },
  )
  await record(
    'dialogs: nested modal focus and Escape dismiss only the top layer',
    async () => {
      await open()
      await trigger().click()
      await page
        .getByRole('button', { name: 'Open child', exact: true })
        .click()
      await page
        .getByRole('dialog', { name: 'Child details', exact: true })
        .waitFor()
      await settle()
      assert.equal(await focused(), 'Child name')
      await press('Escape')
      await settle()
      assert.equal((await read()).child, false)
      assert.equal((await read()).open, true)
      assert.equal(await focused(), 'Open child')
      await press('Escape')
      await settle()
      assert.equal((await read()).open, false)
    },
  )
  await record(
    'dialogs: AlertDialog focuses cancellation and requires an explicit application action',
    async () => {
      await open()
      await page
        .getByRole('button', { name: 'Open confirmation', exact: true })
        .click()
      await page
        .getByRole('alertdialog', { name: 'Apply changes?', exact: true })
        .waitFor()
      await settle()
      assert.equal(await focused(), 'Keep current')
      await page
        .locator('[data-overlay=alert]')
        .click({ position: { x: 3, y: 3 } })
      assert.equal((await read()).alert, true)
      assert.equal((await read()).confirmed, 0)
      await page.getByRole('button', { name: 'Apply', exact: true }).click()
      assert.equal((await read()).confirmed, 1)
      assert.equal((await read()).alert, true)
      await page
        .getByRole('button', { name: 'Keep current', exact: true })
        .click()
      await settle()
      assert.equal((await read()).alert, false)
      assert.equal(await focused(), 'Open confirmation')
    },
  )
  await record(
    'dialogs: Sheet shares Dialog behavior and all four edges fit a narrow viewport',
    async () => {
      await open()
      await page.setViewportSize({ width: 390, height: 800 })
      await page
        .getByRole('button', { name: 'Open sheet', exact: true })
        .click()
      for (const side of ['left', 'right', 'top', 'bottom']) {
        await configure({ side })
        const sheet = page.getByRole('dialog', {
          name: 'Display details',
          exact: true,
        })
        const bounds = await sheet.boundingBox()
        assert.ok(bounds.x >= -0.5 && bounds.y >= -0.5)
        assert.ok(
          bounds.x + bounds.width <= 390.5 && bounds.y + bounds.height <= 800.5,
        )
        if (side === 'right')
          assert.ok(Math.abs(bounds.x + bounds.width - 390) < 0.5)
        if (side === 'left') assert.ok(Math.abs(bounds.x) < 0.5)
        if (side === 'top') assert.ok(Math.abs(bounds.y) < 0.5)
        if (side === 'bottom')
          assert.ok(Math.abs(bounds.y + bounds.height - 800) < 0.5)
      }
      await press('Escape')
      await settle()
      assert.equal((await read()).sheet, false)
      assert.equal(await focused(), 'Open sheet')
      await page.setViewportSize({ width: 1280, height: 900 })
    },
  )
  await record(
    'dialogs: force-mounted closed content preserves DOM without document locks or Escape ownership',
    async () => {
      await open()
      const before = await styles()
      await configure({ forceMount: true })
      assert.deepEqual(await styles(), before)
      assert.equal(await main().count(), 0)
      await trigger().click()
      await settle()
      await page.evaluate(() => {
        window.mountedDialog = document.querySelector('[data-content=main]')
      })
      await page
        .getByRole('textbox', { name: 'Dialog name', exact: true })
        .fill('Keep draft')
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await settle()
      assert.deepEqual(await styles(), before)
      assert.equal(
        await page.evaluate(
          () =>
            window.mountedDialog ===
            document.querySelector('[data-content=main]'),
        ),
        true,
      )
      await page
        .getByRole('button', { name: 'Open confirmation', exact: true })
        .click()
      await press('Escape')
      await settle()
      assert.equal((await read()).alert, false)
      await trigger().click()
      await settle()
      assert.equal(
        await page
          .getByRole('textbox', { name: 'Dialog name', exact: true })
          .inputValue(),
        'Keep draft',
      )
    },
  )
  await record(
    'dialogs: content scrolls while the page locks and disposal restores document state',
    async () => {
      await open()
      const before = await styles()
      await configure({ long: true, open: true })
      assert.equal(
        await page.evaluate(() =>
          [document.body, document.documentElement].some(
            (node) => getComputedStyle(node).overflowY === 'hidden',
          ),
        ),
        true,
      )
      await main().evaluate((node) => {
        node.scrollTop = 300
      })
      assert.ok(await main().evaluate((node) => node.scrollTop > 0))
      await page.evaluate(() => window.dialogFixture.stop())
      await settle()
      assert.equal(await page.locator('.ui-dialog-portal').count(), 0)
      assert.deepEqual(await styles(), before)
      assert.equal((await read()).cleanups, 1)
      const requests = (await read()).requests
      await press('Escape')
      assert.equal((await read()).requests, requests)
    },
  )
}
