import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  For,
  OBSERVE,
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  createStore,
  flush,
  onCleanup,
} from 'solid-js'
import { createTable } from '../../src/native'
import type {
  NativeColumnDef,
  NativeRowView,
  NativeTableState,
} from '../../src/native'

afterEach(cleanup)
type Item = {
  name: string
  score: number
  details: { label: string }
  fn?: () => number
}
const initial = (): Record<string, Item> => ({
  a: { name: 'Ada', score: 20, details: { label: 'A' } },
  b: { name: 'Grace', score: 10, details: { label: 'B' } },
  c: { name: 'Katherine', score: 30, details: { label: 'C' } },
})
const scoreColumn: NativeColumnDef<Item> = {
  id: 'score',
  accessorKey: 'score',
  filterFn: (value, minimum) => (value as number) >= (minimum as number),
  sortFn: (a, b) => (a as number) - (b as number),
}
function setup() {
  let mounts = 0
  let unmounts = 0
  let sourceReads = 0
  const views = new Map<string, NativeRowView<Item>>()
  const harness = createRoot((dispose) => {
    const [records, setRecords] = createStore(initial())
    const [ids, setIds] = createSignal(['a', 'b', 'c'])
    const [columns, setColumns] = createSignal<Array<NativeColumnDef<Item>>>([
      scoreColumn,
      { id: 'label', accessorFn: (item) => item.details.label },
    ])
    const [start, setStart] = createSignal(0)
    const table = createTable({
      source: {
        ids: () => {
          sourceReads++
          return ids()
        },
        get: (id) => records[id],
      },
      get columns() {
        return columns()
      },
    })
    const visible = createMemo(() =>
      table.getRowIds().slice(start(), start() + 2),
    )
    return { table, setRecords, setIds, setColumns, setStart, visible, dispose }
  })
  const View = () => (
    <output>
      <For each={harness.visible()}>
        {(id) => {
          mounts++
          const row = harness.table.createRowView(id)
          views.set(id, row)
          onCleanup(() => {
            unmounts++
            views.delete(id)
          })
          return (
            <div data-row={id}>
              <For each={row.getVisibleCells()}>
                {(cell) => (
                  <span data-column={cell.column.id}>
                    {String(cell.getContext().getValue())}
                  </span>
                )}
              </For>
            </div>
          )
        }}
      </For>
    </output>
  )
  return {
    ...harness,
    View,
    views,
    counts: () => ({ mounts, unmounts, sourceReads }),
  }
}

test('scoped cells and contexts survive edits, replacements, reorder and column replacement', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const row = h.views.get('a')!
    const cell = row.getVisibleCells()[0]!
    const context = cell.getContext()
    const node = document.querySelector('[data-row="a"] [data-column="score"]')
    const column = cell.column
    h.setRecords((draft) => {
      draft.a!.score = 42
      draft.a!.details.label = 'Nested'
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('42Nested10B')
    h.setRecords((draft) => {
      draft.a = { name: 'Replacement', score: 50, details: { label: 'New' } }
    })
    h.setIds(['b', 'a', 'c'])
    flush()
    expect(row.original!.name).toBe('Replacement')
    expect(row.getVisibleCells()[0]).toBe(cell)
    expect(cell.getContext()).toBe(context)
    expect(document.querySelector('[data-row="a"] [data-column="score"]')).toBe(
      node,
    )
    h.setColumns([
      { ...scoreColumn, accessorFn: (item) => item.score * 2 },
      { id: 'label', accessorFn: (item) => item.name },
    ])
    flush()
    expect(screen.getByRole('status').textContent).toBe('20Grace100Replacement')
    expect(h.table.getColumn('score')).toBe(column)
    expect(context.getValue()).toBe(100)
    expect(h.counts().mounts).toBe(2)
  } finally {
    h.dispose()
  }
})

test('column removal and record removal settle without stale cell reads', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const oldCell = h.views.get('a')!.getVisibleCells()[1]!
    h.setColumns([scoreColumn])
    flush()
    expect(screen.getByRole('status').textContent).toBe('2010')
    expect(oldCell.getValue()).toBeUndefined()
    expect(oldCell.column.columnDef).toBeUndefined()
    h.setIds(['b', 'c'])
    h.setRecords((draft) => {
      delete draft.a
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('1030')
    expect(h.views.has('a')).toBe(false)
  } finally {
    h.dispose()
  }
})

