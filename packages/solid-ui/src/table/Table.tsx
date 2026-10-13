import { For, Show, onCleanup } from 'solid-js'
import { nativeEvents } from '../utils/nativeEvents'
import { TableSort } from './TableSort'
import type { JSX } from '@solidjs/web'
import type { NativeColumn, NativeTable } from '@tanstack/solid-table/native'

export type TableEdge = {
  width: number
  header: () => JSX.Element
  group: () => JSX.Element
}

/** Shared presentation. Applications own data, processing and editing policy. */
export function Table<T, M>(props: {
  table: NativeTable<T, M>
  caption?: string
  accessibleLabel?: string
  label?: (column: NativeColumn<T, M>) => string
  header?: (column: NativeColumn<T, M>) => JSX.Element
  headerEnd?: (column: NativeColumn<T, M>) => JSX.Element
  summaryHeader?: (column: NativeColumn<T, M>) => JSX.Element
  ariaSort?: (column: NativeColumn<T, M>) => JSX.AriaAttributes['aria-sort']
  renderRow?: (id: string, grouped: boolean) => JSX.Element
  renderBody?: () => JSX.Element
  formatValue?: (value: unknown, column: NativeColumn<T, M>) => JSX.Element
  formatSummary?: (value: unknown, column: NativeColumn<T, M>) => JSX.Element
  groupLabel?: (id: string) => string
  grouped?: boolean
  canToggleGroup?: () => boolean
  leading?: TableEdge
  trailing?: TableEdge
  width?: number
  elementRef?: (element: HTMLTableElement) => void
  onGroupMount?: () => void
  onGroupCleanup?: () => void
  onGroupCell?: () => void
}) {
  const table = props.table
  const grouped = () => props.grouped ?? table.state.grouping.length > 0
  const label = (column: NativeColumn<T, M>) =>
    props.label?.(column) ?? String(column.columnDef?.header ?? column.id)
  return (
    <table
      ref={props.elementRef}
      tabindex="-1"
      aria-label={props.accessibleLabel}
      style={
        props.width === undefined ? undefined : { width: `${props.width}px` }
      }
    >
      <Show when={props.caption}>
        <caption>{props.caption}</caption>
      </Show>
      <Show when={props.width !== undefined}>
        <colgroup>
          <Show when={props.leading}>
            <col style={{ width: `${props.leading!.width}px` }} />
          </Show>
          <For each={table.getVisibleColumns()}>
            {(column) => (
              <col
                data-column-width={column.id}
                style={{ width: `${column.getSize()}px` }}
              />
            )}
          </For>
          <Show when={props.trailing}>
            <col style={{ width: `${props.trailing!.width}px` }} />
          </Show>
        </colgroup>
      </Show>
      <thead>
        <tr>
          {props.leading?.header()}
          <For each={table.getVisibleColumns()}>
            {(column) => (
              <th
                scope="col"
                data-column={column.id}
                data-column-header={column.id}
                class="column-header"
                aria-sort={
                  props.ariaSort
                    ? props.ariaSort(column)
                    : column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                }
              >
                <div class="column-heading">
                  {props.header ? (
                    props.header(column)
                  ) : (
                    <TableSort
                      label={label(column)}
                      sorted={column.getIsSorted()}
                      disabled={
                        table.options.manualProcessing ||
                        table.options.manualSorting ||
                        !column.columnDef?.sortFn
                      }
                      onSort={(multi) => column.toggleSorting(undefined, multi)}
                    />
                  )}
                </div>
                {props.headerEnd?.(column)}
              </th>
            )}
          </For>
          {props.trailing?.header()}
        </tr>
        <Show when={grouped() && props.summaryHeader}>
          <tr class="group-summary-headers">
            <Show when={props.leading}>
              <th class="sub-table-control" />
            </Show>
            <For each={table.getVisibleColumns()}>
              {(column) => (
                <th scope="col" data-summary-header={column.id}>
                  {props.summaryHeader!(column)}
                </th>
              )}
            </For>
            <Show when={props.trailing}>
              <th scope="col">-</th>
            </Show>
          </tr>
        </Show>
      </thead>
      <Show
        when={props.renderBody}
        keyed
        fallback={
          <Show
            when={grouped()}
            fallback={
              <For each={table.getRowIds()}>
                {(id) =>
                  props.renderRow ? (
                    props.renderRow(id, false)
                  ) : (
                    <TableRow
                      table={table}
                      id={id}
                      formatValue={props.formatValue}
                    />
                  )
                }
              </For>
            }
          >
            <For each={table.getDisplayKeys()}>
              {(key) => {
                const item = table.getDisplayItem(key)
                return item.kind === 'row' ? (
                  props.renderRow ? (
                    props.renderRow(item.id, true)
                  ) : (
                    <TableRow
                      table={table}
                      id={item.id}
                      formatValue={props.formatValue}
                    />
                  )
                ) : (
                  <TableGroup
                    table={table}
                    groupKey={item.key}
                    label={props.groupLabel}
                    formatSummary={props.formatSummary}
                    canToggle={props.canToggleGroup}
                    leading={props.leading?.group}
                    trailing={props.trailing?.group}
                    onMount={props.onGroupMount}
                    onCleanup={props.onGroupCleanup}
                    onCell={props.onGroupCell}
                  />
                )
              }}
            </For>
          </Show>
        }
      >
        {(renderBody) => renderBody()}
      </Show>
    </table>
  )
}

