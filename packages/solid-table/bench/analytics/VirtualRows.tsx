import { For, Show, createEffect, createMemo, onCleanup } from 'solid-js'
import { createKeyedVirtualizer } from '../../../../examples/solid/_shared/createKeyedVirtualizer'
import { TableRow } from '../table/Table'
import type { NativeTable } from '@tanstack/solid-table/native'
import type { QueryRecord, QueryWindow } from './types'

export function VirtualRows(props: {
  table: NativeTable<QueryRecord>
  window: QueryWindow
  viewport: () => HTMLElement | null
}) {
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const keys = createMemo(() =>
    Array.from({ length: props.window.totalRows }, (_, index) => String(index)),
  )
  const virtual = createKeyedVirtualizer({
    get keys() {
      return keys()
    },
    getScrollElement: props.viewport,
    estimateSize: () => 48,
    overscan: 5,
    initialRect: { width: 1000, height: 600 },
  })
  createEffect(
    () => {
      const items = virtual.getItems()
      return {
        first: items[0]?.index,
        last: items.at(-1)?.index,
        offset: props.window.offset,
        length: props.table.getRowIds().length,
        loading: props.window.loading,
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
          if (!disposed) props.window.onRangeChange(offset)
        })
      }
    },
  )
  const columns = () => props.table.getVisibleColumns().length
  return (
    <>
      <tbody aria-hidden="true">
        <tr>
          <td
            colspan={columns()}
            style={{ height: `${virtual.getStart()}px`, padding: 0, border: 0 }}
          />
        </tr>
      </tbody>
      <For each={virtual.getItems()}>
        {(item) => {
          const id = () =>
            props.table.getRowIds()[item.index - props.window.offset]
          return (
            <Show
              when={id()}
              keyed
              fallback={
                <tbody>
                  <tr class="virtual-placeholder">
                    <td colspan={columns()}>Loading rows…</td>
                  </tr>
                </tbody>
              }
            >
              {(value) => <TableRow table={props.table} id={value} />}
            </Show>
          )
        }}
      </For>
      <tbody aria-hidden="true">
        <tr>
          <td
            colspan={columns()}
            style={{
              height: `${Math.max(0, virtual.getTotalSize() - (virtual.getItems().at(-1)?.end ?? 0))}px`,
              padding: 0,
              border: 0,
            }}
          />
        </tr>
      </tbody>
    </>
  )
}
