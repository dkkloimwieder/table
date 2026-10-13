import assert from 'node:assert/strict'
export async function displayCases({ createPage, url, record }) {
  const page = await createPage()
  const settle = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
  const press = async (key) => {
    await page.keyboard.press(key)
    await settle()
  }
  try {
    const open = () => page.goto(`${url}?display=1`)
    const configure = async (value) => {
      await page.evaluate(
        (value) => window.displayFixture.configure(value),
        value,
      )
      await settle()
    }
    const read = () => page.evaluate(() => window.displayFixture.read())
    const button = (name) => page.getByRole('button', { name, exact: true })
    const toast = () => page.locator('.ui-toast')
    await record(
      'display: native progress exposes bounded values and indeterminate state',
      async () => {
        await open()
        const progress = page.getByRole('progressbar', {
          name: 'Export progress',
        })
        assert.deepEqual(
          await progress.evaluate((node) => [
            node.value,
            node.max,
            node.position,
          ]),
          [25, 100, 0.25],
        )
        await configure({ value: 200, maximum: 50 })
        assert.deepEqual(
          await progress.evaluate((node) => [node.value, node.max]),
          [50, 50],
        )
        await configure({ value: -10, maximum: -1 })
        assert.deepEqual(
          await progress.evaluate((node) => [node.value, node.max]),
          [0, 100],
        )
        await configure({ value: undefined })
        assert.equal(await progress.evaluate((node) => node.position), -1)
        assert.equal(await progress.getAttribute('value'), null)
      },
    )
    await record(
      'display: announcements are explicit and decorative loading remains silent',
      async () => {
        await open()
        assert.equal(await page.getByRole('status').count(), 0)
        assert.equal(await page.getByRole('alert').count(), 0)
        assert.equal(
          await page
            .locator('.ui-skeleton')
            .first()
            .getAttribute('aria-hidden'),
          'true',
        )
        assert.equal(
          await page.locator('.ui-spinner').first().getAttribute('aria-hidden'),
          'true',
        )
        assert.equal(await page.getByRole('separator').count(), 2)
        await configure({ announce: 'polite', message: 'Waiting' })
        assert.equal(await page.getByRole('status').count(), 1)
        await configure({ announce: 'assertive', message: 'Failed' })
        assert.equal(await page.getByRole('status').count(), 0)
        assert.equal(await page.getByRole('alert').count(), 1)
      },
    )
    await record(
      'display: loading and empty state preserve the reserved viewport and theme',
      async () => {
        await page.goto(`${url}?display=1&dark=1`)
        const bounds = await page.locator('#reserved-viewport').boundingBox()
        const background = (selector) =>
          page
            .locator(selector)
            .evaluate((node) => getComputedStyle(node).backgroundColor)
        assert.equal(
          await background('#display-card'),
          await background('main'),
        )
        await configure({ loading: false })
        assert.deepEqual(
          await page.locator('#reserved-viewport').boundingBox(),
          bounds,
        )
        assert.equal(
          await page.locator('.ui-empty-state').textContent(),
          'No results',
        )
        await configure({ loading: true })
        assert.deepEqual(
          await page.locator('#reserved-viewport').boundingBox(),
          bounds,
        )
        assert.ok((await read()).refs >= 1)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert.equal(
          await page
            .locator('.ui-spinner')
            .first()
            .evaluate((node) => getComputedStyle(node).animationName),
          'none',
        )
        await page.emulateMedia({ reducedMotion: 'no-preference' })
      },
    )
    await record(
      'display: Toast opens without stealing focus and actions remain application-owned',
      async () => {
        await open()
        await button('Show notification').click()
        await toast().waitFor()
        await settle()
        assert.equal(
          await button('Show notification').evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
        assert.equal(await page.getByRole('status').count(), 1)
        assert.equal(await toast().getAttribute('aria-live'), 'polite')
        await button('Review result').click()
        assert.equal((await read()).actions, 1)
        assert.equal((await read()).open, true)
        await button('Dismiss notification').click()
        await settle()
        assert.equal((await read()).open, false)
        assert.equal(
          await button('Show notification').evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
        await button('Show notification').click()
        await button('Dismiss notification').focus()
        await press('Escape')
        assert.equal((await read()).open, false)
      },
    )
    await record(
      'display: controlled rejection and prevented Toast dismissal preserve focus and state',
      async () => {
        await open()
        await configure({ accept: false, open: true })
        await button('Dismiss notification').click()
        await settle()
        assert.equal((await read()).open, true)
        assert.equal(
          await button('Dismiss notification').evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
        await configure({ prevent: true, accept: true })
        await button('Dismiss notification').click()
        await press('Escape')
        assert.equal((await read()).open, true)
        await configure({ prevent: false })
        await press('Escape')
        assert.equal((await read()).open, false)
      },
    )
    await record(
      'display: Toast timeout pauses on hover and focus and preserves remaining duration',
      async () => {
        await open()
        await page.clock.install()
        await configure({ persistent: false })
        await button('Show notification').click()
        await page.clock.runFor(300)
        await toast().hover()
        await page.clock.runFor(1500)
        assert.equal((await read()).open, true)
        await button('Dismiss notification').focus()
        await button('Outside action').hover()
        await page.clock.runFor(1500)
        assert.equal((await read()).open, true)
        await button('Outside action').focus()
        await page.clock.runFor(200)
        assert.equal((await read()).open, true)
        await page.clock.runFor(1000)
        await settle()
        assert.equal((await read()).open, false)
        assert.equal(
          await button('Outside action').evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
      },
    )
    await record(
      'display: Toast persistent mode, zero duration and rejected timeout do not repeat dismissal',
      async () => {
        await open()
        await page.clock.install()
        await button('Show notification').click()
        await page.clock.runFor(2000)
        assert.equal((await read()).open, true)
        await configure({ persistent: false, duration: 0 })
        await page.clock.runFor(2000)
        assert.equal((await read()).open, true)
        await configure({ duration: 100, accept: false })
        const requests = (await read()).requests
        await page.clock.runFor(2000)
        assert.equal((await read()).requests, requests + 1)
        await page.clock.runFor(2000)
        assert.equal((await read()).requests, requests + 1)
      },
    )
    await record(
      'display: uncontrolled Toast dismissal and page-idle timers remain local',
      async () => {
        await page.goto(`${url}?display=1&defaultToast=1`)
        await toast().waitFor()
        await button('Dismiss notification').click()
        await settle()
        assert.equal(await toast().count(), 0)
        await open()
        await page.clock.install()
        await configure({ open: true, persistent: false })
        await page.clock.runFor(200)
        await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        await page.clock.runFor(2000)
        assert.equal((await read()).open, true)
        await page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await page.clock.runFor(1000)
        await settle()
        assert.equal((await read()).open, false)
      },
    )
    await record(
      'display: application removal restores focus and cancels the notification timer',
      async () => {
        await open()
        await page.clock.install()
        await configure({ persistent: false })
        await button('Show notification').click()
        await button('Dismiss notification').focus()
        await configure({ mounted: false })
        assert.equal(await toast().count(), 0)
        assert.equal(
          await button('Show notification').evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
        const requests = (await read()).requests
        await page.clock.runFor(2000)
        assert.equal((await read()).requests, requests)
      },
    )
    await record(
      'display: disposal cancels Toast timers and document listeners',
      async () => {
        await open()
        await page.clock.install()
        await configure({ open: true, persistent: false })
        await page.evaluate(() => window.displayFixture.stop())
        const requests = (await read()).requests
        await page.clock.runFor(2000)
        await page.evaluate(() => {
          window.dispatchEvent(new Event('blur'))
          window.dispatchEvent(new Event('focus'))
          document.dispatchEvent(new Event('visibilitychange'))
        })
        await press('Escape')
        assert.equal((await read()).requests, requests)
        assert.equal((await read()).cleanups, 1)
        assert.equal(await toast().count(), 0)
      },
    )
  } finally {
    await page.close()
  }
}
