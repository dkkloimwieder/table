import { createSignal, createStore } from 'solid-js'
import type { NativeDemoController, NativePerson } from './NativeApp'

type Cell = { key: string; column: string }
type Draft = { base: string; value: string; message?: string }

/** Example interaction state lives outside the disposable row scopes. */
export function createNativeGridInteraction(options: {
  table: NativeDemoController['table']
  viewport: () => HTMLElement | undefined
  virtualizer: NativeDemoController['virtualizer']
  get: (id: string) => NativePerson | undefined
  saveName: (id: string, name: string) => void
}) {
  const [active, setActive] = createSignal<Cell>()
  const [editing, setEditing] = createSignal<string>()
  const [refuseNext, setRefuseNext] = createSignal(false)
  const [drafts, setDrafts] = createStore<Record<string, Draft | undefined>>({})
  let requestedEditor: string | undefined
  function focusEditor(input: HTMLInputElement, id: string) {
    if (requestedEditor !== id || !input.isConnected) return
    requestedEditor = undefined
    input.focus({ preventScroll: true })
  }
  const cellId = (key: string, column: string) =>
    `native-cell-${encodeURIComponent(JSON.stringify([key, column]))}`
  function focus(cell: Cell) {
    setActive(cell)
    options.virtualizer.scrollToKey(cell.key)
    const viewport = options.viewport()
    const columns = options.table.getVisibleColumns()
    const index = columns.findIndex((column) => column.id === cell.column)
    const column = index < 0 ? undefined : columns.at(index)
    if (viewport && column && !column.getIsPinned()) {
      const start = columns
        .slice(0, index)
        .reduce((sum, item) => sum + item.getSize(), 0)
      const end = start + column.getSize()
      const pinnedWidth = (side: 'start' | 'end') =>
        columns.reduce(
          (sum, item) =>
            sum + (item.getIsPinned() === side ? item.getSize() : 0),
          0,
        )
      if (start < viewport.scrollLeft + pinnedWidth('start'))
        viewport.scrollLeft = Math.max(0, start - pinnedWidth('start'))
      else if (
        end >
        viewport.scrollLeft + viewport.clientWidth - pinnedWidth('end')
      )
        viewport.scrollLeft = Math.max(
          0,
          end - viewport.clientWidth + pinnedWidth('end'),
        )
    }
    viewport?.focus({ preventScroll: true })
  }
  function begin(id: string) {
    const record = options.get(id)
    if (!record) return
    if (!drafts[id])
      setDrafts((draft) => {
        draft[id] = { base: record.name, value: record.name }
      })
    setEditing(id)
    requestedEditor = id
    focus({ key: options.table.getRowKey(id), column: 'name' })
    queueMicrotask(() => {
      const input = options
        .viewport()
        ?.querySelector<HTMLInputElement>('[data-editor]')
      if (input?.dataset.editor === id) focusEditor(input, id)
    })
  }
  function cancel() {
    const id = editing()
    if (id === undefined) return
    setDrafts((draft) => {
      delete draft[id]
    })
    setEditing(undefined)
    requestedEditor = undefined
    focus({ key: options.table.getRowKey(id), column: 'name' })
  }
  function save() {
    const id = editing()
    if (id === undefined) return
    const draft = drafts[id]
    if (!draft) return
    const record = options.get(id)
    const message = !record
      ? 'This record is no longer loaded. The draft is preserved.'
      : record.name !== draft.base
        ? 'The name changed after editing started. Cancel to load the current name.'
        : refuseNext()
          ? 'The demo server refused this save. The draft is preserved.'
          : undefined
    setRefuseNext(false)
    if (message) {
      setDrafts((next) => {
        next[id]!.message = message
      })
      return
    }
    options.saveName(id, draft.value)
    cancel()
  }
  function keydown(event: KeyboardEvent) {
    if (event.target !== options.viewport()) return
    const sections = options.table.getRowSections()
    const keys = [...sections.top, ...sections.center, ...sections.bottom]
    const columns = options.table.getVisibleColumns()
    if (!keys.length || !columns.length) return
    const previous = active()
    let row = previous ? keys.indexOf(previous.key) : -1
    let column = Math.max(
      0,
      columns.findIndex((item) => item.id === previous?.column),
    )
    const missing = row < 0
    if (missing)
      row = Math.max(0, keys.indexOf(options.virtualizer.getKeys().at(0) ?? ''))
    switch (event.key) {
      case 'ArrowDown':
        row = Math.min(keys.length - 1, row + (missing ? 0 : 1))
        break
      case 'ArrowUp':
        row = Math.max(0, row - (missing ? 0 : 1))
        break
      case 'ArrowRight':
        column = Math.min(columns.length - 1, column + 1)
        break
      case 'ArrowLeft':
        column = Math.max(0, column - 1)
        break
      case 'Home':
        if (event.ctrlKey) row = 0
        column = 0
        break
      case 'End':
        if (event.ctrlKey) row = keys.length - 1
        column = columns.length - 1
        break
      case 'Enter': {
        const item = options.table.getDisplayItem(keys.at(row)!)
        if (item.kind === 'group')
          options.table.getGroup(item.key).toggleExpanded()
        else if (columns.at(column)!.id === 'name') begin(item.id)
        event.preventDefault()
        return
      }
      case ' ': {
        const item = options.table.getDisplayItem(keys.at(row)!)
        if (item.kind === 'row') options.table.getRow(item.id).toggleSelected()
        event.preventDefault()
        return
      }
      default:
        return
    }
    event.preventDefault()
    focus({ key: keys.at(row)!, column: columns.at(column)!.id })
  }
  return {
    active,
    editing,
    drafts,
    refuseNext,
    setRefuseNext,
    cellId,
    focus,
    begin,
    cancel,
    save,
    keydown,
    focusEditor,
    change: (id: string, value: string) =>
      setDrafts((next) => {
        next[id]!.value = value
      }),
    activeDescendant: () => {
      const cell = active()
      if (
        !cell ||
        !options.table
          .getVisibleColumns()
          .some((column) => column.id === cell.column)
      )
        return undefined
      const sections = options.table.getRowSections()
      return sections.top.includes(cell.key) ||
        sections.bottom.includes(cell.key) ||
        options.virtualizer.getKeys().includes(cell.key)
        ? cellId(cell.key, cell.column)
        : undefined
    },
  }
}
