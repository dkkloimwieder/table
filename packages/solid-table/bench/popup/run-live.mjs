import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { chromium } from '@playwright/test'

const ui = fileURLToPath(new URL('../../../solid-ui/src/', import.meta.url))
const parts = {
  Combobox: [
    'Root',
    'Arrow',
    'Content',
    'Control',
    'Description',
    'ErrorMessage',
    'HiddenSelect',
    'Icon',
    'Input',
    'Item',
    'ItemDescription',
    'ItemIndicator',
    'ItemLabel',
    'Label',
    'Listbox',
    'Portal',
    'Section',
    'Trigger',
  ],
  Select: [
    'Root',
    'Arrow',
    'Content',
    'Description',
    'ErrorMessage',
    'HiddenSelect',
    'Icon',
    'Item',
    'ItemDescription',
    'ItemIndicator',
    'ItemLabel',
    'Label',
    'Listbox',
    'Portal',
    'Section',
    'Trigger',
    'Value',
  ],
  DropdownMenu: [
    'Root',
    'Arrow',
    'CheckboxItem',
    'Content',
    'Group',
    'GroupLabel',
    'Icon',
    'Item',
    'ItemDescription',
    'ItemIndicator',
    'ItemLabel',
    'Portal',
    'RadioGroup',
    'RadioItem',
    'Separator',
    'Sub',
    'SubContent',
    'SubTrigger',
    'Trigger',
  ],
  Popover: [
    'Root',
    'Anchor',
    'Arrow',
    'CloseButton',
    'Content',
    'Description',
    'Portal',
    'Title',
    'Trigger',
  ],
  Tooltip: ['Root', 'Arrow', 'Content', 'Portal', 'Trigger'],
  Dialog: [
    'Root',
    'Portal',
    'Trigger',
    'CloseButton',
    'Overlay',
    'Content',
    'Title',
    'Description',
  ],
  AlertDialog: [
    'Root',
    'Portal',
    'Trigger',
    'CloseButton',
    'Overlay',
    'Content',
    'Title',
    'Description',
    'Cancel',
    'Action',
  ],
  Sheet: [
    'Root',
    'Portal',
    'Trigger',
    'CloseButton',
    'Overlay',
    'Content',
    'Title',
    'Description',
  ],
}
const output =
  process.env.BENCH_OUTPUT ??
  fileURLToPath(
    new URL('../../../../test-results/solid-popup-live.json', import.meta.url),
  )
const report = { cases: [], errors: [], warnings: [] }
const server = await createServer({
  configFile: fileURLToPath(new URL('./vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, strictPort: true },
})
let browser
try {
  await server.listen()
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`
  browser = await chromium.launch({
    executablePath: process.env.BENCH_EXECUTABLE_PATH,
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  const accessibility = await page.context().newCDPSession(page)
  await accessibility.send('Accessibility.enable')
  page.on('pageerror', (error) => report.errors.push(error.stack))
  page.on('console', (message) => {
    if (
      ['warning', 'error'].includes(message.type()) &&
      !message.text().startsWith('[HOT_SCOPE_TIME]')
    )
      report.warnings.push(message.text())
  })
  await page.goto(`${url}?consumer=1`)
  await page
    .getByRole('textbox', { name: 'Display name', exact: true })
    .fill('Refresh draft')
  const assertParts = async () => {
    const missing = await page.evaluate(
      async ({ ui, parts }) => {
        const exports = await import(`/@fs${ui}index.ts`)
        return Object.entries(parts).flatMap(([name, keys]) =>
          keys
            .filter((key) => typeof exports[name]?.[key] !== 'function')
            .map((key) => `${name}.${key}`),
        )
      },
      { ui, parts },
    )
    assert.deepEqual(missing, [])
  }
  await assertParts()
  report.cases.push('All public compound parts survive Vite refresh proxies')
  for (const name of [
    'Combobox',
    'Select',
    'DropdownMenu',
    'Popover',
    'Tooltip',
    'Dialog',
    'AlertDialog',
    'Sheet',
  ]) {
    const module = server.moduleGraph.getModuleById(
      `${ui}components/${name}.tsx`,
    )
    assert.ok(module, `loaded ${name} module`)
    const updated = page.waitForEvent('console', {
      predicate: (message) =>
        message.text().includes('hot updated:') &&
        message.text().includes(`${name}.tsx`),
    })
    await server.reloadModule(module)
    await updated
    await assertParts()
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Display name', exact: true })
        .inputValue(),
      'Refresh draft',
    )
  }
  await page.getByRole('button', { name: 'Review record', exact: true }).click()
  await page.getByRole('alertdialog', { name: 'Save this record?' }).waitFor()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' })
  report.cases.push(
    'Hot updates preserve compound parts, form draft and confirmation interaction',
  )
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.warnings, [])
  await browser.close()
  browser = undefined
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./run.mjs', import.meta.url))],
      {
        env: {
          ...process.env,
          BENCH_URL: url,
          BENCH_WORKLOADS: '0',
          BENCH_WORKLOAD: '0',
          BENCH_OUTPUT: output.replace(/\.json$/, '-interactions.json'),
        },
        stdio: 'inherit',
      },
    )
    child.on('error', reject)
    child.on('close', (status, signal) => resolve({ status, signal }))
  })
  assert.equal(result.status, 0, JSON.stringify(result))
  report.cases.push(
    'Full popup interactions pass against the Vite development server',
  )
} catch (error) {
  report.failure = error.stack
  throw error
} finally {
  await browser?.close()
  await server.close()
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
}
