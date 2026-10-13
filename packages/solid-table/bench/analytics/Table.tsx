import {
  For,
  Show,
  createEffect,
  createMemo,
  createProjection,
  createSignal,
} from 'solid-js'
import { uiDensity, uiScope } from '@table/ui'
import {
  TableColumnMove,
  TableHeaderName,
  Table as TablePresentation,
  moveColumn,
} from '@table/ui/table'
import { createTable } from '@tanstack/solid-table/native'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { DEFAULT_PREVIEW_LIMIT } from './types'
import { QueryRows } from './QueryRows'
import type { UIDensity } from '@table/ui'
import type {
  QueryBrowseRequest,
  QueryExportProps,
  QueryRecord,
  QueryResult,
  QuerySorting,
  QueryState,
  QueryWindow,
} from './types'

type QueryDisplayProps = QueryExportProps & {
  density?: UIDensity
  sorting?: QuerySorting
  onSortingChange?: (request: QueryBrowseRequest) => void
  previewLimit?: number
  onLoadAll?: (request: QueryBrowseRequest) => void
  onShowPreview?: (request: QueryBrowseRequest) => void
  window?: QueryWindow
}

export function Table(
  props: QueryDisplayProps & { query: QueryState; retry?: () => void },
) {
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
            density={props.density}
            result={result()!}
            available={props.query.status === 'ready'}
            onExport={props.onExport}
            exportLabel={props.exportLabel}
            exportDisabled={props.exportDisabled}
            sorting={props.sorting}
            onSortingChange={props.onSortingChange}
            previewLimit={props.previewLimit}
            onLoadAll={props.onLoadAll}
            onShowPreview={props.onShowPreview}
            window={props.window}
          />
        )}
      </Show>
    </section>
  )
}

function ResultTable(
  props: QueryDisplayProps & { result: QueryResult; available: boolean },
) {
  let viewport: HTMLDivElement | undefined
  const [labels, setLabels] = createSignal<Record<string, string>>({})
  const displayRows = createMemo(() =>
    props.window
      ? props.result.rows
      : props.result.rows.slice(0, props.previewLimit ?? DEFAULT_PREVIEW_LIMIT),
  )
  // Per-key readers retain original records without one shared cell dependency.
  const source = createProjection<
    Record<string, (() => QueryRecord) | undefined>
  >(
    () =>
      Object.fromEntries(
        displayRows().map((row) => [row.id, () => row.values]),
      ),
    {},
  )
  const ids = createMemo(() => displayRows().map((row) => row.id))
  const columns = createMemo(() =>
    props.result.columns.map((column) => ({
      id: column.id,
      accessorFn: (record: QueryRecord) =>
        Object.hasOwn(record, column.id) ? record[column.id] : undefined,
    })),
  )
  const table = createTable<QueryRecord>({
    source: {
      ids,
      get: (id) => (Object.hasOwn(source, id) ? source[id]?.() : undefined),
    },
    manualFiltering: true,
    manualSorting: true,
    state: {
      get sorting() {
        return props.sorting
          ? props.sorting.map((sort) => ({ ...sort }))
          : undefined
      },
    },
    onSortingChange: (update) => {
      const previous = props.sorting?.map((sort) => ({ ...sort })) ?? []
      const sorting = typeof update === 'function' ? update(previous) : update
      props.onSortingChange?.({ queryKey: props.result.key, sorting })
    },
    get columns() {
      return columns()
    },
  })
  const label = (id: string) =>
    Object.hasOwn(labels(), id)
      ? labels()[id]!
      : props.result.columns.find((column) => column.id === id)!.label
  const exportResult = () => {
    if (!props.available || props.exportDisabled || !props.onExport) return
    const visible = table.getVisibleColumns()
    if (!visible.length) return
    props.onExport({
      queryKey: props.result.key,
      columns: visible.map((column) => ({
        id: column.id,
        label: label(column.id),
      })),
      sorting: table.state.sorting.map((sort) => ({ ...sort })),
    })
  }
  const columnIds = createMemo(() =>
    table.getColumns().map((column) => column.id),
  )
  createEffect(
    () => Boolean(props.window),
    (browsing) => {
      if (!browsing && viewport) viewport.scrollTop = 0
    },
  )
  const virtualBody = () => (
    <QueryRows
      table={table}
      window={props.window}
      density={props.density}
      viewport={() => viewport ?? null}
    />
  )
  return (
    <div {...uiScope(props.density)} class="analytics-table">
      <div class="toolbar">
        <Show when={props.onExport}>
          <button
            type="button"
            disabled={
              !props.available ||
              props.exportDisabled ||
              !table.getVisibleColumns().length
            }
            ref={nativeEvents({ click: exportResult })}
          >
            {props.exportLabel ?? 'Export'}
          </button>
        </Show>
        <Show
          when={
            !props.window &&
            props.onLoadAll &&
            (props.result.totalRows === undefined ||
              props.result.totalRows > displayRows().length)
          }
        >
          <button
            type="button"
            disabled={!props.available}
            ref={nativeEvents({
              click: () => {
                if (props.available)
                  props.onLoadAll?.({
                    queryKey: props.result.key,
                    sorting: table.state.sorting.map((sort) => ({ ...sort })),
                  })
              },
            })}
          >
            Load all
          </button>
        </Show>
        <Show when={props.window && props.onShowPreview}>
          <button
            type="button"
            disabled={!props.available}
            ref={nativeEvents({
              click: () => {
                if (props.available)
                  props.onShowPreview?.({
                    queryKey: props.result.key,
                    sorting: table.state.sorting.map((sort) => ({ ...sort })),
                  })
              },
            })}
          >
            Show preview
          </button>
        </Show>
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
        <p role="status">
          {table.getRowIds().length}
          {props.result.totalRows === undefined
            ? ''
            : ` of ${props.result.totalRows}`}{' '}
          rows
        </p>
        <Show
          when={table.getVisibleColumns().length}
          fallback={<p>Show a column to view or export results.</p>}
        >
          <div
            style={{
              '--ui-row-height': `${uiDensity(props.density).rowHeight}px`,
            }}
            class={
              props.window ? 'table-scroll virtual-scroll' : 'table-scroll'
            }
            ref={(node) => {
              viewport = node
            }}
          >
            <TablePresentation
              table={table}
              accessibleLabel="Query results"
              grouped={false}
              renderBody={virtualBody}
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
                    sortingDisabled={!props.onSortingChange}
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
            <Show when={!table.getRowIds().length}>
              <p>The query returned no rows.</p>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  )
}
