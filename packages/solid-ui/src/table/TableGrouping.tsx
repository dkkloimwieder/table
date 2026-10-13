import { For, Show, onSettled } from 'solid-js'
import { nativeEvents } from '../utils/nativeEvents'
import type { NativeTable } from '@tanstack/solid-table/native'

export function TableGrouping<T, M>(props: {
  table: NativeTable<T, M>
  disabled?: boolean
  label: (id: string) => string
  groupable: (id: string) => boolean
  configureGrouping?: (ids: Array<string>) => void
  summaryChoices?: (
    id: string,
  ) => ReadonlyArray<{ value: string; label: string }> | undefined
  summary?: (id: string) => string | undefined
  setSummary?: (id: string, value: string) => void
}) {
  const table = props.table
  function configureGrouping(next: Array<string>) {
    if (props.configureGrouping) return props.configureGrouping(next)
    const previous = table.state.grouping
    const sorting = next.flatMap((id, depth) => {
      const order = table.state.groupSorting.find(
        (item) => item.depth === previous.indexOf(id),
      )
      return order ? [{ ...order, depth }] : []
    })
    table.setGrouping(next)
    table.setGroupSorting(sorting)
  }
  let addControl!: HTMLSelectElement
  const label = (id: string) => props.label(id)
  function move(id: string, offset: number) {
    const next = [...table.state.grouping]
    const from = next.indexOf(id)
    const to = from + offset
    if (from < 0 || to < 0 || to >= next.length) return
    ;[next[from], next[to]] = [next[to]!, next[from]!]
    configureGrouping(next)
  }
  function orderValue(depth: number, id: string) {
    const order = table.state.groupSorting.find((item) => item.depth === depth)
    return order
      ? `${order.id === id ? 'value' : order.id}:${order.desc ? 'desc' : 'asc'}`
      : ''
  }
  function setOrder(depth: number, id: string, value: string) {
    const [column, direction] = value.split(':')
    table.setGroupSorting((old) => {
      const rest = old.filter((item) => item.depth !== depth)
      return value
        ? [
            ...rest,
            {
              depth,
              id: column === 'value' ? id : column!,
              desc: direction === 'desc',
            },
          ]
        : rest
    })
  }
  return (
    <fieldset class="grouping-controls" disabled={props.disabled}>
      <legend>Group records</legend>
      <div class="grouping-toolbar">
        <label>
          Add grouping
          <select
            value=""
            ref={[
              (node) => {
                addControl = node
              },
              nativeEvents<HTMLSelectElement>({
                change: (event) => {
                  const id = event.currentTarget.value
                  if (id && !table.state.grouping.includes(id))
                    configureGrouping([...table.state.grouping, id])
                  event.currentTarget.value = ''
                },
              }),
            ]}
          >
            <option value="">Choose a column</option>
            <For each={table.getColumns()}>
              {(column) => (
                <Show when={props.groupable(column.id)}>
                  <option
                    value={column.id}
                    disabled={table.state.grouping.includes(column.id)}
                  >
                    {label(column.id)}
                  </option>
                </Show>
              )}
            </For>
          </select>
        </label>
        <Show when={table.state.grouping.length > 0}>
          <button
            ref={nativeEvents({
              click: () => table.toggleAllGroupsExpanded(true),
            })}
          >
            Expand all groups
          </button>
          <button
            ref={nativeEvents({
              click: () => table.toggleAllGroupsExpanded(false),
            })}
          >
            Collapse all groups
          </button>
          <button
            ref={nativeEvents({
              click: () => {
                addControl.focus()
                configureGrouping([])
              },
            })}
          >
            Clear grouping
          </button>
        </Show>
      </div>
      <Show when={table.state.grouping.length > 0}>
        <ol class="grouping-levels" aria-label="Grouping levels">
          <For each={table.state.grouping}>
            {(id, index) => {
              let orderControl!: HTMLSelectElement
              return (
                <li data-group-level={id}>
                  <span class="grouping-level-label">
                    {index() + 1}. {label(id)}
                  </span>
                  <button
                    aria-label={`Move ${label(id)} up`}
                    disabled={index() === 0}
                    ref={nativeEvents({
                      click: () => {
                        orderControl.focus()
                        move(id, -1)
                        onSettled(() => orderControl.focus())
                      },
                    })}
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${label(id)} down`}
                    disabled={index() === table.state.grouping.length - 1}
                    ref={nativeEvents({
                      click: () => {
                        orderControl.focus()
                        move(id, 1)
                        onSettled(() => orderControl.focus())
                      },
                    })}
                  >
                    ↓
                  </button>
                  <label>
                    Order {label(id)} groups
                    <select
                      value={orderValue(index(), id)}
                      ref={[
                        (node) => {
                          orderControl = node
                        },
                        nativeEvents<HTMLSelectElement>({
                          change: (event) =>
                            setOrder(index(), id, event.currentTarget.value),
                        }),
                      ]}
                    >
                      <option value="">Record order</option>
                      <option value="value:asc">Group value: ascending</option>
                      <option value="value:desc">
                        Group value: descending
                      </option>
                      <For each={table.getColumns()}>
                        {(column) => (
                          <Show
                            when={
                              column.id !== id &&
                              props.summaryChoices?.(column.id)
                            }
                          >
                            <option
                              value={`${column.id}:asc`}
                              disabled={props.summary?.(column.id) === 'none'}
                            >
                              {String(column.columnDef?.header)} summary:
                              ascending
                            </option>
                            <option
                              value={`${column.id}:desc`}
                              disabled={props.summary?.(column.id) === 'none'}
                            >
                              {String(column.columnDef?.header)} summary:
                              descending
                            </option>
                          </Show>
                        )}
                      </For>
                    </select>
                  </label>
                  <button
                    aria-label={`Expand ${label(id)} level`}
                    ref={nativeEvents({
                      click: () => table.toggleAllGroupsExpanded(true, index()),
                    })}
                  >
                    Expand level
                  </button>
                  <button
                    aria-label={`Collapse ${label(id)} level`}
                    ref={nativeEvents({
                      click: () =>
                        table.toggleAllGroupsExpanded(false, index()),
                    })}
                  >
                    Collapse level
                  </button>
                  <button
                    aria-label={`Remove ${label(id)} grouping`}
                    ref={nativeEvents({
                      click: () => {
                        addControl.focus()
                        configureGrouping(
                          table.state.grouping.filter(
                            (column) => column !== id,
                          ),
                        )
                      },
                    })}
                  >
                    Remove
                  </button>
                </li>
              )
            }}
          </For>
        </ol>
        <Show when={props.setSummary}>
          <div
            class="summary-controls"
            role="group"
            aria-label="Column summaries"
          >
            <For each={table.getColumns()}>
              {(column) => (
                <label>
                  {String(column.columnDef?.header)} summary
                  <select
                    value={props.summary?.(column.id)}
                    ref={nativeEvents<HTMLSelectElement>({
                      change: (event) =>
                        props.setSummary?.(
                          column.id,
                          event.currentTarget.value,
                        ),
                    })}
                  >
                    <For each={props.summaryChoices?.(column.id)}>
                      {(choice) => (
                        <option value={choice.value}>{choice.label}</option>
                      )}
                    </For>
                  </select>
                </label>
              )}
            </For>
          </div>
          <p class="summary-help">
            Summaries use saved, filtered records, including collapsed rows.
            First and last follow the table sort order. Range shows both
            endpoints. Span shows their difference.
          </p>
        </Show>
      </Show>
    </fieldset>
  )
}
