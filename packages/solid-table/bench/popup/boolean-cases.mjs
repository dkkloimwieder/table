import assert from 'node:assert/strict'

export async function booleanCases({ page, url, record, press, settle }) {
  const open = () => page.goto(`${url}?booleans=1`)
  const checkbox = () =>
    page.getByRole('checkbox', { name: 'Include details', exact: true })
  const switched = () =>
    page.getByRole('switch', { name: 'Enable updates', exact: true })
  const radio = (name) => page.getByRole('radio', { name, exact: true })
  const read = () => page.evaluate(() => window.booleanFixture.read())
  const configure = async (value) => {
    await page.evaluate(
      (value) => window.booleanFixture.configure(value),
      value,
    )
    await settle()
  }
  const values = () =>
    page.evaluate(() =>
      Object.fromEntries(new FormData(document.querySelector('form'))),
    )
  await record(
    'booleans: checked and mixed SVG marks fill the box and preserve custom children',
    async () => {
      await open()
      for (const font of [12, 18]) {
        await page
          .locator('main')
          .evaluate(
            (node, font) =>
              node.style.setProperty('--ui-font-size', `${font}px`),
            font,
          )
        for (const indeterminate of [false, true]) {
          await configure({ checked: true, indeterminate })
          const mark = page.locator('[data-control=checkbox] .ui-check-mark')
          assert.equal(await mark.getAttribute('aria-hidden'), 'true')
          assert.equal(await mark.evaluate((node) => node.tabIndex), -1)
          const geometry = await mark.evaluate((svg) => {
            const path = svg.querySelector('path')
            const ink = path.getBBox()
            const bounds = svg.getBoundingClientRect()
            const control = svg
              .closest('.ui-check-control')
              .getBoundingClientRect()
            const stroke = parseFloat(getComputedStyle(svg).strokeWidth)
            return {
              width: bounds.width,
              height: bounds.height,
              controlWidth: control.width,
              controlHeight: control.height,
              inkWidth:
                ((ink.width + stroke) / svg.viewBox.baseVal.width) *
                bounds.width,
              inkX: ink.x,
              inkY: ink.y,
              inkRight: ink.x + ink.width,
              inkBottom: ink.y + ink.height,
              stroke,
            }
          })
          assert.equal(geometry.controlWidth, font + 4)
          assert.equal(geometry.controlHeight, font + 4)
          assert.equal(geometry.width, geometry.controlWidth - 2)
          assert.equal(geometry.height, geometry.controlHeight - 2)
          assert.ok(
            geometry.inkWidth >=
              geometry.controlWidth * (indeterminate ? 0.65 : 0.75),
          )
          assert.ok(
            geometry.inkX >= geometry.stroke / 2 &&
              geometry.inkY >= geometry.stroke / 2,
          )
          assert.ok(
            geometry.inkRight <= 16 - geometry.stroke / 2 &&
              geometry.inkBottom <= 16 - geometry.stroke / 2,
          )
        }
      }
      assert.equal(
        await page.locator('[data-custom-checkbox-mark]').textContent(),
        '★',
      )
      assert.equal(
        await page.locator('#uncontrolled .ui-check-mark').count(),
        0,
      )
    },
  )
  await record(
    'booleans: labels, controls, Space and native form values follow controlled state',
    async () => {
      await open()
      await page.getByText('Include details', { exact: true }).click()
      assert.equal(await checkbox().isChecked(), true)
      await checkbox().focus()
      await press('Space')
      assert.equal(await checkbox().isChecked(), false)
      await page.locator('[data-control=checkbox]').click()
      await page.locator('[data-control=switch]').click()
      assert.equal(await switched().isChecked(), true)
      assert.deepEqual(await values(), {
        choice: 'yes',
        enabled: 'yes',
        plan: 'a',
        default: 'on',
      })
      await page
        .getByRole('button', { name: 'Submit form', exact: true })
        .click()
      assert.equal((await read()).submits, 1)
    },
  )
  await record(
    'booleans: rejected changes and external values restore native checked state',
    async () => {
      await open()
      await configure({
        checked: true,
        switched: true,
        selected: 'b',
        accept: false,
      })
      await page.getByText('Include details', { exact: true }).click()
      await switched().focus()
      await press('Space')
      await page.getByText('Plan A', { exact: true }).click()
      assert.equal(await checkbox().isChecked(), true)
      assert.equal(await switched().isChecked(), true)
      assert.equal(await radio('Plan B').isChecked(), true)
      assert.equal(await radio('Plan A').isChecked(), false)
      assert.deepEqual(await values(), {
        choice: 'yes',
        enabled: 'yes',
        plan: 'b',
        default: 'on',
      })
      await configure({ checked: false, switched: false, selected: 'a' })
      assert.equal(await checkbox().isChecked(), false)
      assert.equal(await switched().isChecked(), false)
      assert.equal(await radio('Plan A').isChecked(), true)
    },
  )
  await record(
    'booleans: radio arrows skip disabled items, wrap and work without a form name',
    async () => {
      await open()
      await radio('Plan A').focus()
      await press('ArrowRight')
      assert.equal((await read()).selected, 'b')
      await press('ArrowRight')
      assert.equal((await read()).selected, 'a')
      await configure({ named: false })
      await radio('Plan A').focus()
      await press('ArrowDown')
      assert.equal((await read()).selected, 'b')
    },
  )
  await record(
    'booleans: disabled items, read-only state and prevented controls preserve values',
    async () => {
      await open()
      await page.locator('[data-control=disabled]').click()
      assert.equal((await read()).selected, 'a')
      await configure({ prevent: true })
      await page.locator('[data-control=checkbox]').click()
      assert.equal((await read()).checked, false)
      await configure({ checked: true, switched: true, readOnly: true })
      await page.getByText('Include details', { exact: true }).click()
      await page.getByText('Enable updates', { exact: true }).click()
      await page.getByText('Plan B', { exact: true }).click()
      assert.equal(await checkbox().isChecked(), true)
      assert.equal(await switched().isChecked(), true)
      assert.equal(await radio('Plan A').isChecked(), true)
      assert.equal(await radio('Plan B').isChecked(), false)
      await configure({ disabled: true })
      assert.equal(await checkbox().isDisabled(), true)
      assert.equal(await switched().isDisabled(), true)
      assert.equal(await radio('Plan A').isDisabled(), true)
      assert.deepEqual(await values(), { default: 'on' })
    },
  )
  await record(
    'booleans: help, errors and mixed indicators remain linked and detach cleanly',
    async () => {
      await open()
      const controls = page.locator(
        '[data-control=checkbox], [data-control=switch], [data-control=a]',
      )
      const borderColors = () =>
        controls.evaluateAll((nodes) =>
          nodes.map((node) => getComputedStyle(node).borderTopColor),
        )
      const normal = await borderColors()
      await configure({ invalid: true, indeterminate: true })
      const invalid = await borderColors()
      assert.equal(new Set(invalid).size, 1)
      assert.notDeepEqual(invalid, normal)
      assert.equal(await checkbox().getAttribute('aria-invalid'), 'true')
      assert.equal(
        await checkbox().getAttribute('aria-describedby'),
        'checkbox-help checkbox-error',
      )
      assert.equal(
        await checkbox().evaluate((node) => node.indeterminate),
        true,
      )
      assert.equal(
        await page
          .locator('[data-control=checkbox] .ui-check-mark path')
          .getAttribute('d'),
        'M3 8h10',
      )
      assert.equal(
        await switched().getAttribute('aria-describedby'),
        'switch-help switch-error',
      )
      assert.equal(
        await page
          .getByRole('radiogroup', { name: 'Plan', exact: true })
          .getAttribute('aria-describedby'),
        'radio-help radio-error',
      )
      assert.match(
        await radio('Plan A').getAttribute('aria-describedby'),
        /plan-a-help/,
      )
      await configure({ help: false, invalid: false })
      assert.equal(await checkbox().getAttribute('aria-describedby'), null)
      assert.equal(await page.locator('#checkbox-error').count(), 0)
    },
  )
  await record(
    'booleans: native reset restores defaults and controlled rejected resets preserve form values',
    async () => {
      await open()
      const uncontrolled = page.getByRole('checkbox', {
        name: 'Default choice',
        exact: true,
      })
      await page.getByText('Default choice', { exact: true }).click()
      assert.equal(await uncontrolled.isChecked(), false)
      await configure({ preventReset: true })
      const beforeReset = await read()
      await page
        .getByRole('button', { name: 'Reset form', exact: true })
        .click()
      await settle()
      assert.equal(await uncontrolled.isChecked(), false)
      assert.deepEqual(await read(), beforeReset)
      await configure({ preventReset: false })
      await page
        .getByRole('button', { name: 'Reset form', exact: true })
        .click()
      await settle()
      assert.equal(
        await uncontrolled.isChecked(),
        true,
        'uncontrolled reset default',
      )
      await configure({
        checked: true,
        switched: true,
        selected: 'b',
        accept: false,
      })
      await page
        .getByRole('button', { name: 'Reset form', exact: true })
        .click()
      await settle()
      assert.equal(await checkbox().isChecked(), true)
      assert.equal(await switched().isChecked(), true)
      assert.equal(await radio('Plan B').isChecked(), true)
      assert.deepEqual(await values(), {
        choice: 'yes',
        enabled: 'yes',
        plan: 'b',
        default: 'on',
      })
    },
  )
  await record(
    'booleans: disposal releases listeners and refs without later application callbacks',
    async () => {
      await open()
      assert.equal((await read()).refs, 3)
      await page.evaluate(() => {
        window.detachedBooleanControl = document.querySelector(
          '[data-control=checkbox]',
        )
        document.querySelector('form').reset()
        window.booleanFixture.stop()
      })
      const before = await read()
      assert.equal(before.cleanups, 1)
      assert.equal(await page.locator('#root').textContent(), '')
      await page.evaluate(() =>
        window.detachedBooleanControl.dispatchEvent(
          new MouseEvent('click', { bubbles: true }),
        ),
      )
      assert.deepEqual(await read(), before)
    },
  )
}