test('visibility, order and pinning preserve surviving cell identity', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const row = h.views.get('a')!
    const score = row.getVisibleCells()[0]!
    h.table.setColumnOrder(['label', 'label', 'unknown', 'score'])
    flush()
    expect(row.getVisibleCells().map((cell) => cell.column.id)).toEqual([
      'label',
      'score',
    ])
    expect(row.getVisibleCells()[1]).toBe(score)
    h.table.getColumn('score')!.pin('start')
    flush()
    expect(row.getVisibleCells()[0]).toBe(score)
    h.table.getColumn('label')!.toggleVisibility(false)
    flush()
    expect(row.getVisibleCells()).toEqual([score])
    h.table.getColumn('score')!.setSize(8)
    flush()
    expect(h.table.getColumn('score')!.getSize()).toBe(20)
    expect(h.counts().sourceReads).toBe(1)
  } finally {
    h.dispose()
  }
})

test('uncontrolled updater calls compose within one Solid batch and notify once per command', () => {
  const changed = vi.fn()
  const h = createRoot((dispose) => ({
    dispose,
    table: createTable({
      source: { ids: () => ['a'], get: () => initial().a },
      columns: [scoreColumn],
      onColumnSizingChange: changed,
    }),
  }))
  try {
    h.table.setColumnSizing((old) => ({ score: (old.score ?? 0) + 10 }))
    h.table.setColumnSizing((old) => ({ score: (old.score ?? 0) + 10 }))
    h.table.getRow('a').toggleSelected()
    h.table.getRow('a').toggleSelected()
    flush()
    expect(h.table.state.columnSizing.score).toBe(20)
    expect(h.table.getRow('a').getIsSelected()).toBe(false)
    expect(changed).toHaveBeenCalledTimes(2)
  } finally {
    h.dispose()
  }
})

test('controlled state remains external and reactive getters stay live', () => {
  const changed = vi.fn()
  const h = createRoot((dispose) => {
    const [sorting, setSorting] = createSignal<NativeTableState['sorting']>([])
    const table = createTable({
      source: { ids: () => ['a', 'b'], get: (id) => initial()[id] },
      columns: [scoreColumn],
      get state() {
        return { sorting: sorting() }
      },
      onSortingChange: changed,
    })
    return { table, setSorting, dispose }
  })
  try {
    h.table.setSorting([{ id: 'score', desc: false }])
    flush()
    expect(changed).toHaveBeenCalledTimes(1)
    expect(h.table.state.sorting).toEqual([])
    h.setSorting([{ id: 'score', desc: false }])
    flush()
    expect(h.table.getRowIds()).toEqual(['b', 'a'])
    expect(h.table.getColumn('score')!.getIsSorted()).toBe('asc')
  } finally {
    h.dispose()
  }
})

test('controlled callbacks can apply consecutive updater functions without lost writes', () => {
  const h = createRoot((dispose) => {
    const [selection, setSelection] = createSignal<
      NativeTableState['rowSelection']
    >({})
    const table = createTable({
      source: { ids: () => ['a', 'b'], get: (id) => initial()[id] },
      columns: [scoreColumn],
      get state() {
        return { rowSelection: selection() }
      },
      onRowSelectionChange: (updater) => setSelection(updater),
    })
    return { table, selection, dispose }
  })
  try {
    h.table.getRow('a').toggleSelected()
    h.table.getRow('b').toggleSelected()
    flush()
    expect(h.selection()).toEqual({ a: true, b: true })
    expect(h.table.state.rowSelection).toBe(h.selection())
  } finally {
    h.dispose()
  }
})

test('source and display indexes update independently without changing row identity', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const row = h.views.get('a')!
    const sourceIndex = createRoot((dispose) => ({
      read: createMemo(() => row.index),
      dispose,
    }))
    try {
      expect(sourceIndex.read()).toBe(0)
      h.setIds(['b', 'a', 'c'])
      h.table.setSorting([{ id: 'score', desc: true }])
      flush()
      expect(sourceIndex.read()).toBe(1)
      expect(h.table.getDisplayIndex('a')).toBe(1)
      expect(h.table.getDisplayIndex('c')).toBe(0)
      expect(h.table.getSourceIndex('c')).toBe(2)
      expect(h.views.get('a')).toBe(row)
    } finally {
      sourceIndex.dispose()
    }
  } finally {
    h.dispose()
  }
})

