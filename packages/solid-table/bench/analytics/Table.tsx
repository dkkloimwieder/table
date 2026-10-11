import { For, Show, createMemo, createSignal } from 'solid-js'
import { createTable } from '@tanstack/solid-table/native'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { TableColumnMove, moveColumn } from '../table/TableColumnMove'
import { Table as TablePresentation } from '../table/Table'
import { TableHeaderName } from '../table/TableHeaderName'
import { downloadCsv, toCsv } from './csv'
import type { QueryRecord, QueryResult, QueryState, QueryValue } from './types'

export function Table(props: { query: QueryState; retry?: () => void }) {
  // Keep only the application's last result reference through loading/error states.
  const result = createMemo<QueryResult | undefined>((previous) =>
    props.query.status === 'ready' ? props.query.result : previous,
  )
  const scope = createMemo(() => {
    const value = result()
    return (
      value &&
      JSON.stringify([value.key, value.columns.map((column) => column.id)])
    )
  })
  return (
    <section
      aria-label="Query results"
      aria-busy={props.query.status === 'loading' ? 'true' : 'false'}
    >
      <Show when={props.query.status === 'loading'}>
        <p role="status">Loading results…</p>
      </Show>
      <Show when={props.query.status === 'error'}>
        <p role="alert">
          {props.query.status === 'error' ? props.query.message : ''}
        </p>
        <Show when={props.retry}>
          <button
            type="button"
            ref={nativeEvents({ click: () => props.retry?.() })}
          >
            Retry query
          </button>
        </Show>
      </Show>
      <Show when={scope()} keyed>
        {(_scope) => (
          <ResultTable
            result={result()!}
            available={props.query.status === 'ready'}
          />
        )}
      </Show>
    </section>
  )
}

function ResultTable(props: { result: QueryResult; available: boolean }) {
  const [labels, setLabels] = createSignal<Record<string, string>>({})
  const source = createMemo(
    () => new Map(props.result.rows.map((row) => [row.id, row.values])),
  )
  const ids = createMemo(() => props.result.rows.map((row) => row.id))
  const columns = createMemo(() =>
    props.result.columns.map((column) => ({
      id: column.id,
      accessorFn: (record: QueryRecord) =>
        Object.hasOwn(record, column.id) ? record[column.id] : undefined,
      sortFn: (left: unknown, right: unknown) => {
        if (typeof left === 'number' && typeof right === 'number')
          return left - right
        const a = String(left ?? '')
        const b = String(right ?? '')
        return a < b ? -1 : a > b ? 1 : 0
      },
      sortMissing: 'last' as const,
    })),
  )
  const table = createTable<QueryRecord>({
    source: { ids, get: (id) => source().get(id) },
    manualFiltering: true,
    get columns() {
      return columns()
    },
  })
  const label = (id: string) =>
    Object.hasOwn(labels(), id)
      ? labels()[id]!
      : props.result.columns.find((column) => column.id === id)!.label
  const exportCsv = () => {
    if (!props.available) return
    const visible = table.getVisibleColumns()
    if (!visible.length) return
    const rows = table
      .getRowIds()
      .map((id) =>
        visible.map((column) => table.getValue<QueryValue>(id, column.id)),
      )
    downloadCsv(
      toCsv(
        visible.map((column) => label(column.id)),
        rows,
      ),
    )
  }
  const columnIds = createMemo(() =>
    table.getColumns().map((column) => column.id),
  )
  return (
    <div class="analytics-table">
      <div class="toolbar">
        <button
          type="button"
          disabled={!props.available || !table.getVisibleColumns().length}
          ref={nativeEvents({ click: exportCsv })}
        >
          Export CSV
        </button>
        <button
          type="button"
          disabled={!props.available}
          ref={nativeEvents({
            click: () => {
              table.setSorting([])
              table.setColumnVisibility({})
              table.setColumnOrder([])
              setLabels({})
            },
          })}
        >
          Reset display
        </button>
      </div>
      <details>
        <summary>Display columns</summary>
        <fieldset disabled={!props.available}>
          <legend>Visible columns</legend>
          <For each={table.getColumns()}>
            {(column) => (
              <div class="column-control" data-column={column.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    ref={nativeEvents<HTMLInputElement>({
                      change: (event) =>
                        column.toggleVisibility(event.currentTarget.checked),
                    })}
                  />
                  Show {label(column.id)}
                </label>
              </div>
            )}
          </For>
        </fieldset>
      </details>
      <Show when={props.available}>
        <p role="status">{table.getRowIds().length} rows</p>
        <Show
          when={table.getVisibleColumns().length}
          fallback={<p>Show a column to view or export results.</p>}
        >
          <div class="table-scroll">
            <TablePresentation
              table={table}
              caption="Query results"
              grouped={false}
              header={(column) => (
                <>
                  <TableColumnMove
                    id={column.id}
                    label={label(column.id)}
                    ids={columnIds()}
                    onMove={(destination) =>
                      table.setColumnOrder([
                        ...moveColumn(columnIds(), column.id, destination),
                      ])
                    }
                  />
                  <TableHeaderName
                    label={label(column.id)}
                    sorted={column.getIsSorted()}
                    onSort={() => column.toggleSorting()}
                    onRename={(value) =>
                      setLabels((previous) => ({
                        ...previous,
                        [column.id]: value,
                      }))
                    }
                  />
                </>
              )}
            />
          </div>
          <Show when={!table.getRowIds().length}>
            <p>The query returned no rows.</p>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
