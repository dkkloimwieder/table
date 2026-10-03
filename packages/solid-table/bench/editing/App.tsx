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
import type { EditingModel } from './model'
import type { EditColumn } from './createEditing'
import './style.css'

export function App(props: {
  size: number
  ready: (model: EditingModel) => void
}) {
  const model = createModel(untrack(() => props.size))
  const { table, editing, counts } = model
  let filter!: HTMLInputElement
  let element!: HTMLTableElement
  let disposed = false
  let focusIntent = 0
  let activeId: string | undefined
  const [notice, setNotice] = createSignal('')
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
    const interruptFocus = (event: Event) => {
      focusIntent++
      collapseOutside(event.target)
    }
    const leaveFocus = (event: FocusEvent) => {
      const id = activeId
      if (!id || !belongsToRow(id, event.target)) return
      if (event.relatedTarget) collapseOutside(event.relatedTarget)
      else
        queueMicrotask(() => {
          // Disabling a focused Save button can blur it without user navigation.
          if (
            !disposed &&
            activeId === id &&
            editing.drafts[id]?.expanded &&
            editing.drafts[id].status !== 'pending'
          )
            collapseOutside(document.activeElement)
        })
    }
    document.addEventListener('pointerdown', interruptFocus, true)
    document.addEventListener('focusin', interruptFocus, true)
    document.addEventListener('focusout', leaveFocus, true)
    props.ready(model)
    return () => {
      disposed = true
      focusIntent++
      document.removeEventListener('pointerdown', interruptFocus, true)
      document.removeEventListener('focusin', interruptFocus, true)
      document.removeEventListener('focusout', leaveFocus, true)
    }
  })
  const visibleIds = createMemo(() => new Set(table.getRowIds()))
  const hiddenDrafts = createMemo(() => {
    const visible = visibleIds()
    return Object.keys(editing.drafts).filter((id) => !visible.has(id))
  })
  const filterEvents = nativeEvents<HTMLInputElement>({
    input: (event) =>
      table.setColumnFilters(
        event.currentTarget.value
          ? [{ id: 'name', value: event.currentTarget.value }]
          : [],
      ),
  })
  function actionColumn(id: string): EditColumn {
    return editing.drafts[id]?.activeColumn ?? 'name'
  }
  function focusCell(id: string, column: EditColumn, input: boolean) {
    const target = element.querySelector<HTMLElement>(
      `[data-${input ? 'editor' : 'edit'}="${id}/${column}"]`,
    )
    if (target) target.focus({ preventScroll: true })
    else filter.focus({ preventScroll: true })
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
      if (node.contains(document.activeElement))
        filter.focus({ preventScroll: true })
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
                            void save(id, field)
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
      <h1>Inline editing</h1>
      <p>
        Edit a name, note, or priority. Save saves the row and Cancel discards
        its draft. In text fields, Enter saves and Escape cancels.
      </p>
      <p>
        Leaving a row closes its editors and keeps your draft. Changed cells
        show an Edited marker. Click a cell to resume. Filtering uses saved
        values.
      </p>
      <p>
        The priority dropdown uses its native keys. Choosing an option does not
        save the row.
      </p>
      <div class="toolbar">
        <label>
          Filter saved names
          <input
            aria-label="Filter saved names"
            value={String(table.getColumn('name')!.getFilterValue() ?? '')}
            ref={(node) => {
              filter = node
              filterEvents(node)
            }}
          />
        </label>
        <button ref={nativeEvents({ click: () => table.setColumnFilters([]) })}>
          Clear filter
        </button>
        <button
          ref={nativeEvents({
            click: () => table.getColumn('name')!.toggleSorting(),
          })}
        >
          Sort names {table.getColumn('name')!.getIsSorted() || 'off'}
        </button>
        <span>
          {table.getRowIds().length} records ·{' '}
          {Object.keys(editing.drafts).length} drafts
        </span>
      </div>
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
                      table.setColumnFilters([])
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
        <table ref={element}>
          <caption>Editable records</caption>
          <thead>
            <tr>
              <th scope="col">Record</th>
              <th scope="col">Name</th>
              <th scope="col">Note</th>
              <th scope="col">Priority</th>
              <th scope="col">Row actions</th>
            </tr>
          </thead>
          <tbody>
            <For each={table.getRowIds()}>{Row}</For>
          </tbody>
        </table>
        <Show when={table.getRowIds().length === 0}>
          <p>No records match the filter.</p>
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
