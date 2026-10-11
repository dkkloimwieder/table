import { render } from '@solidjs/web'
import { OBSERVE, action, createSignal, flush } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { Table } from './Table'
import { downloadCsv, toCsv } from './csv'
import type { QueryExportRequest, QueryResult, QueryState } from './types'
import './style.css'

const sales: QueryResult = {
  key: 'sales',
  columns: [
    { id: 'region', label: 'Region' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'active', label: 'Active' },
  ],
  rows: [
    { id: 'west', values: { region: 'West', revenue: 42, active: true } },
    { id: 'east', values: { region: 'East', revenue: 7, active: false } },
    { id: 'north', values: { region: 'North', revenue: null, active: true } },
  ],
}
const inventory: QueryResult = {
  key: 'inventory',
  columns: [
    { id: 'product', label: 'Product' },
    { id: 'stock', label: 'In stock' },
  ],
  rows: [
    { id: 'item-1', values: { product: 'Desk', stock: 12 } },
    { id: 'item-2', values: { product: 'Lamp', stock: 0 } },
  ],
}
let publish: ((value: QueryState) => void) | undefined
let dispose: (() => void) | undefined
let configureExport: ((configuration: ExportConfiguration) => void) | undefined
type ExportConfiguration = {
  mode?: 'csv' | 'capture' | 'none'
  disabled?: boolean
}
const exportRequests: Array<QueryExportRequest> = []
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
const events: Array<unknown> = []
let request = 0
let timer: ReturnType<typeof setTimeout> | undefined
function load(query: string) {
  const current = ++request
  clearTimeout(timer)
  publish?.({ status: 'loading' })
  timer = setTimeout(() => {
    if (request === current)
      publish?.({
        status: 'ready',
        result: query === 'inventory' ? inventory : sales,
      })
  }, 200)
}
// eslint-disable-next-line require-yield -- Use the qualified runtime disposal path.
const disposeRoot = action(function* () {
  dispose?.()
})
function stop() {
  ++request
  clearTimeout(timer)
  disposeRoot()
  dispose = undefined
  publish = undefined
  configureExport = undefined
  flush()
}
function start(
  state: QueryState = { status: 'ready', result: sales },
  configuration: ExportConfiguration = {},
) {
  stop()
  exportRequests.length = 0
  events.push(...(capture?.stop() ?? []))
  capture = OBSERVE?.diagnostics.capture()
  dispose = render(() => {
    const [query, setQuery] = createSignal<QueryState>(state)
    const [choice, setChoice] = createSignal('sales')
    const [exportConfiguration, setExportConfiguration] =
      createSignal(configuration)
    configureExport = (value) => {
      setExportConfiguration(value)
      flush()
    }
    const exportResult = (description: QueryExportRequest) => {
      if (exportConfiguration().mode === 'capture') {
        exportRequests.push(description)
        return
      }
      const current = query()
      if (
        current.status !== 'ready' ||
        current.result.key !== description.queryKey
      )
        return
      const records = new Map(
        current.result.rows.map((row) => [row.id, row.values]),
      )
      // Read records in the click-time display order without a second cell matrix.
      function* rows() {
        for (const id of description.rowIds) {
          const record = records.get(id)
          yield description.columns.map((column) =>
            record && Object.hasOwn(record, column.id)
              ? record[column.id]
              : undefined,
          )
        }
      }
      downloadCsv(
        toCsv(
          description.columns.map((column) => column.label),
          rows(),
        ),
      )
    }
    publish = (value) => {
      setQuery(value)
      flush()
    }
    return (
      <main>
        <h1>Query analytics</h1>
        <p>
          The application supplies the result. Display changes affect this table
          only.
        </p>
        <label>
          Example query
          <select
            value={choice()}
            ref={nativeEvents<HTMLSelectElement>({
              change: (event) => {
                setChoice(event.currentTarget.value)
                load(event.currentTarget.value)
              },
            })}
          >
            <option value="sales">Sales</option>
            <option value="inventory">Inventory</option>
          </select>
        </label>
        <button
          type="button"
          ref={nativeEvents({ click: () => load(choice()) })}
        >
          Run query
        </button>
        <Table
          query={query()}
          retry={() => load(choice())}
          onExport={
            exportConfiguration().mode === 'none' ? undefined : exportResult
          }
          exportLabel={
            exportConfiguration().mode === 'capture' ? 'Export' : 'Export CSV'
          }
          exportDisabled={exportConfiguration().disabled}
        />
      </main>
    )
  }, document.getElementById('root')!)
  flush()
}
const api = {
  start,
  stop,
  publish: (state: QueryState) => publish?.(state),
  sales,
  configureExport: (configuration: ExportConfiguration) =>
    configureExport?.(configuration),
  exportRequests: () => exportRequests,
  diagnostics: () => {
    events.push(...(capture?.stop() ?? []))
    capture = OBSERVE?.diagnostics.capture()
    return events.splice(0)
  },
}
declare global {
  interface Window {
    analyticsFixture: typeof api
  }
}
window.analyticsFixture = api
start()
