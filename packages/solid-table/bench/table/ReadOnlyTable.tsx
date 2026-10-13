import { For, Show, createMemo } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { TableSort } from './TableSort'
import { Table } from './Table'
import { TableFilter } from './TableFilter'
import { TableGrouping } from './TableGrouping'
import { TableColumnMove, moveColumn } from './TableColumnMove'
import type { JSX } from '@solidjs/web'
import type { NativeColumn, NativeTable } from '@tanstack/solid-table/native'

/** Full display features over an application-owned table, without editing state. */
export function ReadOnlyTable<T, M>(props: {
  table: NativeTable<T, M>
  title?: string
  controls?: {
    sorting?: boolean
    filtering?: boolean
    search?: boolean
    grouping?: boolean
    columnReordering?: boolean
  }
  label?: (column: NativeColumn<T, M>) => string
  groupable?: (id: string) => boolean
  formatValue?: (value: unknown, column: NativeColumn<T, M>) => JSX.Element
  formatSummary?: (value: unknown, column: NativeColumn<T, M>) => JSX.Element
}) {
  const table = props.table
  const label = (column: NativeColumn<T, M>) =>
    props.label?.(column) ?? String(column.columnDef?.header ?? column.id)
  const processing = () => !table.options.manualProcessing
  const movable = createMemo(() =>
    table
      .getVisibleColumns()
      .filter(
        (column) =>
          !column.getIsPinned() && !table.state.grouping.includes(column.id),
      )
      .map((column) => column.id),
  )
  return (
    <section
      data-ui=""
      class="table-component"
      aria-label={props.title ?? 'Read-only table'}
    >
      <Show when={props.controls?.filtering !== false}>
        <div class="column-filters" role="region" aria-label="Column filters">
          <For each={table.getColumns()}>
            {(column) => (
              <TableFilter
                label={`Filter ${label(column)}`}
                clearLabel={`Clear ${label(column)} filter`}
                value={String(column.getFilterValue() ?? '')}
                disabled={
                  !processing() ||
                  table.options.manualFiltering ||
                  !column.columnDef?.filterFn
                }
                onValueChange={(value) =>
                  column.setFilterValue(value || undefined)
                }
              />
            )}
          </For>
        </div>
      </Show>
      <Show when={props.controls?.search !== false}>
        <div class="toolbar">
          <TableFilter
            label="Search all columns"
            clearLabel="Clear search"
            search
            value={table.state.globalFilter}
            disabled={!processing() || table.options.manualFiltering}
            onValueChange={(value) => table.setGlobalFilter(value)}
          />
        </div>
      </Show>
      <Show when={props.controls?.grouping !== false}>
        <TableGrouping
          table={table}
          disabled={!processing() || table.options.manualGrouping}
          label={(id) => label(table.getColumn(id)!)}
          groupable={(id) => props.groupable?.(id) ?? true}
        />
      </Show>
      <details class="display-options">
        <summary>Display columns</summary>
        <fieldset class="display-fields">
          <legend>Visible columns</legend>
          <For each={table.getColumns()}>
            {(column) => (
              <label class="check-option">
                <input
                  type="checkbox"
                  checked={column.getIsVisible()}
                  disabled={column.columnDef?.enableHiding === false}
                  ref={nativeEvents<HTMLInputElement>({
                    change: (event) =>
                      column.toggleVisibility(event.currentTarget.checked),
                  })}
                />
                Show {label(column)}
              </label>
            )}
          </For>
        </fieldset>
      </details>
      <p role="status">
        {table.getFilteredRowIds().length} of {table.getSourceIds().length}{' '}
        records
      </p>
      <div class="table-scroll">
        <Table
          table={table}
          caption={props.title ?? 'Read-only records'}
          grouped={
            processing() &&
            !table.options.manualGrouping &&
            table.state.grouping.length > 0
          }
          label={label}
          groupLabel={(id) => label(table.getColumn(id)!)}
          formatValue={props.formatValue}
          formatSummary={props.formatSummary}
          header={(column) => (
            <>
              <Show
                when={
                  props.controls?.columnReordering !== false &&
                  movable().includes(column.id)
                }
              >
                <TableColumnMove
                  id={column.id}
                  label={label(column)}
                  ids={movable()}
                  onMove={(destination) =>
                    table.setColumnOrder((old) => [
                      ...moveColumn(
                        [
                          ...new Set([
                            ...old,
                            ...table.getColumns().map((item) => item.id),
                          ]),
                        ],
                        column.id,
                        destination,
                      ),
                    ])
                  }
                />
              </Show>
              <Show
                when={props.controls?.sorting !== false}
                fallback={<span class="column-title">{label(column)}</span>}
              >
                <TableSort
                  label={label(column)}
                  sorted={column.getIsSorted()}
                  disabled={
                    !processing() ||
                    table.options.manualSorting ||
                    !column.columnDef?.sortFn
                  }
                  onSort={(multi) => column.toggleSorting(undefined, multi)}
                />
              </Show>
            </>
          )}
        />
      </div>
      <Show when={!table.getFilteredRowIds().length}>
        <p>
          {table.getSourceIds().length
            ? 'No records match your search or filters.'
            : 'No records yet.'}
        </p>
      </Show>
    </section>
  )
}
