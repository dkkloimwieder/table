/**
 * Solid-1 jsdom render smoke test. The devtools-wired examples were the only
 * runtime coverage of this package; with that wiring stripped (Solid 2
 * migration fallback), this test keeps the real mount path exercised.
 *
 * NOTE: `../src` (the barrel) swaps in the NoOp variants whenever
 * NODE_ENV !== 'development' — which includes vitest's `test` — so the real
 * implementations are imported from their modules directly.
 */
import { describe, expect, it, vi } from 'vitest'
import { createRoot } from 'solid-js'
import { render } from 'solid-js/web'
import { constructTable, tableFeatures } from '@tanstack/table-core'
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings'
import { TableDevtoolsPanel } from '../src/TableDevtools'
import { useTanStackTableDevtools } from '../src/useTanStackTableDevtools'
import type { ColumnDef } from '@tanstack/table-core'

type Data = { id: string; title: string }

const features = tableFeatures({
  coreReactivityFeature: storeReactivityBindings(),
})

const columns: Array<ColumnDef<typeof features, Data>> = [
  { id: 'id', accessorKey: 'id' },
  { id: 'title', accessorKey: 'title' },
]

const data: Array<Data> = [
  { id: '1', title: 'One' },
  { id: '2', title: 'Two' },
]

describe('devtools render smoke (Solid 1 + jsdom)', () => {
  it('mounts the real panel into the DOM and unmounts without console errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.appendChild(container)
    try {
      const dispose = render(() => <TableDevtoolsPanel />, container)
      expect(container.innerHTML).not.toBe('')
      dispose()
      expect(container.innerHTML).toBe('')
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
      container.remove()
    }
  })

  it('registers and unregisters a table through the real hook without console errors', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const table = constructTable({
        columns,
        data,
        features,
        key: 'render-smoke',
      })
      createRoot((dispose) => {
        useTanStackTableDevtools(table)
        dispose()
      })
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})
