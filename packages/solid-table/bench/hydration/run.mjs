import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const assets = fileURLToPath(new URL('.dist/', import.meta.url))
const report = { errors: [], warnings: [], assertions: [] }
let browser
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/favicon.ico') return void response.writeHead(204).end()
    response.setHeader(
      'Content-Type',
      path.endsWith('.js') ? 'text/javascript' : 'text/html',
    )
    response.end(
      await readFile(assets + (path === '/' ? 'index.html' : path.slice(1))),
    )
  } catch {
    response.writeHead(404).end()
  }
})
try {
  for (const ssr of [true, false]) {
    execFileSync(
      'pnpm',
      ['exec', 'vite', 'build', '--config', 'bench/hydration/vite.config.ts'],
      {
        stdio: 'inherit',
        env: { ...process.env, HYDRATION_SERVER: ssr ? '1' : '' },
      },
    )
  }
  const { render } = await import('./.dist-server/server.js')
  const markup = await render()
  assert.match(markup, /Ada/)
  const template = await readFile(assets + 'index.html', 'utf8')
  assert.ok(
    template.includes('<!--ssr-->'),
    'Built HTML must retain the server markup placeholder',
  )
  const html = template.replace('<!--ssr-->', markup)
  // Capture the original nodes before the deferred module attaches the client.
  await writeFile(
    assets + 'index.html',
    html.replace(
      '</body>',
      '<script>window.serverNodes = [document.querySelector("#name"), document.querySelector("#rename"), document.querySelector("#adapter")]</script></body>',
    ),
  )
  await new Promise((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  report.browser = browser.version()
  const page = await browser.newPage()
  page.on('pageerror', (error) => report.errors.push(error.stack))
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      report.warnings.push(message.text())
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForSelector('html[data-hydrated="true"]')
  assert.equal(await page.locator('#name').textContent(), 'Ada')
  assert.equal(await page.locator('#adapter').textContent(), 'Ada')
  assert.equal(
    await page.evaluate(() =>
      window.serverNodes.every(
        (node) => document.getElementById(node.id) === node,
      ),
    ),
    true,
  )
  report.assertions.push(
    'Client attachment preserves native cell, FlexRender cell, button nodes and initial values',
  )
  await page.locator('#rename').click()
  await page.waitForFunction(
    () =>
      document.getElementById('name').textContent === 'Grace' &&
      document.getElementById('adapter').textContent === 'Grace',
  )
  assert.equal(
    await page.evaluate(() =>
      window.serverNodes.every(
        (node) => document.getElementById(node.id) === node,
      ),
    ),
    true,
  )
  report.assertions.push(
    'Hydrated event updates existing native and FlexRender cells',
  )
  const cleanup = await page.evaluate(async () => {
    const fixture = window.hydrationFixture
    fixture.dispose()
    const reads = fixture.lifecycle.reads
    fixture.lifecycle.rename('After disposal')
    window.serverNodes[1].click()
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    )
    return {
      cleanups: fixture.lifecycle.cleanups,
      reads,
      afterReads: fixture.lifecycle.reads,
      remainingNodes: document.querySelectorAll('#name, #rename, #adapter')
        .length,
      diagnostics: fixture.diagnostics(),
    }
  })
  assert.equal(cleanup.cleanups, 1)
  assert.equal(cleanup.remainingNodes, 0)
  assert.equal(cleanup.afterReads, cleanup.reads)
  assert.deepEqual(cleanup.diagnostics, [])
  report.diagnostics = cleanup.diagnostics
  report.assertions.push(
    'Hydrated scope disposal stops cell reads after state changes or detached clicks; host removes markup',
  )
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, [])
} catch (error) {
  report.failure = error.stack
  throw error
} finally {
  await browser?.close()
  if (server.listening) await new Promise((done) => server.close(done))
  await writeFile(
    process.env.BENCH_OUTPUT ?? '/tmp/table-hydration.json',
    JSON.stringify(report, null, 2) + '\n',
  )
}
