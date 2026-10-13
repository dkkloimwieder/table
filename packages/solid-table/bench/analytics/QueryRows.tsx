import { Show, createEffect, onCleanup } from 'solid-js'
import { uiDensity } from '@table/ui'
import { TableRow } from '@table/ui/table'
import { VirtualRows } from '../table/VirtualRows'
import { createTableVirtualizer } from '../table/createVirtualizer'
import type { UIDensity } from '@table/ui'
import type { NativeTable } from '@tanstack/solid-table/native'
import type { QueryRecord, QueryWindow } from './types'

export function QueryRows(props: {
  density?: UIDensity
  table: NativeTable<QueryRecord>
  window?: QueryWindow
  viewport: () => HTMLElement | null
}) {
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const window = createTableVirtualizer({
    mode: 'fixed',
    getItemKey: (index) => index,
    getIndexForKey: (index) => index,
    get count() {
      return props.window?.totalRows ?? props.table.getRowIds().length
    },
    get rowHeight() {
      return uiDensity(props.density).rowHeight
    },
    getScrollElement: props.viewport,
    get scrollMargin() {
      const node = props.viewport()
      return (
        (node?.querySelector('caption')?.offsetHeight ?? 0) +
        (node?.querySelector('thead')?.offsetHeight ?? 0)
      )
    },
    observeElements: () =>
      Array.from(props.viewport()?.querySelectorAll('caption, thead') ?? []),
  })
  createEffect(
    () => {
      const visible = window.getKeys()
      return {
        first: visible[0],
        last: visible.at(-1),
        offset: props.window?.offset ?? 0,
        length: props.table.getRowIds().length,
        loading: props.window?.loading,
      }
    },
    (range) => {
      if (
        range.first === undefined ||
        range.last === undefined ||
        range.loading
      )
        return
      if (
        range.first < range.offset ||
        range.last >= range.offset + range.length
      ) {
        const offset = range.first
        queueMicrotask(() => {
          if (!disposed) props.window?.onRangeChange(offset, range.last! + 1)
        })
      }
    },
  )
  return (
    <VirtualRows
      window={window}
      layout="table"
      columns={() => props.table.getVisibleColumns().length}
      renderRow={(item) => {
        const id = () =>
          props.table.getRowIds()[item - (props.window?.offset ?? 0)]
        return (
          <Show
            when={id()}
            keyed
            fallback={
              <tbody>
                <tr class="virtual-placeholder">
                  <td colspan={props.table.getVisibleColumns().length}>
                    Loading rows…
                  </td>
                </tr>
              </tbody>
            }
          >
            {(value) => <TableRow table={props.table} id={value} />}
          </Show>
        )
      }}
    />
  )
}