test('manual processing flags switch reactively without changing feature state', () => {
  const h = createRoot((dispose) => {
    const [manual, setManual] = createSignal(true)
    const table = createTable({
      source: { ids: () => ['a', 'b', 'c'], get: (id) => initial()[id] },
      columns: [scoreColumn],
      initialState: {
        columnFilters: [{ id: 'score', value: 15 }],
        sorting: [{ id: 'score', desc: true }],
      },
      get manualFiltering() {
        return manual()
      },
      get manualSorting() {
        return manual()
      },
    })
    return { table, setManual, dispose }
  })
  try {
    expect(h.table.getRowIds()).toEqual(['a', 'b', 'c'])
    h.setManual(false)
    flush()
    expect(h.table.getRowIds()).toEqual(['c', 'a'])
    h.setManual(true)
    flush()
    expect(h.table.getRowIds()).toEqual(['a', 'b', 'c'])
    expect(h.table.state.columnFilters).toHaveLength(1)
  } finally {
    h.dispose()
  }
})

test('row view work stops on unmount while selection, expansion and records persist', () => {
  const read = vi.fn((item: Item) => item.score)
  const h = setup()
  try {
    h.setColumns([{ id: 'score', accessorFn: read }])
    flush()
    const view = render(h.View)
    h.table.getRow('a').toggleSelected(true)
    h.table.getRow('a').toggleExpanded(true)
    h.table.getRow('a').pin('top')
    flush()
    view.unmount()
    const before = read.mock.calls.length
    h.setRecords((draft) => {
      draft.a!.score = 90
    })
    flush()
    expect(read).toHaveBeenCalledTimes(before)
    expect(h.counts().mounts).toBe(h.counts().unmounts)
    render(h.View)
    flush()
    expect(h.views.get('a')!.getValue('score')).toBe(90)
    expect(h.views.get('a')!.getIsSelected()).toBe(true)
    expect(h.views.get('a')!.getIsExpanded()).toBe(true)
    expect(h.views.get('a')!.getIsPinned()).toBe('top')
  } finally {
    h.dispose()
  }
})

test('function-valued records stay values and reserved IDs work in state commands', () => {
  const fn = vi.fn(() => 7)
  const h = createRoot((dispose) => ({
    dispose,
    table: createTable({
      source: { ids: () => ['__proto__', 'constructor'], get: () => ({ fn }) },
      columns: [{ id: 'fn', accessorKey: 'fn' }],
    }),
  }))
  try {
    expect(h.table.getValue('__proto__', 'fn')).toBe(fn)
    expect(fn).not.toHaveBeenCalled()
    h.table.getRow('__proto__').toggleSelected()
    h.table.getRow('constructor').toggleSelected()
    flush()
    expect(h.table.getRow('__proto__').getIsSelected()).toBe(true)
    expect(h.table.getRow('constructor').getIsSelected()).toBe(true)
  } finally {
    h.dispose()
  }
})

