import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
} from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { createModel } from './model'
import { TableFilter } from './TableFilter'
import type { JSX } from '@solidjs/web'
import type { EditingModel } from './model'
import type { EditColumn } from './createEditing'
import './style.css'

export type SaveMode = 'row' | 'table'
export type TableControls = {
  filters: 'external' | 'headers' | 'both' | 'none'
  headerSorting: boolean
  globalSearch: boolean
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
}
const priorityChoices = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]

export function Table(props: {
  size: number
  saveMode?: SaveMode
  controls?: Partial<TableControls>
  settings?: JSX.Element
  ready: (model: EditingModel) => void
}) {
  const model = createModel(untrack(() => props.size))
  const { table, editing, counts } = model
  let externalFilter: HTMLInputElement | undefined
  let headerFilter: HTMLInputElement | undefined
  let search: HTMLInputElement | undefined
  let element!: HTMLTableElement
  let modeControl!: HTMLSelectElement
  let saveAllButton!: HTMLButtonElement
  let disposed = false
  let focusIntent = 0
  let activeId: string | undefined
  const [notice, setNotice] = createSignal('')
  const [saveMode, setSaveMode] = createSignal(
    untrack(() => props.saveMode ?? 'row'),
  )
  const draftIds = createMemo(() => Object.keys(editing.drafts), {
    equals: sameIds,
  })
  function belongsToRow(id: string, target: EventTarget | null) {
    return (
      target instanceof Element &&
      target.closest<HTMLTableRowElement>('tr[data-row]')?.dataset.row === id &&
      element.contains(target)
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
  onSettled(() => {
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
    props.ready(model)
    return () => {
      disposed = true
      focusIntent++
      cancelAnimationFrame(pointerFrame)
      document.removeEventListener('pointerdown', startPointer, true)
      document.removeEventListener('pointerup', endPointer, true)
      document.removeEventListener('pointercancel', endPointer, true)
      document.removeEventListener('click', clickOutside, true)
      document.removeEventListener('focusin', interruptFocus, true)
      document.removeEventListener('focusout', leaveFocus, true)
    }
  })
  const visibleIds = createMemo(() => new Set(table.getRowIds()))
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
        disabled={!model.localProcessing()}
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
    const target = element.querySelector<HTMLElement>(
      `[data-${input ? 'editor' : 'edit'}="${id}/${column}"]`,
    )
    if (target) target.focus({ preventScroll: true })
    else focusFilter()
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
      if (disposed || intent !== focusIntent) return
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
      if (disposed || intent !== focusIntent) return
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
  function Row(id: string) {
    const row = table.createRowView(id)
    counts.views++
    let node!: HTMLTableRowElement
    onCleanup(() => {
      counts.unmounted++
      if (node.contains(document.activeElement)) focusFilter()
    })
    return (
      <tr
        ref={node}
        data-row={id}
        aria-busy={editing.drafts[id]?.status === 'pending' ? 'true' : 'false'}
      >
        <For each={row.getVisibleCells()}>
          {(cell) => {
            counts.cells++
            const column = cell.column.id
            if (column === 'id') return <th scope="row">{id}</th>
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
                      aria-describedby={`edited-${id}-${field} error-${id}-${field} message-${id}`}
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
                          id={`edited-${id}-${field}`}
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
                      aria-describedby={`error-${id}-${field} message-${id}`}
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
                          editing.change(id, field, event.currentTarget.value),
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
                      aria-describedby={`error-${id}-${field} message-${id}`}
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
                          editing.change(id, field, event.currentTarget.value),
                        keydown: (event) => {
                          if (event.isComposing || event.keyCode === 229) return
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
                <p id={`error-${id}-${field}`} class="message">
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
          <p id={`message-${id}`} role="alert" class="message">
            {editing.drafts[id]?.message}
          </p>
        </td>
      </tr>
    )
  }
  return (
    <main>
      <h1>Table</h1>
      {props.settings}
      <p>
        Filter each column or search across columns. Click a cell to edit its
        saved value.
      </p>
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
      <Show
        when={filterPlacement() === 'external' || filterPlacement() === 'both'}
      >
        <div class="column-filters" role="region" aria-label="Column filters">
          <For each={table.getColumns()}>
            {(column) => columnFilter(column, 'external')}
          </For>
        </div>
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
              disabled={!model.localProcessing()}
              inputRef={(node) => {
                search = node
              }}
            />
          </div>
        </Show>
        <button
          disabled={!model.localProcessing() || !hasFilters()}
          ref={nativeEvents({
            click: () => {
              focusFilter()
              clearFilters()
            },
          })}
        >
          Clear all filters
        </button>
        <label>
          Save mode
          <select
            aria-label="Save mode"
            value={saveMode()}
            disabled={editing.savingAll()}
            ref={[
              (node) => {
                modeControl = node
              },
              nativeEvents<HTMLSelectElement>({
                change: (event) => {
                  if (!editing.savingAll()) {
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
            aria-describedby="save-all-description"
            disabled={
              editing.savingAll() ||
              !draftIds().length ||
              draftIds().some((id) => editing.drafts[id]?.status === 'pending')
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
      </div>
      <p class="result-count" role="status" aria-label="Filter results">
        Showing {table.getRowIds().length} of {table.getSourceIds().length}{' '}
        records · {draftIds().length} drafts
      </p>
      <Show when={!model.localProcessing()}>
        <p>Search and column filters are unavailable for this dataset.</p>
      </Show>
      <Show when={saveMode() === 'table'}>
        <p id="save-all-description">
          All drafts must pass validation before saving starts. Each row saves
          separately. Failed rows keep their drafts. New edits during a save
          wait for the next Save all.
        </p>
      </Show>
      <Show when={hiddenDrafts().length > 0}>
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
      <div class="table-scroll">
        <table ref={element} tabindex="-1">
          <caption>Editable records</caption>
          <thead>
            <tr>
              <For each={table.getVisibleColumns()}>
                {(column) => (
                  <th
                    scope="col"
                    aria-sort={
                      !model.localProcessing() ||
                      table.state.sorting[0]?.id !== column.id
                        ? undefined
                        : column.getIsSorted() === 'asc'
                          ? 'ascending'
                          : 'descending'
                    }
                  >
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
                        disabled={!model.localProcessing()}
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
                  </th>
                )}
              </For>
              <th scope="col">Row actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={table.getRowIds()}>{Row}</For>
          </tbody>
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
    </main>
  )
}
