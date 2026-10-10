import { For, Show, createMemo, createSignal } from 'solid-js'
import { createTable } from '@tanstack/solid-table/native'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { TableFilter } from '../editing/TableFilter'
import { TableHeaderFilter } from '../editing/TableHeaderFilter'
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
      filterFn: (value: unknown, filter: unknown) =>
        String(value ?? '')
          .toLowerCase()
          .includes(String(filter).toLowerCase()),
    })),
  )
  const table = createTable<QueryRecord>({
    source: { ids, get: (id) => source().get(id) },
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
  function move(id: string, offset: number) {
    const order = table.getColumns().map((column) => column.id)
    const index = order.indexOf(id)
    const target = index + offset
    if (!props.available || target < 0 || target >= order.length) return
    ;[order[index], order[target]] = [order[target]!, order[index]!]
    table.setColumnOrder(order)
  }
  return (
    <div class="analytics-table">
      <div class="toolbar">
        <TableFilter
          label="Search results"
          clearLabel="Clear search"
          search
          value={table.state.globalFilter}
          disabled={!props.available}
          onValueChange={(value) => table.setGlobalFilter(value)}
        />
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
              table.setColumnFilters([])
              table.setGlobalFilter('')
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
          <legend>Column names and order</legend>
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
                <label>
                  Header for {column.id}
                  <input
                    type="text"
                    value={label(column.id)}
                    ref={nativeEvents<HTMLInputElement>({
                      input: (event) =>
                        setLabels((previous) => ({
                          ...previous,
                          [column.id]: event.currentTarget.value,
                        })),
                    })}
                  />
                </label>
                <button
                  type="button"
                  aria-label={'Move ' + column.id + ' earlier'}
                  disabled={table.getColumns()[0]?.id === column.id}
                  ref={nativeEvents({ click: () => move(column.id, -1) })}
                >
                  Earlier
                </button>
                <button
                  type="button"
                  aria-label={'Move ' + column.id + ' later'}
                  disabled={table.getColumns().at(-1)?.id === column.id}
                  ref={nativeEvents({ click: () => move(column.id, 1) })}
                >
                  Later
                </button>
              </div>
            )}
          </For>
        </fieldset>
      </details>
      <Show when={props.available}>
        <p role="status">
          {table.getRowIds().length} of {ids().length} rows
        </p>
        <Show
          when={table.getVisibleColumns().length}
          fallback={<p>Show a column to view or export results.</p>}
        >
          <div class="table-scroll">
            <table>
              <caption>Query results</caption>
              <thead>
                <tr>
                  <For each={table.getVisibleColumns()}>
                    {(column) => (
                      <th
                        scope="col"
                        data-column={column.id}
                        aria-sort={
                          column.getIsSorted() === 'asc'
                            ? 'ascending'
                            : column.getIsSorted() === 'desc'
                              ? 'descending'
                              : 'none'
                        }
                      >
                        <button
                          type="button"
                          aria-label={'Sort ' + label(column.id)}
                          ref={nativeEvents({
                            click: () => column.toggleSorting(),
                          })}
                        >
                          {label(column.id)}
                          {column.getIsSorted() === 'asc'
                            ? ' ↑'
                            : column.getIsSorted() === 'desc'
                              ? ' ↓'
                              : ''}
                        </button>
                        <TableHeaderFilter
                          columnId={column.id}
                          columnLabel={label(column.id)}
                          label={'Filter ' + label(column.id)}
                          clearLabel={'Clear filter ' + label(column.id)}
                          value={String(column.getFilterValue() ?? '')}
                          onValueChange={(value) =>
                            column.setFilterValue(value || undefined)
                          }
                        />
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={table.getRowIds()}>
                  {(id) => (
                    <tr data-row={id}>
                      <For each={table.getVisibleColumns()}>
                        {(column) => (
                          <td data-column={column.id}>
                            {String(table.getValue(id, column.id) ?? '')}
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <Show when={!table.getRowIds().length}>
            <p>No results match.</p>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
