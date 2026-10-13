import assert from 'node:assert/strict'

export async function choiceCases({ page, url, record, press, settle }) {
  const open = () => page.goto(`${url}?choices=1`)
  const select = () => page.getByRole('button', { name: /Selected category/ })
  const input = () => page.getByRole('combobox', { name: 'Find category' })
  const read = () => page.evaluate(() => window.choiceFixture.read())
  const configure = (next) =>
    page.evaluate((next) => window.choiceFixture.configure(next), next)

  await record(
    'choices: custom items select by pointer and disabled options reject changes',
    async () => {
      await open()
      await page.evaluate(() => {
        window.choiceNativeEvents = []
        document.querySelector('select').addEventListener('change', () => {
          window.choiceNativeEvents.push(
            new FormData(document.querySelector('form')).get('category'),
          )
        })
      })
      await select().click()
      assert.equal(
        await page
          .getByRole('option', { name: 'Gamma' })
          .getAttribute('data-custom-item'),
        'select',
      )
      await page.getByRole('option', { name: 'Beta' }).click({ force: true })
      assert.equal((await read()).value, 'alpha')
      await page.getByRole('option', { name: 'Gamma' }).click()
      assert.equal((await read()).value, 'gamma')
      assert.deepEqual(await page.evaluate(() => window.choiceNativeEvents), [
        'gamma',
      ])
      assert.equal(
        await page.evaluate(() =>
          new FormData(document.querySelector('form')).get('category'),
        ),
        'gamma',
      )
      await page.getByRole('button', { name: 'Clear selection' }).click()
      assert.equal((await read()).value, null)
      assert.deepEqual(await page.evaluate(() => window.choiceNativeEvents), [
        'gamma',
        '',
      ])
      assert.equal(
        await page.evaluate(() =>
          new FormData(document.querySelector('form')).get('category'),
        ),
        '',
      )
    },
  )
  await record(
    'choices: controlled search accepts external updates and restores rejected input',
    async () => {
      await open()
      await input().fill('server query')
      assert.equal((await read()).query, 'server query')
      assert.equal((await read()).value, 'alpha')
      assert.equal(
        await page.getByRole('option').count(),
        3,
        'caller options bypass local filtering',
      )
      await configure({ query: 'External', acceptSearch: false })
      assert.equal(await input().inputValue(), 'External')
      await input().fill('Rejected')
      assert.equal(await input().inputValue(), 'External')
      assert.equal((await read()).query, 'External')
      assert.equal((await read()).value, 'alpha')
    },
  )
  await record(
    'choices: keyboard skips disabled options and keeps value separate from search',
    async () => {
      await open()
      await input().focus()
      await press('ArrowDown')
      await press('ArrowDown')
      await press('Enter')
      assert.equal((await read()).value, 'gamma')
      assert.equal(await input().inputValue(), 'Gamma')
      await input().fill('Uncommitted query')
      await press('Escape')
      assert.equal((await read()).value, 'gamma')
      assert.equal((await read()).query, 'Uncommitted query')
    },
  )
  await record(
    'choices: option pages and late results retain controlled selection and submitted value',
    async () => {
      await open()
      const before = await read()
      await configure({ options: [{ id: 'delta', label: 'Delta' }] })
      assert.equal((await read()).value, 'alpha')
      assert.equal((await read()).changes, before.changes)
      assert.match(await select().textContent(), /Alpha/)
      assert.equal(await input().inputValue(), 'Alpha')
      assert.equal(
        await page.evaluate(() =>
          new FormData(document.querySelector('form')).get('category'),
        ),
        'alpha',
      )
      await configure({
        value: { id: 'remote', label: 'Remote label' },
        query: 'Remote label',
      })
      await configure({ options: [] })
      assert.equal((await read()).value, 'remote')
      assert.equal((await read()).changes, before.changes)
      assert.match(await select().textContent(), /Remote label/)
      assert.equal(await input().inputValue(), 'Remote label')
    },
  )
  await record(
    'choices: empty and loading content stays selectable through caller footer controls',
    async () => {
      await open()
      await configure({ options: [], loading: true })
      await input().fill('Request')
      await page
        .getByRole('status')
        .filter({ hasText: 'Loading results' })
        .waitFor()
      await configure({ loading: false })
      await page.getByRole('status').filter({ hasText: 'No results' }).waitFor()
      await page.getByRole('button', { name: 'More search options' }).click()
      assert.equal((await read()).pages, 1)
      assert.equal((await read()).value, 'alpha')
      await page.getByRole('option', { name: 'Delta' }).click()
      assert.equal((await read()).value, 'delta')
    },
  )
  await record(
    'choices: footer buttons are reachable by Tab and leave through normal control order',
    async () => {
      await open()
      await input().focus()
      await press('ArrowDown')
      await press('Tab')
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        'More search options',
      )
      await press('Shift+Tab')
      assert.equal(
        await input().evaluate((node) => node === document.activeElement),
        true,
      )
      await press('ArrowDown')
      await press('Tab')
      await press('Enter')
      assert.equal((await read()).pages, 1)
      await press('Tab')
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        'Clear selection',
      )
      await select().click()
      await page.waitForFunction(
        () => document.activeElement?.getAttribute('role') === 'option',
      )
      await settle()
      await press('Tab')
      assert.equal(
        await page.evaluate(() => document.activeElement.textContent),
        'More select options',
      )
      await press('Shift+Tab')
      assert.equal(
        await page.evaluate(() => document.activeElement.getAttribute('role')),
        'option',
      )
      await press('Escape')
      assert.equal(
        await select().evaluate((node) => node === document.activeElement),
        true,
      )
      await press('ArrowDown')
      await press('Tab')
      await press('Enter')
      assert.equal((await read()).pages, 2)
      assert.deepEqual((await read()).optionKeys, [
        'alpha',
        'beta',
        'gamma',
        'delta',
        'page-2',
      ])
      await press('Tab')
      assert.equal(
        await page.evaluate(() => document.activeElement.getAttribute('role')),
        'combobox',
        await page.evaluate(() => document.activeElement.outerHTML),
      )
    },
  )
  await record(
    'choices: labels and error descriptions remain linked and disabled controls close',
    async () => {
      await open()
      await configure({ invalid: true })
      for (const control of [select(), input()]) {
        assert.equal(await control.getAttribute('aria-invalid'), 'true')
        const descriptions = await control.getAttribute('aria-describedby')
        assert.ok(descriptions)
        for (const id of descriptions.split(' '))
          assert.equal(await page.locator(`[id="${id}"]`).count(), 1)
      }
      await input().focus()
      await press('ArrowDown')
      await configure({ disabled: true })
      assert.equal(await page.getByRole('listbox').count(), 0)
      assert.equal(await input().isDisabled(), true)
      assert.equal(await select().isDisabled(), true)
      assert.equal((await read()).value, 'alpha')
    },
  )
  await record(
    'choices: disposal removes open portals without changing application values',
    async () => {
      await open()
      await input().focus()
      await press('ArrowDown')
      assert.equal(await page.getByRole('listbox').count(), 1)
      await page.evaluate(() => window.choiceFixture.stop())
      assert.equal(await page.getByRole('listbox').count(), 0)
      assert.equal(await page.locator('#root').textContent(), '')
      assert.equal((await read()).cleanups, 1)
      assert.equal((await read()).changes, 0)
    },
  )
}
