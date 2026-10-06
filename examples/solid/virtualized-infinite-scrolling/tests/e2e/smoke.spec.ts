import path from 'node:path'
import { expect, test } from '@playwright/test'
import { startExampleServer } from '../../../../../tests/e2e/helpers/startExampleServer'
import type { Locator, Page } from '@playwright/test'

const exampleDir = path.resolve()

function collectPageErrors(page: Page) {
  const errors: Array<string> = []

  page.on('pageerror', (error) => {
    errors.push(error.message)
  })

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  return errors
}

async function openExample(page: Page) {
  const server = await startExampleServer(exampleDir)
  const errors = collectPageErrors(page)

  await page.route(
    'https://unpkg.com/react-scan/dist/auto.global.js',
    (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: '',
      }),
  )

  await page.goto(server.url)

  return { errors, server }
}

function getTable(page: Page) {
  return page
    .locator('table:visible, .divTable:visible')
    .filter({ has: page.locator('thead th, .thead .th') })
    .filter({ has: page.locator('tbody tr, .tbody .tr') })
    .first()
}

function getHeaderCells(table: Locator) {
  return table.locator('thead th, .thead .th')
}

function getBodyRows(table: Locator) {
  return table.locator('tbody tr, .tbody .tr')
}

async function getFirstBodyRowData(table: Locator) {
  const row = getBodyRows(table).first()
  const firstInput = row
    .locator('input:not([type="checkbox"]):not([type="radio"])')
    .first()

  if ((await firstInput.count()) > 0 && (await firstInput.isVisible())) {
    return firstInput.inputValue()
  }

  const text = await row.textContent()
  return text?.replace(/\s+/g, ' ').trim() ?? ''
}

test('renders the table without crashing', async ({ page }) => {
  const { errors, server } = await openExample(page)

  try {
    const table = getTable(page)
    const bodyRows = getBodyRows(table)

    await expect(table).toBeVisible()
    await expect(getHeaderCells(table).first()).toBeVisible()
    await expect(bodyRows.first()).toBeVisible()

    const regenerateButton = page
      .getByRole('button', { name: /^Regenerate Data$/i })
      .first()

    if ((await regenerateButton.count()) > 0) {
      await expect(regenerateButton).toBeVisible()

      const firstRowBefore = await getFirstBodyRowData(table)

      await regenerateButton.click()

      await expect
        .poll(() => getFirstBodyRowData(table))
        .not.toBe(firstRowBefore)
      await expect(bodyRows.first()).toBeVisible()
    }

    expect(errors).toEqual([])
  } finally {
    await server.close()
  }
})

test('loads additional pages and refreshes sorted cells through the page snapshots', async ({
  page,
}) => {
  const { errors, server } = await openExample(page)
  try {
    const app = page.locator('.app')
    const table = getTable(page)
    const container = page.locator('.container')
    await expect(table).toBeVisible()
    await expect(app).toContainText('(50 of 1,000 rows fetched)')
    for (const count of [100, 150]) {
      await expect(page.getByText('Fetching More...')).toHaveCount(0)
      await container.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        element.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await expect(app).toContainText(`(${count} of 1,000 rows fetched)`)
    }
    const age = table.locator('.sortable-header').filter({ hasText: /^Age/ })
    await container.evaluate((element) => {
      element.scrollTop = 0
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect(getBodyRows(table).first().locator('td').first()).toHaveText(
      '1',
    )
    await age.click()
    await expect(app).toContainText('(50 of 1,000 rows fetched)')
    await expect(page.getByText('Fetching More...')).toHaveCount(0)
    const headers = await getHeaderCells(table).allTextContents()
    const ageIndex = headers.findIndex((label) => label.startsWith('Age'))
    expect(ageIndex).toBeGreaterThanOrEqual(0)
    const readAges = () =>
      getBodyRows(table).evaluateAll(
        (rows, index) =>
          rows.map((row) =>
            Number(row.querySelectorAll('td')[index].textContent),
          ),
        ageIndex,
      )
    const expectSorted = async () => {
      const direction = (await age.textContent())?.includes('🔼') ? 1 : -1
      await expect
        .poll(async () => {
          const ages = await readAges()
          return (
            ages.length > 1 &&
            ages.every(
              (value, i) => i === 0 || direction * (value - ages[i - 1]) >= 0,
            )
          )
        })
        .toBe(true)
    }
    await expectSorted()
    for (const count of [100, 150]) {
      await expect(page.getByText('Fetching More...')).toHaveCount(0)
      await container.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        element.dispatchEvent(new Event('scroll', { bubbles: true }))
      })
      await expect(app).toContainText(`(${count} of 1,000 rows fetched)`)
    }
    await expect(page.getByText('Fetching More...')).toHaveCount(0)
    await age.click()
    await expect(app).toContainText(/\((50|100) of 1,000 rows fetched\)/)
    await expect(page.getByText('Fetching More...')).toHaveCount(0)
    await expectSorted()
    expect(errors).toEqual([])
  } finally {
    await server.close()
  }
})