export function TableRow<T, M>(props: {
  table: NativeTable<T, M>
  id: string
  formatValue?: (value: unknown, column: NativeColumn<T, M>) => JSX.Element
  leading?: () => JSX.Element
  trailing?: () => JSX.Element
  detail?: () => JSX.Element
  onCell?: () => void
}) {
  const row = props.table.createRowView(props.id)
  return (
    <tbody>
      <tr data-row={props.id}>
        {props.leading?.()}
        <For each={row.getVisibleCells()}>
          {(cell) => {
            props.onCell?.()
            return (
              <td data-column={cell.column.id} class="read-only-value">
                {props.formatValue?.(cell.getValue(), cell.column) ??
                  String(cell.getValue() ?? '')}
              </td>
            )
          }}
        </For>
        {props.trailing?.()}
      </tr>
      {props.detail?.()}
    </tbody>
  )
}

function TableGroup<T, M>(props: {
  table: NativeTable<T, M>
  groupKey: string
  label?: (id: string) => string
  formatSummary?: (value: unknown, column: NativeColumn<T, M>) => JSX.Element
  canToggle?: () => boolean
  leading?: () => JSX.Element
  trailing?: () => JSX.Element
  onMount?: () => void
  onCleanup?: () => void
  onCell?: () => void
}) {
  const group = props.table.createGroupView(props.groupKey)
  props.onMount?.()
  onCleanup(() => props.onCleanup?.())
  const label = () =>
    group.path
      ?.map(
        (entry) =>
          `${props.label?.(entry.columnId) ?? entry.columnId}: ${entry.value == null || entry.value === '' ? '(none)' : String(entry.value)}`,
      )
      .join(' / ') ?? ''
  const valueLabel = () => {
    const value = group.path?.at(-1)?.value
    return value == null || value === '' ? '(none)' : String(value)
  }
  return (
    <tbody>
      <tr data-group={props.groupKey} class="group-row">
        {props.leading?.()}
        <For each={group.getVisibleCells()}>
          {(cell) => {
            props.onCell?.()
            const first = () => {
              const columnId = group.path?.at(-1)?.columnId
              const visible = props.table.getVisibleColumns()
              return (
                cell.column.id ===
                (visible.some((column) => column.id === columnId)
                  ? columnId
                  : visible[0]?.id)
              )
            }
            return (
              <td
                data-column={cell.column.id}
                role={first() ? 'rowheader' : undefined}
              >
                <Show when={first()}>
                  <div
                    class="group-heading"
                    style={{
                      'padding-left': `${Math.max(group.depth, 0) * 20}px`,
                    }}
                  >
                    <button
                      data-group-toggle={props.groupKey}
                      aria-expanded={group.getIsExpanded() ? 'true' : 'false'}
                      aria-label={`${group.getIsExpanded() ? 'Collapse' : 'Expand'} ${label()}`}
                      ref={nativeEvents({
                        click: () => {
                          if (props.canToggle?.() !== false)
                            group.toggleExpanded()
                        },
                      })}
                    >
                      <span aria-hidden="true">
                        {group.getIsExpanded() ? '▾' : '▸'}
                      </span>{' '}
                      {valueLabel()}
                    </button>
                    <span class="group-count">
                      {group.count} {group.count === 1 ? 'record' : 'records'}
                    </span>
                  </div>
                </Show>
                <Show when={cell.column.columnDef?.aggregationFn}>
                  <span
                    class="group-summary"
                    data-group-summary={cell.column.id}
                  >
                    {props.formatSummary?.(cell.getValue(), cell.column) ??
                      String(cell.getValue() ?? '—')}
                  </span>
                </Show>
              </td>
            )
          }}
        </For>
        {props.trailing?.()}
      </tr>
    </tbody>
  )
}
