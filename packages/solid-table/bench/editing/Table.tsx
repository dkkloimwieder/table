import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  flush,
  onCleanup,
  onSettled,
  untrack,
} from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { TableFilter } from './TableFilter'
import { TableGrouping } from './TableGrouping'
import { TableColumnResize } from './TableColumnResize'
import { TableColumnMove, moveColumn } from './TableColumnMove'
import type { JSX } from '@solidjs/web'
import type { EditingModel } from './model'
import type { EditColumn } from './createEditing'
import './style.css'

export type SaveMode = 'row' | 'table'
export type TableControls = {
  filters: 'external' | 'headers' | 'both' | 'none'
  headerSorting: boolean
  globalSearch: boolean
  grouping: boolean
  columnResizing: boolean
  columnReordering: boolean
  resizeBehavior: 'grow' | 'fixed'
}

function sameIds(left: ReadonlyArray<string>, right: ReadonlyArray<string>) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  )
}

const filterLabels: Record<string, string> = {
  id: 'Filter record IDs',
  name: 'Filter saved names',
  note: 'Filter saved notes',
  priority: 'Filter priority',
  amount: 'Filter amounts',
  dueDate: 'Filter due dates',
}
const priorityChoices = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

export function Table(props: {
  model: EditingModel
  title?: string
  scope?: string
  controls?: Partial<TableControls>
  settings?: JSX.Element
  details?: {
    expanded: (id: string) => boolean
    draftCount: (id: string) => number
    toggle: (id: string) => void
    render: (id: string) => JSX.Element
  }
  ready?: (model: EditingModel) => void
}) {
  const model = untrack(() => props.model)
  const { table, editing, counts, saveMode, setSaveMode, isGrouped } = model
  const domPrefix = createUniqueId()
  const domId = (value: string) => `${domPrefix}-${value}`
  let externalFilter: HTMLInputElement | undefined
  let headerFilter: HTMLInputElement | undefined
  let search: HTMLInputElement | undefined
  let element!: HTMLTableElement
  let modeControl!: HTMLSelectElement
  let saveAllButton!: HTMLButtonElement
  let disposed = false
  let focusIntent = 0
  let activeId: string | undefined
  let restoringColumnFocus: HTMLElement | undefined
  const [notice, setNotice] = createSignal('')
  const tableWidth = createMemo(() =>
    table
      .getVisibleColumns()
      .reduce((sum, column) => sum + column.getSize(), 230),
  )
  // One DOM effect updates structural row controls. Each row must not subscribe
  // to a table-wide lock; that would fan out to every rendered row per edit.
  createEffect(
    () => ({ locked: model.locked(), keys: table.getDisplayKeys() }),
    ({ locked }) => {
      for (const button of element.querySelectorAll<HTMLButtonElement>(
        '[data-group-toggle], [data-subtable-toggle]',
      ))
        if (button.closest('table') === element) button.disabled = locked
    },
  )
  const draftIds = createMemo(
    () => (isGrouped() ? [] : Object.keys(editing.drafts)),
    {
      equals: sameIds,
    },
  )
  const movableColumns = createMemo(
    () =>
      table
        .getVisibleColumns()
        .filter(
          (column) =>
            !column.getIsPinned() &&
            (!isGrouped() || !table.state.grouping.includes(column.id)),
        )
        .map((column) => column.id),
    { equals: sameIds },
  )
  // Capture focus in the read phase, before keyed DOM moves. Restore only
  // focus lost by that move, after owned effects finish, without changing drafts.
  createEffect(
    () => {
      const columns = table.getVisibleColumns()
      const focused = document.activeElement
      return {
        columns,
        focused:
          focused instanceof HTMLElement && focused.closest('table') === element
            ? focused
            : undefined,
        selection:
          focused instanceof HTMLInputElement && focused.type === 'text'
            ? ([
                focused.selectionStart,
                focused.selectionEnd,
                focused.selectionDirection,
              ] as const)
            : undefined,
        intent: focusIntent,
      }
    },
    ({ focused, selection, intent }) => {
      if (
        !focused?.isConnected ||
        (document.activeElement !== document.body &&
          document.activeElement !== focused)
      )
        return
      if (document.activeElement !== focused) restoringColumnFocus = focused
      queueMicrotask(() => {
        restoringColumnFocus = undefined
        if (
          disposed ||
          intent !== focusIntent ||
          !focused.isConnected ||
          (document.activeElement !== document.body &&
            document.activeElement !== focused)
        )
          return
        if (document.activeElement !== focused) {
          focused.focus({ preventScroll: true })
          if (selection && focused instanceof HTMLInputElement)
            focused.setSelectionRange(
              selection[0],
              selection[1],
              selection[2] ?? undefined,
            )
        }
        focused.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    },
  )
  function ColumnMove(props: {
    column: ReturnType<EditingModel['table']['getColumns']>[number]
  }) {
    return (
      <Show when={movableColumns().includes(props.column.id)}>
        <TableColumnMove
          id={props.column.id}
          label={String(props.column.columnDef?.header)}
          disabled={model.locked()}
          ids={movableColumns()}
          onMove={(destination) => {
            const id = props.column.id
            if (
              !movableColumns().includes(id) ||
              !movableColumns().includes(destination.id)
            )
              return
            table.setColumnOrder((old) => {
              const order = [...new Set([...old, ...model.columnIds])]
              return [...moveColumn(order, id, destination)]
            })
            setNotice(
              `${String(props.column.columnDef?.header)} column moved ${destination.side} ${String(table.getColumn(destination.id)?.columnDef?.header)}.`,
            )
          }}
          onActivity={(event, listeners) => {
            counts.reorderListeners += listeners
            if (event === 'start') counts.reorderStarts++
            if (event === 'move') counts.reorderMoves++
            if (event === 'cancel') counts.reorderCancels++
          }}
        />
      </Show>
    )
  }
  function ColumnResize(props: {
    column: ReturnType<EditingModel['table']['getColumns']>[number]
    fixed: boolean
  }) {
    const neighbor = createMemo(() => {
      if (!props.fixed) return undefined
      const columns = table.getVisibleColumns()
      const next =
        columns[
          columns.findIndex((column) => column.id === props.column.id) + 1
        ]
      return next?.columnDef?.enableResizing === false ? undefined : next
    })
    const bounds = createMemo(
      () => {
        const column = props.column
        const minimum = column.columnDef?.minSize ?? 20
        const maximum = Math.max(
          minimum,
          column.columnDef?.maxSize ?? Number.MAX_SAFE_INTEGER,
        )
        const next = neighbor()
        if (!next) return [minimum, maximum] as const
        const nextMin = next.columnDef?.minSize ?? 20
        const nextMax = Math.max(
          nextMin,
          next.columnDef?.maxSize ?? Number.MAX_SAFE_INTEGER,
        )
        const total = column.getSize() + next.getSize()
        return [
          Math.max(minimum, total - nextMax),
          Math.min(maximum, total - nextMin),
        ] as const
      },
      { equals: (left, right) => left[0] === right[0] && left[1] === right[1] },
    )
    return (
      <Show when={!props.fixed || neighbor()}>
        <TableColumnResize
          label={String(props.column.columnDef?.header)}
          disabled={model.locked()}
          size={props.column.getSize()}
          min={bounds()[0]}
          max={bounds()[1]}
          onSizeChange={(size) => {
            const column = props.column
            const next = neighbor()
            const nextSize = next
              ? next.getSize() + column.getSize() - size
              : undefined
            table.setColumnSizing((old) => ({
              ...old,
              [column.id]: size,
              ...(next ? { [next.id]: nextSize! } : {}),
            }))
          }}
          onActivity={(event, listeners) => {
            counts.resizeListeners += listeners
            if (event === 'start') counts.resizeStarts++
            if (event === 'move') counts.resizeMoves++
            if (event === 'change') counts.resizeChanges++
            if (event === 'cancel') counts.resizeCancels++
          }}
        />
      </Show>
    )
  }
  function belongsToRow(id: string, target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest<HTMLTableRowElement>('tr[data-row]')?.dataset.row === id &&
      target.closest('table') === element
    )
  }
  function collapseOutside(target: EventTarget | null) {
    if (!activeId || belongsToRow(activeId, target)) return
    const id = activeId
    activeId = undefined
    // Focus can move from row cleanup. Write only after that owned scope ends.
    queueMicrotask(() => {
      if (!disposed && activeId !== id) editing.collapse(id)
    })
  }
  onCleanup(() => {
    disposed = true
    focusIntent++
  })
  onSettled(() => {
    props.ready?.(model)
  })
  createEffect(
    () => !isGrouped(),
    (enabled) => {
      if (!enabled) return
      let pointerActive = false
      let pointerFrame = 0
      const startPointer = () => {
        focusIntent++
        pointerActive = true
        cancelAnimationFrame(pointerFrame)
      }
      const endPointer = () => {
        pointerActive = false
        // A collapse on pointerdown can move the clicked cell before pointerup.
        pointerFrame = requestAnimationFrame(() => {
          if (!disposed && document.activeElement !== document.body)
            collapseOutside(document.activeElement)
        })
      }
      const clickOutside = (event: Event) => {
        const id = activeId
        if (!id || belongsToRow(id, event.target)) return
        // A click handler can open another row or replace its display button.
        queueMicrotask(() => {
          if (!disposed && activeId === id) collapseOutside(event.target)
        })
      }
      const interruptFocus = (event: Event) => {
        focusIntent++
        if (!pointerActive) collapseOutside(event.target)
      }
      const leaveFocus = (event: FocusEvent) => {
        if (pointerActive) return
        const id = activeId
        if (!id || !belongsToRow(id, event.target)) return
        if (event.relatedTarget) collapseOutside(event.relatedTarget)
        else
          queueMicrotask(() => {
            if (restoringColumnFocus === event.target) return
            // Disabling a focused Save button can blur it without user navigation.
            if (
              !disposed &&
              !pointerActive &&
              activeId === id &&
              editing.drafts[id]?.expanded &&
              editing.drafts[id].status !== 'pending'
            )
              collapseOutside(document.activeElement)
          })
      }
      document.addEventListener('pointerdown', startPointer, true)
      document.addEventListener('pointerup', endPointer, true)
      document.addEventListener('pointercancel', endPointer, true)
      document.addEventListener('click', clickOutside, true)
      document.addEventListener('focusin', interruptFocus, true)
      document.addEventListener('focusout', leaveFocus, true)
      return () => {
        focusIntent++
        cancelAnimationFrame(pointerFrame)
        document.removeEventListener('pointerdown', startPointer, true)
        document.removeEventListener('pointerup', endPointer, true)
        document.removeEventListener('pointercancel', endPointer, true)
        document.removeEventListener('click', clickOutside, true)
        document.removeEventListener('focusin', interruptFocus, true)
        document.removeEventListener('focusout', leaveFocus, true)
      }
    },
  )
  const visibleIds = createMemo(
    () =>
      new Set(
        table.getDisplayKeys().flatMap((key) => {
          const item = table.getDisplayItem(key)
          return item.kind === 'row' ? [item.id] : []
        }),
      ),
  )
  const hiddenDrafts = createMemo(
    () => {
      const visible = visibleIds()
      return draftIds().filter((id) => !visible.has(id))
    },
    { equals: sameIds },
  )
  const hasFilters = () =>
    Boolean(table.state.globalFilter || table.state.columnFilters.length)
  const filterPlacement = () => props.controls?.filters ?? 'external'
  function clearFilters() {
    table.setColumnFilters([])
    table.setGlobalFilter('')
  }
  function restoreAfterRemoval() {
    queueMicrotask(() => {
      if (!disposed && document.activeElement === document.body) focusFilter()
    })
  }
  function focusFilter() {
    const candidates = untrack(() => table.state.globalFilter)
      ? [search, externalFilter, headerFilter]
      : [externalFilter, headerFilter, search]
    const target =
      candidates.find((node) => node?.isConnected && !node.disabled) ?? element
    target.focus({ preventScroll: true })
  }
  function columnFilter(
    column: ReturnType<EditingModel['table']['getColumns']>[number],
    placement: 'external' | 'headers',
  ) {
    return (
      <TableFilter
        label={filterLabels[column.id]!}
        clearLabel={`Clear ${String(column.columnDef?.header)} filter`}
        hideLabel={placement === 'headers'}
        value={String(column.getFilterValue() ?? '')}
        onValueChange={(value) => column.setFilterValue(value || undefined)}
        disabled={!model.localProcessing() || model.locked()}
        choices={column.id === 'priority' ? priorityChoices : undefined}
        inputRef={(node) => {
          if (column.id === 'name') {
            if (placement === 'external') externalFilter = node
            else headerFilter = node
          }
        }}
      />
    )
  }
  function actionColumn(id: string): EditColumn {
    return editing.drafts[id]?.activeColumn ?? 'name'
  }
  function focusCell(id: string, column: EditColumn, input: boolean) {
    const target = Array.from(
      element.querySelectorAll<HTMLElement>(
        `[data-${input ? 'editor' : 'edit'}="${id}/${column}"]`,
      ),
    ).find((node) => node.closest('table') === element)
    if (target) target.focus({ preventScroll: true })
    else {
      const path = model.recordGroupKeys(id)
      const groups = Array.from(
        element.querySelectorAll<HTMLButtonElement>('[data-group-toggle]'),
      ).filter((node) => node.closest('table') === element)
      const group = path
        .reverse()
        .map((key) => groups.find((node) => node.dataset.groupToggle === key))
        .find(Boolean)
      if (group) group.focus({ preventScroll: true })
      else focusFilter()
    }
  }
  function begin(id: string, column: EditColumn) {
    if (editing.drafts[id]?.status === 'pending') return
    if (activeId && activeId !== id) editing.collapse(activeId)
    activeId = id
    editing.begin(id, column)
    const intent = ++focusIntent
    onSettled(() => {
      if (!disposed && intent === focusIntent) focusCell(id, column, true)
    })
  }
  function cancel(id: string, column: EditColumn) {
    if (!editing.cancel(id)) return
    const intent = ++focusIntent
    setNotice(`Canceled changes to ${id}.`)
    onSettled(() => {
      if (!disposed && intent === focusIntent) focusCell(id, column, false)
    })
  }
  function finish(id: string, column: EditColumn) {
    activeId = undefined
    editing.collapse(id)
    const intent = ++focusIntent
    onSettled(() => {
      if (!disposed && intent === focusIntent) focusCell(id, column, false)
    })
  }
  async function saveAll() {
    const origin = document.activeElement
    const intent = ++focusIntent
    const result = await editing.saveAll()
    if (disposed || !result) return
    if (result.status === 'blocked')
      setNotice(
        `Nothing saved. Correct ${result.failed.length} draft${result.failed.length === 1 ? '' : 's'} before saving all.`,
      )
    else
      setNotice(
        `Saved ${result.saved.length} row${result.saved.length === 1 ? '' : 's'}. ${result.failed.length} failed. ${result.unchanged.length} unchanged.`,
      )
    onSettled(() => {
      if (disposed || isGrouped() || intent !== focusIntent) return
      if (
        document.activeElement !== origin &&
        document.activeElement !== document.body
      )
        return
      const target = saveAllButton.disabled ? modeControl : saveAllButton
      target.focus({ preventScroll: true })
    })
  }
  async function save(id: string, column: EditColumn) {
    if (editing.drafts[id]?.status === 'pending') return
    const origin = document.activeElement
    const intent = ++focusIntent
    const saved = await editing.save(id)
    if (disposed) return
    if (saved) setNotice(`Saved ${id}.`)
    onSettled(() => {
      if (disposed || isGrouped() || intent !== focusIntent) return
      // A finished request must not steal focus from a later user interaction.
      if (
        document.activeElement !== origin &&
        document.activeElement !== document.body
      )
        return
      if (saved) focusCell(id, column, false)
      else if (editing.drafts[id]?.status === 'invalid') {
        const first = (['name', 'note', 'priority'] as const).find(
          (field) => editing.drafts[id]?.fieldErrors[field],
        )
        focusCell(id, first ?? column, true)
      } else if (origin instanceof HTMLElement && origin.isConnected)
        origin.focus({ preventScroll: true })
    })
  }
  function SubTableToggle(id: string) {
    return (
      <Show when={props.details}>
        <button
          class="sub-table-toggle"
          data-subtable-toggle={id}
          aria-label={`${props.details!.expanded(id) ? 'Collapse' : 'Expand'} sub-table ${id}`}
          aria-expanded={props.details!.expanded(id) ? 'true' : 'false'}
          aria-controls={
            props.details!.expanded(id) ? domId(`child-${id}`) : undefined
          }
          ref={nativeEvents<HTMLButtonElement>({
            click: (event) => {
              if (model.locked()) return
              event.currentTarget.focus({ preventScroll: true })
              props.details!.toggle(id)
            },
          })}
        >
          {props.details!.expanded(id) ? '▾' : '▸'} Sub-table
          <Show when={props.details!.draftCount(id)}>
            {' '}
            ({props.details!.draftCount(id)} drafts)
          </Show>
        </button>
      </Show>
    )
  }
  function SubTableDetail(
    id: string,
    setDetail: (node: HTMLTableRowElement) => void,
  ) {
    return (
      <Show when={props.details?.expanded(id)}>
        <tr
          ref={setDetail}
          id={domId(`child-${id}`)}
          class="sub-table-row"
          data-child-row={id}
        >
          <td colspan={table.getVisibleColumns().length + 1}>
            {props.details!.render(id)}
          </td>
        </tr>
      </Show>
    )
  }
  function ReadOnlyRow(id: string) {
    const row = table.createRowView(id)
    counts.views++
    let detail: HTMLTableRowElement | undefined
    onCleanup(() => {
      counts.unmounted++
      if (detail?.contains(document.activeElement)) restoreAfterRemoval()
    })
    return (
      <tbody>
        <tr data-row={id}>
          <For each={row.getVisibleCells()}>
            {(cell) => {
              counts.cells++
              return (
                <td data-column={cell.column.id} class="read-only-value">
                  {cell.column.columnDef?.meta?.formatValue?.(
                    cell.getValue(),
                  ) ?? String(cell.getValue() ?? '')}
                </td>
              )
            }}
          </For>
          <td class="row-actions">{SubTableToggle(id)}</td>
        </tr>
        {SubTableDetail(id, (node) => {
          detail = node
        })}
      </tbody>
    )
  }
  function Row(id: string) {
    const row = table.createRowView(id)
    counts.views++
    let node!: HTMLTableRowElement
    let detail: HTMLTableRowElement | undefined
    onCleanup(() => {
      counts.unmounted++
      if (
        node.contains(document.activeElement) ||
        detail?.contains(document.activeElement)
      )
        restoreAfterRemoval()
    })
    return (
      <tbody>
        <tr
          ref={node}
          data-row={id}
          aria-busy={
            editing.drafts[id]?.status === 'pending' ? 'true' : 'false'
          }
        >
          <For each={row.getVisibleCells()}>
            {(cell) => {
              counts.cells++
              const column = cell.column.id
              if (column === 'id')
                return (
                  <th scope="row" data-column="id">
                    {id}
                  </th>
                )
              if (column === 'amount' || column === 'dueDate')
                return (
                  <td data-column={column} class="read-only-value">
                    {cell.column.columnDef?.meta?.formatValue?.(
                      cell.getValue(),
                    )}
                  </td>
                )
              const field = column as EditColumn
              const changed = () => {
                const draft = editing.drafts[id]
                return Boolean(draft && draft[field] !== cell.getValue())
              }
              return (
                <td data-column={field}>
                  <Show
                    when={editing.drafts[id]?.expanded}
                    fallback={
                      <button
                        class="cell-value"
                        data-edit={`${id}/${field}`}
                        aria-label={`Edit ${field} ${id}`}
                        aria-describedby={`${domId(`edited-${id}-${field}`)} ${domId(`error-${id}-${field}`)} ${domId(`message-${id}`)}`}
                        data-edited={changed() ? 'true' : undefined}
                        disabled={editing.drafts[id]?.status === 'pending'}
                        ref={nativeEvents({ click: () => begin(id, field) })}
                      >
                        <span data-value>
                          {String(
                            editing.drafts[id]?.[field] ?? cell.getValue(),
                          ) || (field === 'note' ? 'Add note' : 'Empty value')}
                        </span>
                        <Show when={changed()}>
                          <span
                            id={domId(`edited-${id}-${field}`)}
                            class="edited-marker"
                          >
                            Edited
                          </span>
                        </Show>
                      </button>
                    }
                  >
                    {field === 'priority' ? (
                      <select
                        data-editor={`${id}/${field}`}
                        aria-label={`Priority ${id}`}
                        aria-describedby={`${domId(`error-${id}-${field}`)} ${domId(`message-${id}`)}`}
                        aria-invalid={
                          editing.drafts[id]?.fieldErrors[field]
                            ? 'true'
                            : undefined
                        }
                        value={editing.drafts[id]?.priority ?? ''}
                        disabled={editing.drafts[id]?.status === 'pending'}
                        ref={nativeEvents<HTMLSelectElement>({
                          focus: () => editing.focus(id, field),
                          change: (event) =>
                            editing.change(
                              id,
                              field,
                              event.currentTarget.value,
                            ),
                        })}
                      >
                        <option value="" disabled>
                          Choose priority
                        </option>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    ) : (
                      <input
                        data-editor={`${id}/${field}`}
                        aria-label={`${field === 'name' ? 'Name' : 'Note'} ${id}`}
                        aria-describedby={`${domId(`error-${id}-${field}`)} ${domId(`message-${id}`)}`}
                        aria-invalid={
                          editing.drafts[id]?.fieldErrors[field]
                            ? 'true'
                            : undefined
                        }
                        value={editing.drafts[id]?.[field] ?? ''}
                        readonly={editing.drafts[id]?.status === 'pending'}
                        ref={nativeEvents<HTMLInputElement>({
                          focus: () => editing.focus(id, field),
                          input: (event) =>
                            editing.change(
                              id,
                              field,
                              event.currentTarget.value,
                            ),
                          keydown: (event) => {
                            if (event.isComposing || event.keyCode === 229)
                              return
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              if (saveMode() === 'table') finish(id, field)
                              else void save(id, field)
                            } else if (event.key === 'Escape') {
                              event.preventDefault()
                              cancel(id, field)
                            }
                          },
                        })}
                      />
                    )}
                  </Show>
                  <p id={domId(`error-${id}-${field}`)} class="message">
                    {editing.drafts[id]?.fieldErrors[field]}
                  </p>
                </td>
              )
            }}
          </For>
          <td class="row-actions">
            <Show
              when={editing.drafts[id]?.expanded}
              fallback={
                <span class="muted">
                  {editing.drafts[id]?.status === 'pending'
                    ? 'Saving…'
                    : editing.drafts[id]
                      ? 'Unsaved changes'
                      : 'No changes'}
                </span>
              }
            >
              <div class="buttons">
                <Show when={saveMode() === 'row'}>
                  <button
                    aria-label={`Save ${id}`}
                    disabled={editing.drafts[id]?.status === 'pending'}
                    ref={nativeEvents({
                      click: () => {
                        void save(id, actionColumn(id))
                      },
                    })}
                  >
                    Save
                  </button>
                </Show>
                <button
                  aria-label={`Cancel ${id}`}
                  disabled={editing.drafts[id]?.status === 'pending'}
                  ref={nativeEvents({
                    click: () => cancel(id, actionColumn(id)),
                  })}
                >
                  Cancel
                </button>
                <Show when={editing.drafts[id]?.status === 'pending'}>
                  <span role="status">Saving…</span>
                </Show>
              </div>
            </Show>
            <p id={domId(`message-${id}`)} role="alert" class="message">
              {editing.drafts[id]?.message}
            </p>
            {SubTableToggle(id)}
          </td>
        </tr>
        {SubTableDetail(id, (node) => {
          detail = node
        })}
      </tbody>
    )
  }
  function Group(key: string) {
    const group = table.createGroupView(key)
    counts.groupViews++
    onCleanup(() => {
      counts.groupsUnmounted++
    })
    const label = () =>
      group.path
        ?.map((entry) => {
          const column = table.getColumn(entry.columnId)
          return `${column?.columnDef?.meta?.groupingLabel ?? entry.columnId}: ${entry.value === null || entry.value === '' ? '(none)' : String(entry.value)}`
        })
        .join(' / ') ?? ''
    const valueLabel = () => {
      const value = group.path?.at(-1)?.value
      return value == null || value === '' ? '(none)' : String(value)
    }
    return (
      <tbody>
        <tr data-group={key} class="group-row">
          <For each={group.getVisibleCells()}>
            {(cell) => {
              counts.groupCells++
              const first = () => {
                const columnId = group.path?.at(-1)?.columnId
                const visible = table.getVisibleColumns()
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
                        data-group-toggle={key}
                        aria-expanded={group.getIsExpanded() ? 'true' : 'false'}
                        aria-label={`${group.getIsExpanded() ? 'Collapse' : 'Expand'} ${label()}`}
                        ref={nativeEvents({
                          click: () => {
                            if (!model.locked()) group.toggleExpanded()
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
                      {cell.column.columnDef?.meta?.formatSummary?.(
                        cell.getValue(),
                      ) ?? String(cell.getValue() ?? '—')}
                    </span>
                  </Show>
                </td>
              )
            }}
          </For>
          <td />
        </tr>
      </tbody>
    )
  }
  return (
    <section
      class="table-component"
      data-table-scope={props.scope ?? 'root'}
      aria-label={props.title ?? 'Table'}
    >
      <Show when={props.title}>
        <h2>{props.title}</h2>
      </Show>
      {props.settings}
      <p>Filter each column or search across columns.</p>
      <p
        role="status"
        class="editing-lock"
        style={{ visibility: model.locked() ? 'visible' : 'hidden' }}
      >
        Save or cancel edits to change table options. Row order, filters,
        groups, and column layout stay fixed while this table or a sub-table is
        being edited.
      </p>
      <Show when={isGrouped()}>
        <p>
          Grouped records are read-only. Clear grouping to edit them. Individual
          records can open their own sub-tables when expanded.
        </p>
      </Show>
      <Show when={!isGrouped()}>
        <details class="editing-help">
          <summary>Editing help</summary>
          <p>
            {saveMode() === 'row'
              ? 'Edit a name, note, or priority. Save saves the row and Cancel discards its draft. In text fields, Enter saves and Escape cancels.'
              : 'Save all saves every draft, including filtered rows. In text fields, Enter closes the editors and Escape discards that row draft.'}
          </p>
          <p>
            Leaving a row closes its editors and keeps your draft. Changed cells
            show an Edited marker. Click a cell to resume. Search and column
            filters use saved values.
          </p>
          <p>
            The priority dropdown uses its native keys. Choosing an option does
            not save the row.
          </p>
        </details>
      </Show>
      <Show
        when={filterPlacement() === 'external' || filterPlacement() === 'both'}
      >
        <div class="column-filters" role="region" aria-label="Column filters">
          <For each={table.getColumns()}>
            {(column) => columnFilter(column, 'external')}
          </For>
        </div>
      </Show>
      <Show when={props.controls?.grouping !== false}>
        <TableGrouping model={model} />
      </Show>
      <div class="toolbar">
        <Show when={props.controls?.globalSearch !== false}>
          <div class="global-search" role="search" aria-label="Table search">
            <TableFilter
              label="Search all columns"
              clearLabel="Clear search"
              search
              value={table.state.globalFilter}
              onValueChange={(value) => table.setGlobalFilter(value)}
              disabled={!model.localProcessing() || model.locked()}
              inputRef={(node) => {
                search = node
              }}
            />
          </div>
        </Show>
        <button
          disabled={!model.localProcessing() || model.locked() || !hasFilters()}
          ref={nativeEvents({
            click: () => {
              focusFilter()
              clearFilters()
            },
          })}
        >
          Clear all filters
        </button>
        <Show when={!isGrouped()}>
          <label>
            Save mode
            <select
              aria-label="Save mode"
              value={saveMode()}
              disabled={model.locked()}
              ref={[
                (node) => {
                  modeControl = node
                },
                nativeEvents<HTMLSelectElement>({
                  change: (event) => {
                    if (!model.locked()) {
                      setSaveMode(event.currentTarget.value as SaveMode)
                      setNotice('')
                    }
                  },
                }),
              ]}
            >
              <option value="row">Per row</option>
              <option value="table">Whole table</option>
            </select>
          </label>
          <Show when={saveMode() === 'table'}>
            <button
              aria-label="Save all"
              aria-describedby={domId('save-all-description')}
              disabled={
                editing.savingAll() ||
                !draftIds().length ||
                draftIds().some(
                  (id) => editing.drafts[id]?.status === 'pending',
                )
              }
              ref={[
                (node) => {
                  saveAllButton = node
                },
                nativeEvents<HTMLButtonElement>({
                  click: () => {
                    void saveAll()
                  },
                }),
              ]}
            >
              {editing.savingAll()
                ? 'Saving…'
                : `Save all (${draftIds().length})`}
            </button>
          </Show>
        </Show>
      </div>
      <p class="result-count" role="status" aria-label="Filter results">
        Showing {visibleIds().size} of {table.getSourceIds().length} records ·{' '}
        <Show when={model.localProcessing() && table.state.grouping.length > 0}>
          {table.getFilteredRowIds().length} match filters ·{' '}
        </Show>
        <Show when={!isGrouped()}>{draftIds().length} drafts</Show>
      </p>
      <Show when={!model.localProcessing()}>
        <p>
          Search, filters, sorting, and grouping are unavailable for this
          dataset.
        </p>
      </Show>
      <Show when={!isGrouped() && saveMode() === 'table'}>
        <p id={domId('save-all-description')}>
          All drafts must pass validation before saving starts. Each row saves
          separately. Failed rows keep their drafts. New edits during a save
          wait for the next Save all. This button saves only this table.
        </p>
      </Show>
      <Show when={!isGrouped() && hiddenDrafts().length > 0}>
        <aside aria-label="Hidden drafts">
          <p>Drafts outside the current view are preserved.</p>
          <For each={hiddenDrafts()}>
            {(id) => (
              <div class="hidden-draft">
                <span>
                  {id}: {editing.drafts[id]?.name}
                </span>
                <button
                  disabled={!model.records[id]}
                  ref={nativeEvents({
                    click: () => {
                      clearFilters()
                      // This event commits the cleared filters before locating the group path.
                      flush()
                      if (disposed || !model.records[id]) return
                      model.revealRecord(id)
                      begin(id, 'name')
                    },
                  })}
                >
                  Show {id}
                </button>
                <button
                  disabled={editing.drafts[id]?.status === 'pending'}
                  ref={nativeEvents({ click: () => cancel(id, 'name') })}
                >
                  Cancel hidden {id}
                </button>
                <span role="alert">{editing.drafts[id]?.message}</span>
              </div>
            )}
          </For>
        </aside>
      </Show>
      <p role="status" class="notice">
        {notice()}
      </p>
      <Show when={props.controls?.columnResizing !== false}>
        <p class="column-layout">Drag a header edge to resize the column.</p>
      </Show>
      <Show when={props.controls?.columnReordering !== false}>
        <p class="column-layout">
          Drag a dotted handle to move a column, or click it for move buttons.
        </p>
      </Show>
      <div class="table-scroll">
        <table
          ref={element}
          tabindex="-1"
          style={{ width: `${tableWidth()}px` }}
        >
          <caption>
            {isGrouped() ? 'Grouped records' : 'Editable records'}
          </caption>
          <colgroup>
            <For each={table.getVisibleColumns()}>
              {(column) => (
                <col
                  data-column-width={column.id}
                  style={{ width: `${column.getSize()}px` }}
                />
              )}
            </For>
            <col style={{ width: '230px' }} />
          </colgroup>
          <thead>
            <tr>
              <For each={table.getVisibleColumns()}>
                {(column) => (
                  <th
                    scope="col"
                    data-column-header={column.id}
                    class="column-header"
                    aria-sort={
                      !model.localProcessing() ||
                      table.state.sorting[0]?.id !== column.id
                        ? undefined
                        : column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : 'descending'
                    }
                  >
                    <Show when={props.controls?.columnReordering !== false}>
                      <ColumnMove column={column} />
                    </Show>
                    <Show
                      when={props.controls?.headerSorting !== false}
                      fallback={
                        <span class="column-title">
                          {String(column.columnDef?.header)}
                        </span>
                      }
                    >
                      <button
                        class="column-sort"
                        aria-label={`Sort by ${String(column.columnDef?.header)}`}
                        disabled={!model.localProcessing() || model.locked()}
                        ref={nativeEvents<HTMLElement>({
                          click: (event) =>
                            column.toggleSorting(undefined, event.shiftKey),
                        })}
                      >
                        {String(column.columnDef?.header)}{' '}
                        <span aria-hidden="true">
                          {column.getIsSorted() === 'asc'
                            ? '↑'
                            : column.getIsSorted() === 'desc'
                              ? '↓'
                              : '↕'}
                        </span>
                      </button>
                    </Show>
                    <Show
                      when={
                        filterPlacement() === 'headers' ||
                        filterPlacement() === 'both'
                      }
                    >
                      {columnFilter(column, 'headers')}
                    </Show>
                    <Show
                      when={
                        props.controls?.columnResizing !== false &&
                        column.columnDef?.enableResizing !== false
                      }
                    >
                      <ColumnResize
                        column={column}
                        fixed={props.controls?.resizeBehavior === 'fixed'}
                      />
                    </Show>
                  </th>
                )}
              </For>
              <th scope="col">Row actions</th>
            </tr>
            <Show when={isGrouped()}>
              <tr class="group-summary-headers">
                <For each={table.getVisibleColumns()}>
                  {(column) => (
                    <th scope="col" data-summary-header={column.id}>
                      {table.state.grouping.includes(column.id)
                        ? `group${column.columnDef?.meta?.summaryLabel ? ` · ${column.columnDef.meta.summaryLabel}` : ''}`
                        : (column.columnDef?.meta?.summaryLabel ?? '-')}
                    </th>
                  )}
                </For>
                <th scope="col">-</th>
              </tr>
            </Show>
          </thead>
          <Show
            when={isGrouped()}
            fallback={<For each={table.getRowIds()}>{(id) => Row(id)}</For>}
          >
            <For each={table.getDisplayKeys()}>
              {(key) => {
                const item = table.getDisplayItem(key)
                return item.kind === 'row'
                  ? ReadOnlyRow(item.id)
                  : Group(item.key)
              }}
            </For>
          </Show>
        </table>
        <Show when={table.getRowIds().length === 0}>
          <div class="empty-state">
            <p>
              {table.getSourceIds().length
                ? 'No records match your search or filters.'
                : 'No records yet.'}
            </p>
            <Show when={model.localProcessing() && hasFilters()}>
              <button
                ref={nativeEvents({
                  click: () => {
                    focusFilter()
                    clearFilters()
                  },
                })}
              >
                Show all records
              </button>
            </Show>
          </div>
        </Show>
      </div>
      <button
        class="after-table"
        ref={nativeEvents({ click: () => setNotice('Focus left the table.') })}
      >
        After table
      </button>
    </section>
  )
}
