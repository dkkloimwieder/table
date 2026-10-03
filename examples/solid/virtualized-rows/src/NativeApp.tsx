import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createStore,
  onCleanup,
  onSettled,
} from 'solid-js'
import { createTable, nativeAggregations } from '@tanstack/solid-table/native'
import { createKeyedVirtualizer } from '../../_shared/createKeyedVirtualizer'
import { createNativeGridInteraction } from './createNativeGridInteraction'
import { nativeEvents } from './nativeEvents'
import type { NativeTable } from '@tanstack/solid-table/native'
import './native.css'

export type NativePerson = {
  id: string
  name: string
  region: string
  amount: number
  description: string
  unused: number
}
export function makeNativePerson(index: number): NativePerson {
  return {
    id: `r${index}`,
    name: `Person ${index}`,
    region: `Region ${index % 5}`,
    amount: index % 100,
    description: `Record ${index}. A description that can wrap when this column becomes narrow.`,
    unused: 0,
  }
}
export interface NativeDemoController {
  table: NativeTable<NativePerson>
  viewport: HTMLElement
  virtualizer: ReturnType<typeof createKeyedVirtualizer>
  edit: (id: string, update: Partial<NativePerson>) => void
  append: () => void
  remove: (id: string) => void
  replace: () => void
  setEmpty: (empty: boolean) => void
  setBusy: (busy: boolean) => void
  interaction: ReturnType<typeof createNativeGridInteraction>
  stats: () => { rows: number; cells: number; unmounts: number; reads: number }
}

