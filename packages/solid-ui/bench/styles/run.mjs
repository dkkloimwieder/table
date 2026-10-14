import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('.dist/', import.meta.url))
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    const name = path === '/' ? 'index.html' : path.slice(1)
    response.setHeader(
      'Content-Type',
      name.endsWith('.js')
        ? 'text/javascript'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/html',
    )
    response.end(await readFile(root + name))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.styleFixture)
  assert.equal(
    await page.evaluate(
      () =>
        JSON.stringify(window.styleFixture.baseline) ===
        JSON.stringify(window.styleFixture.outside()),
    ),
    true,
    'unrelated content retains its styles',
  )
  for (const [id, density] of [
    ['light', 'compact'],
    ['dark', 'compact'],
    ['comfortable', 'comfortable'],
  ]) {
    const height = await page
      .locator(`#${id} tr`)
      .evaluate((node) => node.getBoundingClientRect().height)
    assert.equal(
      height,
      await page.evaluate(
        (density) => window.styleFixture.rowHeight(density),
        density,
      ),
    )
    assert.equal(
      await page
        .locator(`#${id} .table-scroll`)
        .evaluate((node) => getComputedStyle(node).borderTopWidth),
      '1px',
    )
  }
  assert.notEqual(
    await page
      .locator('#light-button')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    await page
      .locator('#dark-button')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  )
  const before = await page.locator('#light tr').boundingBox()
  await page.evaluate(() =>
    window.styleFixture.configure('light', 'compact', 'dark'),
  )
  assert.deepEqual(
    await page.locator('#light tr').boundingBox(),
    before,
    'theme preserves geometry',
  )
  await page.locator('#light-button').focus()
  assert.equal(
    await page
      .locator('#light-button')
      .evaluate((node) => getComputedStyle(node).outlineWidth),
    '2px',
  )
  assert.equal(
    await page.evaluate(
      () =>
        JSON.stringify(window.styleFixture.baseline) ===
        JSON.stringify(window.styleFixture.outside()),
    ),
    true,
  )
  for (const id of ['light', 'dark', 'comfortable']) {
    const search = page.locator(`#${id}-search`)
    const clear = page.locator(`#${id}-clear`)
    const group = page.locator(`#${id} .filter-input`)
    await search.focus()
    assert.equal(
      await group.evaluate((node) => getComputedStyle(node).outlineWidth),
      '2px',
    )
    assert.equal(
      await search.evaluate((node) => getComputedStyle(node).outlineStyle),
      'none',
    )
    const bounds = await group.boundingBox()
    const clearBounds = await clear.boundingBox()
    assert.ok(bounds.x + bounds.width >= clearBounds.x + clearBounds.width)
    await clear.focus()
    assert.equal(
      await group.evaluate((node) => getComputedStyle(node).outlineWidth),
      '2px',
    )
    assert.equal(
      await clear.evaluate((node) => getComputedStyle(node).outlineWidth),
      '2px',
    )
    assert.equal(
      await clear.evaluate((node) => getComputedStyle(node).outlineOffset),
      '-3px',
    )
    const select = page.locator(`#${id}-select`)
    await select.focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await select.inputValue(), 'second')
    for (const direction of ['ltr', 'rtl']) {
      await select.evaluate(
        (node, direction) => (node.dir = direction),
        direction,
      )
      const layout = await select.evaluate((node) => {
        const style = getComputedStyle(node)
        return {
          appearance: style.appearance,
          start: style.paddingInlineStart,
          end: style.paddingInlineEnd,
          positions: style.backgroundPositionX.split(', '),
          image: style.backgroundImage,
          color: style.color,
        }
      })
      assert.equal(layout.appearance, 'none')
      const caretInset =
        direction === 'rtl'
          ? layout.positions[0]
          : layout.positions[1].match(/- (\d+px)/)[1]
      assert.equal(
        caretInset,
        layout.start,
        `${id} ${direction} text and caret use the same edge inset`,
      )
      assert.ok(parseFloat(layout.end) >= parseFloat(layout.start) + 10)
      assert.ok(
        layout.image.includes(layout.color),
        'caret follows the control text color',
      )
    }
    const list = page.locator(`#${id}-listbox`)
    assert.equal(
      await list.evaluate((node) => getComputedStyle(node).appearance),
      'auto',
    )
    assert.equal(
      await list.evaluate((node) => getComputedStyle(node).backgroundImage),
      'none',
    )
  }
  await page.emulateMedia({ forcedColors: 'active' })
  assert.equal(
    await page
      .locator('#light-select')
      .evaluate((node) => getComputedStyle(node).appearance),
    'auto',
  )
  assert.equal(
    await page
      .locator('#light-select')
      .evaluate((node) => getComputedStyle(node).backgroundImage),
    'none',
  )
  await page.emulateMedia({ forcedColors: 'none' })
  assert.deepEqual(errors, [])
  console.log(
    'PASS scoped styles, themes, density, grouped focus, native caret spacing, and unrelated content',
  )
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
