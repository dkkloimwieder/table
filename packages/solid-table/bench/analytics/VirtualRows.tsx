import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
} from 'solid-js'
import { TableRow } from '../table/Table'
import { fixedRowRange } from './fixed-window'
import type { NativeTable } from '@tanstack/solid-table/native'
import type { QueryRecord, QueryWindow } from './types'

export function VirtualRows(props: {
  table: NativeTable<QueryRecord>
  window?: QueryWindow
  viewport: () => HTMLElement | null
}) {
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const count = createMemo(
    () => props.window?.totalRows ?? props.table.getRowIds().length,
  )
  const [geometry, setGeometry] = createSignal(
    { offset: 0, height: 600, headerHeight: 0 },
    { ownedWrite: true },
  )
  const range = createMemo(
    () => {
      const current = geometry()
      return fixedRowRange(
        count(),
        current.offset,
        current.height,
        current.headerHeight,
      )
    },
    {
      equals: (a, b) =>
        a.start === b.start && a.end === b.end && a.bottom === b.bottom,
    },
  )
  const items = createMemo(() =>
    Array.from(
      { length: range().end - range().start },
      (_, index) => range().start + index,
    ),
  )
  onSettled(() => {
    const node = props.viewport()
    if (!node) return
    const update = () =>
      setGeometry({
        offset: node.scrollTop,
        height: node.clientHeight,
        headerHeight:
          (node.querySelector('caption')?.offsetHeight ?? 0) +
          (node.querySelector('thead')?.offsetHeight ?? 0),
      })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    for (const heading of node.querySelectorAll('caption, thead'))
      observer.observe(heading)
    node.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', update)
    }
  })
  createEffect(
    () => {
      const visible = items()
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
  const columns = () => props.table.getVisibleColumns().length
  return (
    <>
      <tbody aria-hidden="true">
        <tr>
          <td
            colspan={columns()}
            style={{ height: `${range().top}px`, padding: 0, border: 0 }}
          />
        </tr>
      </tbody>
      <For each={items()}>
        {(item) => {
          const id = () =>
            props.table.getRowIds()[item - (props.window?.offset ?? 0)]
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
              height: `${range().bottom}px`,
              padding: 0,
              border: 0,
            }}
          />
        </tr>
      </tbody>
    </>
  )
}