export default function NativeApp(props: {
  size?: number
  extraColumns?: number
  onReady?: (controller: NativeDemoController) => void
}) {
  const size = props.size ?? 10_000
  const initial = Array.from({ length: size }, (_, i) => makeNativePerson(i))
  const [records, setRecords] = createStore<
    Record<string, NativePerson | undefined>
  >(Object.fromEntries(initial.map((row) => [row.id, row])))
  const [ids, setIds] = createSignal(initial.map((row) => row.id))
  const [busy, setBusy] = createSignal(false)
  const counts = { rows: 0, cells: 0, unmounts: 0, reads: 0 }
  const read = (key: keyof NativePerson) => (record: NativePerson) => {
    counts.reads++
    return record[key]
  }
  const table = createTable({
    source: { ids, get: (id) => records[id] },
    columns: [
      { id: 'id', accessorFn: read('id'), header: 'ID', size: 100 },
      { id: 'name', accessorFn: read('name'), header: 'Name', size: 180 },
      { id: 'region', accessorFn: read('region'), header: 'Region', size: 130 },
      {
        id: 'description',
        accessorFn: read('description'),
        header: 'Description',
        size: 330,
      },
      {
        id: 'amount',
        accessorFn: read('amount'),
        header: 'Amount',
        size: 110,
        sortFn: (a, b) => Number(a) - Number(b),
        filterFn: (a, b) => Number(a) >= Number(b),
        aggregationFn: nativeAggregations.sum,
      },
      ...Array.from({ length: props.extraColumns ?? 0 }, (_, i) => ({
        id: `extra_${i}`,
        accessorFn: read('name'),
        header: `Extra ${i + 1}`,
        size: 160,
      })),
    ],
    initialState: { columnPinning: { start: ['id'], end: ['amount'] } },
    get manualProcessing() {
      return busy()
    },
  })
  let viewport: HTMLDivElement | undefined
  let header!: HTMLDivElement
  let top!: HTMLDivElement
  let bottom!: HTMLDivElement
  let recordProbe!: HTMLDivElement
  let groupProbe!: HTMLDivElement
  const [estimates, setEstimates] = createSignal({ row: 48, group: 36 })
  const [insets, setInsets] = createSignal({ top: 36, bottom: 0 })
  onSettled(() => {
    const measure = () =>
      setInsets({
        top: header.offsetHeight + top.offsetHeight,
        bottom: bottom.offsetHeight,
      })
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    observer.observe(top)
    observer.observe(bottom)
    measure()
    return () => observer.disconnect()
  })
  const width = createMemo(() =>
    table
      .getVisibleColumns()
      .reduce((sum, column) => sum + column.getSize(), 0),
  )
  onSettled(() => {
    const measure = () => {
      const next = {
        row: recordProbe.offsetHeight,
        group: groupProbe.offsetHeight,
      }
      setEstimates((previous) =>
        previous.row === next.row && previous.group === next.group
          ? previous
          : next,
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(recordProbe)
    observer.observe(groupProbe)
    measure()
    return () => observer.disconnect()
  })
  const layout = createMemo(() =>
    table
      .getVisibleColumns()
      .map((column) => `${column.id}:${column.getSize()}`)
      .join('|'),
  )
  const virtualizer = createKeyedVirtualizer({
    get keys() {
      return table.getRowSections().center
    },
    getScrollElement: () => viewport ?? null,
    get estimateSize() {
      const sizes = estimates()
      return (key: string) =>
        table.getDisplayItem(key).kind === 'group' ? sizes.group : sizes.row
    },
    overscan: 5,
    get scrollMargin() {
      return insets().top
    },
    get scrollPaddingEnd() {
      return insets().bottom
    },
    get measurementVersion() {
      return `${layout()}:${estimates().row}:${estimates().group}`
    },
  })
  const columnStyle = (id: string) => {
    const column = table.getColumn(id)!
    const pinned = column.getIsPinned()
    const columns = table.getVisibleColumns()
    const index = columns.findIndex((item) => item.id === id)
    const offset =
      pinned === 'start'
        ? columns
            .slice(0, index)
            .filter((item) => item.getIsPinned() === 'start')
            .reduce((sum, item) => sum + item.getSize(), 0)
        : pinned === 'end'
          ? columns
              .slice(index + 1)
              .filter((item) => item.getIsPinned() === 'end')
              .reduce((sum, item) => sum + item.getSize(), 0)
          : 0
    return {
      width: `${column.getSize()}px`,
      'min-width': `${column.getSize()}px`,
      position: pinned ? ('sticky' as const) : undefined,
      left: pinned === 'start' ? `${offset}px` : undefined,
      right: pinned === 'end' ? `${offset}px` : undefined,
      'z-index': pinned ? 2 : undefined,
    }
  }
  let next = size
  const append = () => {
    const row = makeNativePerson(next++)
    setRecords((draft) => {
      draft[row.id] = row
    })
    setIds((old) => [...old, row.id])
  }
  const replace = () =>
    setRecords((draft) => {
      for (const id of ids())
        draft[id] = { ...draft[id]!, amount: (draft[id]!.amount + 1) % 100 }
    })
  const interaction = createNativeGridInteraction({
    table,
    viewport: () => viewport,
    virtualizer,
    get: (id) => records[id],
    saveName: (id, name) =>
      setRecords((draft) => {
        draft[id]!.name = name
      }),
  })
  const NameEditor = (props: { id: string }) => {
    let input!: HTMLInputElement
    createEffect(
      () => props.id,
      (id) => interaction.focusEditor(input, id),
    )
    const inputEvents = nativeEvents<HTMLInputElement>({
      input: (event) => interaction.change(props.id, event.currentTarget.value),
      keydown: (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          interaction.save()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          interaction.cancel()
        }
      },
    })
    return (
      <input
        ref={(element) => {
          input = element
          inputEvents(element)
        }}
        data-editor={props.id}
        aria-label={`Name for ${props.id}`}
        value={interaction.drafts[props.id]?.value ?? ''}
      />
    )
  }
  const controller = (): NativeDemoController => ({
    table,
    interaction,
    viewport: viewport!,
    virtualizer,
    edit: (id, update) =>
      setRecords((draft) => {
        if (draft[id]) Object.assign(draft[id], update)
      }),
    append,
    remove: (id) => {
      setIds((old) => old.filter((key) => key !== id))
      setRecords((draft) => {
        delete draft[id]
      })
    },
    replace,
    setEmpty: (empty) => setIds(empty ? [] : Object.keys(records)),
    setBusy,
    stats: () => ({ ...counts }),
  })
  onSettled(() => {
    props.onReady?.(controller())
  })
  const Row = (rowProps: {
    itemKey: string
    section: 'top' | 'center' | 'bottom'
  }) => {
    const key = rowProps.itemKey
    const item = table.getDisplayItem(key)
    const view =
      item.kind === 'row'
        ? table.createRowView(item.id)
        : table.createGroupView(item.key)
    let element: HTMLDivElement | undefined
    counts.rows++
    onCleanup(() => {
      counts.unmounts++
      if (element?.contains(document.activeElement))
        viewport?.focus({ preventScroll: true })
    })
    if (rowProps.section === 'center')
      virtualizer.observeRow(() => element, key)
    const group = item.kind === 'group' ? table.getGroup(item.key) : undefined
    const row = item.kind === 'row' ? table.getRow(item.id) : undefined
    const position = () => {
      const sections = table.getRowSections()
      return rowProps.section === 'top'
        ? sections.top.indexOf(key)
        : rowProps.section === 'bottom'
          ? sections.top.length +
            sections.center.length +
            sections.bottom.indexOf(key)
          : sections.top.length + (virtualizer.getItem(key)?.index ?? 0)
    }
    return (
      <div
        ref={element}
        class={`native-row${group ? ' native-group' : ''}${row?.getIsSelected() ? ' selected' : ''}`}
        data-key={key}
        data-kind={item.kind}
        data-section={rowProps.section}
        role="row"
        aria-rowindex={position() + 2}
        aria-selected={
          row ? (row.getIsSelected() ? 'true' : 'false') : undefined
        }
        style={{ width: `${width()}px` }}
      >
        <div class="native-cells">
          <For each={view.getVisibleCells()}>
            {(cell) => {
              counts.cells++
              return (
                <div
                  ref={nativeEvents({
                    click: (event) => {
                      if (!(event.target instanceof HTMLInputElement))
                        interaction.focus({ key, column: cell.column.id })
                    },
                    dblclick: () => {
                      if (item.kind === 'row' && cell.column.id === 'name')
                        interaction.begin(item.id)
                    },
                  })}
                  role="gridcell"
                  id={interaction.cellId(key, cell.column.id)}
                  aria-colindex={
                    table
                      .getVisibleColumns()
                      .findIndex((column) => column.id === cell.column.id) + 1
                  }
                  data-active={
                    interaction.active()?.key === key &&
                    interaction.active()?.column === cell.column.id
                      ? ''
                      : undefined
                  }
                  data-column={cell.column.id}
                  class="native-cell"
                  style={columnStyle(cell.column.id)}
                >
                  <Show
                    when={cell.column.id === 'id' && group}
                    fallback={
                      <Show
                        when={cell.column.id === 'id' && row}
                        fallback={
                          <Show
                            when={
                              item.kind === 'row' &&
                              cell.column.id === 'name' &&
                              interaction.editing() === item.id
                            }
                            fallback={String(cell.getValue() ?? '')}
                          >
                            <NameEditor
                              id={item.kind === 'row' ? item.id : ''}
                            />
                          </Show>
                        }
                      >
                        <button
                          ref={nativeEvents({
                            click: () => row!.toggleSelected(),
                          })}
                          aria-label={`Select ${item.kind === 'row' ? item.id : ''}`}
                        >
                          {String(cell.getValue())}
                        </button>
                      </Show>
                    }
                  >
                    <button
                      ref={nativeEvents({
                        click: () => group!.toggleExpanded(),
                      })}
                      aria-label="Toggle group"
                    >
                      {group!.getIsExpanded() ? '−' : '+'} {group!.count}
                    </button>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
        <Show when={row?.getIsExpanded()}>
          <div class="native-detail">
            Details for {item.kind === 'row' ? item.id : ''}. This content
            changes the measured row height.
          </div>
        </Show>
      </div>
    )
  }
  const viewportEvents = nativeEvents<HTMLDivElement>({
    keydown: interaction.keydown,
  })
  return (
    <main class="native-demo">
      <div
        class="native-measure"
        aria-hidden="true"
        style={{ width: `${width()}px` }}
      >
        <div ref={recordProbe} class="native-row">
          <div class="native-cells">
            <For each={table.getVisibleColumns()}>
              {(column) => (
                <div
                  class="native-cell"
                  style={{ width: `${column.getSize()}px` }}
                >
                  {column.id === 'description' ? (
                    'Record 99999. A description that can wrap when this column becomes narrow.'
                  ) : column.id === 'id' ? (
                    <button tabindex={-1}>r99999</button>
                  ) : (
                    'Sample'
                  )}
                </div>
              )}
            </For>
          </div>
        </div>
        <div ref={groupProbe} class="native-row native-group">
          <div class="native-cells">
            <div class="native-cell">
              <button tabindex={-1}>+ 100</button>
            </div>
          </div>
        </div>
      </div>
      <h1>Native Solid table</h1>
      <div class="native-controls">
        <button
          ref={nativeEvents({
            click: () => table.getColumn('amount')!.toggleSorting(),
          })}
        >
          Sort amounts
        </button>
        <button
          ref={nativeEvents({
            click: () =>
              table
                .getColumn('amount')!
                .setFilterValue(
                  table.getColumn('amount')!.getFilterValue() === undefined
                    ? 50
                    : undefined,
                ),
          })}
        >
          Filter amounts
        </button>
        <button
          ref={nativeEvents({
            click: () =>
              table.setGrouping(table.state.grouping.length ? [] : ['region']),
          })}
        >
          Group regions
        </button>
        <button
          ref={nativeEvents({
            click: () => table.toggleAllGroupsExpanded(true),
          })}
        >
          Expand groups
        </button>
        <button
          ref={nativeEvents({
            click: () =>
              table
                .getRow('r0')
                .pin(table.getRow('r0').getIsPinned() ? false : 'top'),
          })}
        >
          Pin first record
        </button>
        <button ref={nativeEvents({ click: append })}>Append record</button>
        <button ref={nativeEvents({ click: replace })}>Refresh amounts</button>
      </div>
      <p>
        {ids().length.toLocaleString()} loaded records. Use arrow keys to move.
        Press Enter in a name cell to edit.
      </p>
      <Show when={interaction.editing()}>
        {(id) => (
          <div class="native-editor-actions">
            <span>Editing {id()}</span>
            <button ref={nativeEvents({ click: interaction.save })}>
              Save edit
            </button>
            <button ref={nativeEvents({ click: interaction.cancel })}>
              Cancel edit
            </button>
            <label>
              <input
                ref={nativeEvents({
                  change: (event) =>
                    interaction.setRefuseNext(event.currentTarget.checked),
                })}
                type="checkbox"
                checked={interaction.refuseNext()}
              />
              Refuse next save (demo)
            </label>
            <Show when={interaction.drafts[id()]?.message}>
              {(message) => <span role="alert">{message()}</span>}
            </Show>
          </div>
        )}
      </Show>
      <div
        ref={(element) => {
          viewport = element
          viewportEvents(element)
        }}
        class="native-viewport"
        role="grid"
        tabindex={0}
        aria-label="People"
        aria-activedescendant={interaction.activeDescendant()}
        aria-busy={busy() ? 'true' : 'false'}
        aria-rowcount={
          table.getRowSections().top.length +
          table.getRowSections().center.length +
          table.getRowSections().bottom.length +
          1
        }
        aria-colcount={table.getVisibleColumns().length}
      >
        <div
          ref={header}
          class="native-header"
          role="row"
          aria-rowindex={1}
          style={{ width: `${width()}px` }}
        >
          <For each={table.getVisibleColumns()}>
            {(column) => (
              <div
                role="columnheader"
                class="native-cell"
                data-column={column.id}
                style={columnStyle(column.id)}
              >
                {String(column.columnDef?.header ?? column.id)}
              </div>
            )}
          </For>
        </div>
        <div
          ref={top}
          class="native-pinned native-top"
          style={{ top: '36px', width: `${width()}px` }}
        >
          <For each={table.getRowSections().top}>
            {(key) => <Row itemKey={key} section="top" />}
          </For>
        </div>
        <div
          class="native-body"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: `${width()}px`,
          }}
        >
          <div
            class="native-window"
            style={{ transform: `translateY(${virtualizer.getStart()}px)` }}
          >
            <For each={virtualizer.getKeys()}>
              {(key) => <Row itemKey={key} section="center" />}
            </For>
          </div>
        </div>
        <div
          ref={bottom}
          class="native-pinned native-bottom"
          style={{ width: `${width()}px` }}
        >
          <For each={table.getRowSections().bottom}>
            {(key) => <Row itemKey={key} section="bottom" />}
          </For>
        </div>
        <Show
          when={
            !table.getRowSections().top.length &&
            !table.getRowSections().center.length &&
            !table.getRowSections().bottom.length
          }
        >
          <div role="status">{busy() ? 'Loading records…' : 'No records'}</div>
        </Show>
      </div>
    </main>
  )
}