test('reactive source replacement updates existing row views', () => {
  const h = createRoot((dispose) => {
    const [source, setSource] = createSignal({
      ids: () => ['a'],
      get: () => initial().a,
    })
    const table = createTable({
      get source() {
        return source()
      },
      columns: [scoreColumn],
    })
    return { table, setSource, dispose }
  })
  try {
    let row: NativeRowView<Item> | undefined
    render(() => {
      row = h.table.createRowView('a')
      return <output>{String(row.getValue('score'))}</output>
    })
    h.setSource({
      ids: () => ['a'],
      get: () => ({ name: 'New', score: 99, details: { label: '' } }),
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('99')
    expect(row!.original!.name).toBe('New')
  } finally {
    h.dispose()
  }
})

test('repeated row and column scope disposal produces no Solid diagnostics', () => {
  const capture = OBSERVE!.diagnostics.capture()
  const h = setup()
  try {
    for (let iteration = 0; iteration < 12; iteration++) {
      const view = render(h.View)
      h.setStart(1)
      h.setColumns([scoreColumn])
      flush()
      expect(h.counts().mounts - h.counts().unmounts).toBe(2)
      view.unmount()
      h.setStart(0)
      h.setColumns([
        scoreColumn,
        { id: 'label', accessorFn: (item) => item.details.label },
      ])
      h.setRecords((draft) => {
        draft.a!.score++
      })
      flush()
      expect(h.counts().mounts).toBe(h.counts().unmounts)
    }
  } finally {
    h.dispose()
  }
  expect(capture.stop()).toEqual([])
})

test('controlled state commands handle reserved IDs without inherited properties', () => {
  const h = createRoot((dispose) => {
    const [selection, setSelection] = createSignal<
      NativeTableState['rowSelection']
    >({})
    const table = createTable({
      source: { ids: () => ['constructor'], get: () => initial().a },
      columns: [{ id: 'constructor', accessorKey: 'score' }],
      get state() {
        return { rowSelection: selection(), columnSizing: {} }
      },
      onRowSelectionChange: setSelection,
    })
    return { table, dispose }
  })
  try {
    h.table.getRow('constructor').toggleSelected()
    flush()
    expect(h.table.getRow('constructor').getIsSelected()).toBe(true)
    expect(h.table.getColumn('constructor')!.getSize()).toBe(150)
  } finally {
    h.dispose()
  }
})

test('disposal before the first settlement prevents later source reads', () => {
  const capture = OBSERVE!.diagnostics.capture()
  const [records, setRecords] = createStore(initial())
  const read = vi.fn((item: Item) => item.score)
  createRoot((dispose) => {
    const table = createTable({
      source: { ids: () => ['a'], get: (id) => records[id] },
      columns: [{ id: 'score', accessorFn: read }],
    })
    createEffect(
      () => table.getValue('a', 'score'),
      () => {},
    )
    dispose()
  })
  const before = read.mock.calls.length
  setRecords((draft) => {
    draft.a!.score++
  })
  flush()
  expect(read).toHaveBeenCalledTimes(before)
  expect(capture.stop()).toEqual([])
})

test('removed columns suspend their retained filters and sorts until they return', () => {
  const h = setup()
  try {
    render(h.View)
    h.table.setColumnFilters([{ id: 'score', value: 15 }])
    h.table.setSorting([{ id: 'score', desc: true }])
    flush()
    expect(h.table.getRowIds()).toEqual(['c', 'a'])
    h.setColumns([{ id: 'label', accessorFn: (item) => item.details.label }])
    flush()
    expect(h.table.getRowIds()).toEqual(['a', 'b', 'c'])
    expect(h.table.state.columnFilters).toEqual([{ id: 'score', value: 15 }])
    expect(h.table.state.sorting).toEqual([{ id: 'score', desc: true }])
    h.setColumns([scoreColumn])
    flush()
    expect(h.table.getRowIds()).toEqual(['c', 'a'])
  } finally {
    h.dispose()
  }
})

test('multi-sort direction changes retain priority and filter updaters compose', () => {
  const h = setup()
  try {
    h.setColumns([
      scoreColumn,
      {
        id: 'name',
        accessorKey: 'name',
        sortFn: (a, b) => String(a).localeCompare(String(b)),
      },
    ])
    flush()
    h.table.setSorting([
      { id: 'score', desc: false },
      { id: 'name', desc: false },
    ])
    h.table.getColumn('score')!.toggleSorting(true, true)
    h.table.getColumn('score')!.setFilterValue(10)
    h.table
      .getColumn('score')!
      .setFilterValue((old: unknown) => Number(old) + 5)
    flush()
    expect(h.table.state.sorting).toEqual([
      { id: 'score', desc: true },
      { id: 'name', desc: false },
    ])
    expect(h.table.getColumn('score')!.getFilterValue()).toBe(15)
    expect(h.table.getRowIds()).toEqual(['c', 'a'])
    h.table.getColumn('score')!.setFilterValue(undefined)
    flush()
    expect(h.table.state.columnFilters).toEqual([])
  } finally {
    h.dispose()
  }
})

test('a Solid effect apply callback can update native view state', () => {
  const h = createRoot((dispose) => {
    const [size, setSize] = createSignal(150)
    const table = createTable({
      source: { ids: () => ['a'], get: () => initial().a },
      columns: [scoreColumn],
    })
    createEffect(size, (value) => table.setColumnSizing({ score: value }))
    return { table, setSize, dispose }
  })
  try {
    flush()
    h.setSize(220)
    flush()
    expect(h.table.getColumn('score')!.getSize()).toBe(220)
  } finally {
    h.dispose()
  }
})

test('column sizing retains its store container and only invalidates changed widths', () => {
  let reads = 0
  const changed = vi.fn()
  const h = createRoot((dispose) => {
    const table = createTable({
      source: { ids: () => [], get: () => undefined },
      columns: [
        { id: 'a', size: 180, minSize: 100, maxSize: 400 },
        { id: 'b', size: 220, minSize: 100, maxSize: 500 },
        { id: 'constructor', size: 150 },
      ],
      onColumnSizingChange: changed,
    })
    createEffect(
      () => {
        reads++
        return table.getColumn('b')!.getSize()
      },
      () => {},
    )
    return { table, dispose }
  })
  flush()
  const container = h.table.state.columnSizing
  const initialReads = reads
  try {
    for (let size = 200; size < 240; size += 10) {
      h.table.getColumn('a')!.setSize(size)
      flush()
    }
    expect(reads).toBe(initialReads)
    expect(h.table.state.columnSizing).toBe(container)
    h.table.setColumnSizing((old) => ({ ...old, b: 320 }))
    h.table.setColumnSizing((old) => ({ ...old, a: 250 }))
    flush()
    expect(h.table.getColumn('b')!.getSize()).toBe(320)
    expect(h.table.getColumn('a')!.getSize()).toBe(250)
    h.table.getColumn('constructor')!.setSize(210)
    flush()
    h.table.setColumnSizing({})
    flush()
    expect(h.table.state.columnSizing).toBe(container)
    expect(Object.keys(container)).toEqual([])
    expect(h.table.getColumn('constructor')!.getSize()).toBe(150)
    expect(h.table.getColumn('b')!.getSize()).toBe(220)
    expect(changed).toHaveBeenCalledTimes(8)
  } finally {
    h.dispose()
  }
})

test('controlled column widths honor caller approval, bounds and disabled resizing', () => {
  const changed = vi.fn()
  const h = createRoot((dispose) => {
    const [sizes, setSizes] = createSignal<Record<string, number>>({})
    const table = createTable({
      source: { ids: () => [], get: () => undefined },
      columns: [
        { id: 'width', size: 180, minSize: 100, maxSize: 400 },
        { id: 'fixed', size: 120, enableResizing: false },
      ],
      state: {
        get columnSizing() {
          return sizes()
        },
      },
      onColumnSizingChange: changed,
    })
    return { table, sizes, setSizes, dispose }
  })
  try {
    h.table.getColumn('width')!.setSize(300)
    flush()
    expect(h.table.getColumn('width')!.getSize()).toBe(180)
    expect(changed).toHaveBeenCalledTimes(1)
    h.setSizes(changed.mock.calls[0]![0])
    flush()
    expect(h.table.getColumn('width')!.getSize()).toBe(300)
    h.setSizes({ width: 900 })
    flush()
    expect(h.table.getColumn('width')!.getSize()).toBe(400)
    h.setSizes({ width: 20 })
    flush()
    expect(h.table.getColumn('width')!.getSize()).toBe(100)
    h.table.getColumn('fixed')!.setSize(250)
    flush()
    expect(h.table.getColumn('fixed')!.getSize()).toBe(120)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(() => h.table.getColumn('width')!.setSize(Infinity)).toThrow(
      'finite',
    )
    h.setSizes({})
    flush()
    expect(h.table.getColumn('width')!.getSize()).toBe(180)
  } finally {
    h.dispose()
  }
})

test('column visibility updates preserve unrelated subscribers and compose before flush', () => {
  let reads = 0
  const changed = vi.fn()
  const h = createRoot((dispose) => {
    const table = createTable({
      source: { ids: () => [], get: () => undefined },
      columns: [{ id: 'a' }, { id: 'b' }, { id: 'constructor' }],
      onColumnVisibilityChange: changed,
    })
    createEffect(
      () => {
        reads++
        return table.getColumn('b')!.getIsVisible()
      },
      () => {},
    )
    return { table, dispose }
  })
  flush()
  const container = h.table.state.columnVisibility
  const initialReads = reads
  try {
    for (const visible of [false, true, false, true]) {
      h.table.getColumn('a')!.toggleVisibility(visible)
      flush()
    }
    expect(h.table.state.columnVisibility).toBe(container)
    expect(reads).toBe(initialReads)
    h.table.getColumn('b')!.toggleVisibility(false)
    h.table.getColumn('constructor')!.toggleVisibility(false)
    flush()
    expect(h.table.getVisibleColumns().map((column) => column.id)).toEqual([
      'a',
    ])
    expect(reads).toBe(initialReads + 1)
    h.table.setColumnVisibility({})
    flush()
    expect(h.table.state.columnVisibility).toBe(container)
    expect(Object.keys(container)).toEqual([])
    expect(h.table.getVisibleColumns().map((column) => column.id)).toEqual([
      'a',
      'b',
      'constructor',
    ])
    expect(reads).toBe(initialReads + 2)
    expect(changed).toHaveBeenCalledTimes(7)
  } finally {
    h.dispose()
  }
})
