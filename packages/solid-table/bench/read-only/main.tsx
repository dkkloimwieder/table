import { uiScope } from '@table/ui'
import { render } from '@solidjs/web'
import { OBSERVE, action, createSignal, flush } from 'solid-js'
import { ReadOnlyTable } from '@table/ui/table'
import { createTable, nativeAggregations } from '@tanstack/solid-table/native'
import '@table/ui/styles.css'
import '../fixture-page.css'

type RecordData = { category: string; name: string; amount: number }
const textColumn = {
  filterFn: (value: unknown, filter: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .includes(String(filter).toLowerCase()),
  sortFn: (a: unknown, b: unknown) =>
    String(a ?? '').localeCompare(String(b ?? '')),
}
const initial = [
  { id: 'a', values: { category: 'West', name: 'Desk', amount: 42 } },
  { id: 'b', values: { category: 'East', name: 'Lamp', amount: 7 } },
  { id: 'c', values: { category: 'West', name: 'Chair', amount: 12 } },
]
let dispose: (() => void) | undefined
let replace: ((rows: typeof initial) => void) | undefined
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
const events: Array<unknown> = []
// eslint-disable-next-line require-yield -- Use the qualified runtime disposal path.
const disposeRoot = action(function* () {
  dispose?.()
})
function stop() {
  disposeRoot()
  dispose = undefined
  replace = undefined
  flush()
}
function start() {
  stop()
  events.push(...(capture?.stop() ?? []))
  capture = OBSERVE?.diagnostics.capture()
  dispose = render(() => {
    const [rows, setRows] = createSignal(initial)
    replace = (value) => {
      setRows(value)
      flush()
    }
    const table = createTable<RecordData>({
      source: {
        ids: () => rows().map((row) => row.id),
        get: (id) => rows().find((row) => row.id === id)?.values,
      },
      columns: [
        {
          ...textColumn,
          id: 'category',
          header: 'Category',
          accessorKey: 'category',
        },
        { ...textColumn, id: 'name', header: 'Name', accessorKey: 'name' },
        {
          ...textColumn,
          id: 'amount',
          header: 'Amount',
          accessorKey: 'amount',
          sortFn: (a, b) => Number(a) - Number(b),
          aggregationFn: nativeAggregations.sum,
        },
      ],
    })
    return (
      <main data-ui-portal-root="" {...uiScope()}>
        <h1>Read-only table</h1>
        <ReadOnlyTable table={table} />
      </main>
    )
  }, document.getElementById('root')!)
  flush()
}
const api = {
  start,
  stop,
  replace: (rows: typeof initial) => replace?.(rows),
  diagnostics: () => {
    events.push(...(capture?.stop() ?? []))
    capture = OBSERVE?.diagnostics.capture()
    return events.splice(0)
  },
}
declare global {
  interface Window {
    readOnlyFixture: typeof api
  }
}
window.readOnlyFixture = api
start()
