import { render } from '@solidjs/web'
import { OBSERVE, flush } from 'solid-js'
import NativeApp from '../../../examples/solid/virtualized-rows/src/NativeApp'
import type { NativeDemoController } from '../../../examples/solid/virtualized-rows/src/NativeApp'

let controller: NativeDemoController | undefined
let dispose: (() => void) | undefined
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
let diagnostics: Array<{ phase: string; events: Array<unknown> }> = []
function collectDiagnostics(phase: string) {
  const events = capture?.stop() ?? []
  if (events.length) diagnostics.push({ phase, events })
  capture = OBSERVE?.diagnostics.capture()
}
const root = document.getElementById('root')!
const rectangle = (element: Element) => {
  const { x, y, width, height, top, bottom, left, right } =
    element.getBoundingClientRect()
  return { x, y, width, height, top, bottom, left, right }
}
function start(size: number, extraColumns = 0) {
  dispose?.()
  controller = undefined
  capture?.stop()
  diagnostics = []
  capture = OBSERVE?.diagnostics.capture()
  dispose = render(
    () => (
      <NativeApp
        size={size}
        extraColumns={extraColumns}
        onReady={(value) => {
          controller = value
        }}
      />
    ),
    root,
  )
  flush()
}
function command(name: string, value?: unknown) {
  collectDiagnostics('settled')
  const c = controller!
  const table = c.table
  switch (name) {
    case 'scroll':
      c.virtualizer.scrollToIndex(Number(value))
      break
    case 'horizontal':
      c.viewport.scrollLeft = Number(value)
      break
    case 'edit': {
      const { id, update } = value as {
        id: string
        update: Parameters<typeof c.edit>[1]
      }
      c.edit(id, update)
      break
    }
    case 'append':
      c.append()
      break
    case 'remove':
      c.remove(String(value))
      break
    case 'refresh':
      c.replace()
      break
    case 'sort':
      table.setSorting(value ? [{ id: 'amount', desc: true }] : [])
      break
    case 'filter':
      table.setColumnFilters(value == null ? [] : [{ id: 'amount', value }])
      break
    case 'pin':
      table.setRowPinning(
        value as { top: Array<string>; bottom: Array<string> },
      )
      break
    case 'group':
      table.setGrouping(value ? ['region'] : [])
      break
    case 'expandGroups':
      table.toggleAllGroupsExpanded(Boolean(value))
      break
    case 'collapseFirst':
      table.getGroup(table.getRootGroupKeys()[0]!).toggleExpanded(false)
      break
    case 'detail':
      table.getRow(String(value)).toggleExpanded()
      break
    case 'resize':
      table.getColumn('description')!.setSize(Number(value))
      break
    case 'hide':
      table.getColumn('description')!.toggleVisibility(!value)
      break
    case 'select':
      table.getRow(String(value)).toggleSelected()
      break
    case 'empty':
      c.setEmpty(Boolean(value))
      break
    case 'busy':
      c.setBusy(Boolean(value))
      break
    default:
      throw new Error(`Unknown benchmark command: ${name}`)
  }
  flush()
  collectDiagnostics(name)
}
function read() {
  const c = controller!
  return {
    stats: c.stats(),
    interaction: {
      active: c.interaction.active(),
      editing: c.interaction.editing(),
      drafts: Object.fromEntries(
        Object.entries(c.interaction.drafts).map(([id, draft]) => [
          id,
          draft && { ...draft },
        ]),
      ),
      focused:
        document.activeElement === c.viewport
          ? 'grid'
          : (document.activeElement as HTMLElement | null)?.dataset.editor,
      descendant: c.viewport.getAttribute('aria-activedescendant'),
      descendantExists: Boolean(
        document.getElementById(
          c.viewport.getAttribute('aria-activedescendant') ?? '',
        ),
      ),
      selected: Object.keys(c.table.state.rowSelection).filter(
        (id) => c.table.state.rowSelection[id],
      ),
    },
    sections: c.table.getRowSections(),
    columns: c.table
      .getVisibleColumns()
      .map((column) => ({ id: column.id, size: column.getSize() })),
    viewport: {
      ...rectangle(c.viewport),
      clientHeight: c.viewport.clientHeight,
      scrollTop: c.viewport.scrollTop,
      scrollLeft: c.viewport.scrollLeft,
      scrollHeight: c.viewport.scrollHeight,
      rowcount: c.viewport.getAttribute('aria-rowcount'),
      busy: c.viewport.getAttribute('aria-busy'),
    },
    header: rectangle(root.querySelector('.native-header')!),
    headers: Array.from(
      root.querySelectorAll('[role=columnheader]'),
      (cell) => ({
        column: cell.getAttribute('data-column'),
        ...rectangle(cell),
      }),
    ),
    items: c.virtualizer.getItems(),
    total: c.virtualizer.getTotalSize(),
    measured: c.virtualizer.instance.itemSizeCache.size,
    elements: c.virtualizer.instance.elementsCache.size,
    status: root.querySelector('[role=status]')?.textContent,
    rows: Array.from(root.querySelectorAll('[data-key]'), (row) => ({
      key: row.getAttribute('data-key')!,
      section: row.getAttribute('data-section')!,
      index: Number(row.getAttribute('data-index')),
      aria: Number(row.getAttribute('aria-rowindex')),
      ...rectangle(row),
      cells: Array.from(row.querySelectorAll('[role=gridcell]'), (cell) => ({
        column: cell.getAttribute('data-column')!,
        text: cell.textContent,
        ...rectangle(cell),
      })),
    })),
  }
}
declare global {
  interface Window {
    nativeVirtual: {
      start: typeof start
      command: typeof command
      read: typeof read
      stats: () => ReturnType<NativeDemoController['stats']>
      dispose: () => ReturnType<NativeDemoController['stats']> | undefined
    }
  }
}
window.nativeVirtual = {
  start,
  command,
  read,
  stats: () => controller!.stats(),
  dispose: () => {
    const c = controller
    dispose?.()
    flush()
    const result = c?.stats()
    collectDiagnostics('dispose')
    capture?.stop()
    capture = undefined
    dispose = undefined
    controller = undefined
    return result && { ...result, diagnostics }
  },
}
