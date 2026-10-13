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
  assert.deepEqual(errors, [])
  console.log(
    'PASS scoped styles, independent themes, density geometry, focus, and unrelated content',
  )
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
