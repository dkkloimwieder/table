import { expect, test, vi } from 'vitest'
import {
  OBSERVE,
  createEffect,
  createRoot,
  createSignal,
  createStore,
  flush,
} from 'solid-js'
import { createTable } from '../../src/native'
import type { NativeColumnDef, NativeTableState } from '../../src/native'

type Item = {
  name: string
  color: string
  score: number | null | undefined
  tags: Array<string>
  unused: number
}
const initial = (): Record<string, Item> => ({
  a: { name: 'Ada', color: 'red', score: 20, tags: ['x', 'x', 'y'], unused: 0 },
  b: { name: 'Grace', color: 'blue', score: 10, tags: ['x'], unused: 0 },
  c: { name: 'Katherine', color: 'red', score: 30, tags: ['y'], unused: 0 },
  d: { name: 'Dorothy', color: 'blue', score: 30, tags: [], unused: 0 },
})
function setup() {
  return createRoot((dispose) => {
    const [records, setRecords] = createStore(initial())
    const [ids, setIds] = createSignal(['a', 'b', 'c', 'd'])
    const [manual, setManual] = createSignal(false)
    const score = vi.fn((item: Item) => item.score)
    const filter = vi.fn(
      (value: unknown, minimum: unknown) => Number(value) >= Number(minimum),
    )
    const compare = vi.fn((a: unknown, b: unknown) => Number(a) - Number(b))
    const unique = vi.fn((item: Item) => item.tags)
    const definitions: Array<NativeColumnDef<Item>> = [
      { id: 'name', accessorKey: 'name' },
      {
        id: 'color',
        accessorKey: 'color',
        filterFn: (value, filter) => value === filter,
      },
      { id: 'score', accessorFn: score, filterFn: filter, sortFn: compare },
      {
        id: 'tags',
        accessorKey: 'tags',
        getUniqueValues: unique,
        enableGlobalFilter: false,
      },
    ]
    const [columns, setColumns] = createSignal(definitions)
    const table = createTable({
      source: { ids, get: (id) => records[id] },
      get columns() {
        return columns()
      },
      get manualFiltering() {
        return manual()
      },
      get manualSorting() {
        return manual()
      },
    })
    return {
      table,
      records,
      setRecords,
      ids,
      setIds,
      definitions,
      setColumns,
      setManual,
      score,
      filter,
      compare,
      unique,
      dispose,
    }
  })
}
function observe<T>(read: () => T) {
  let current!: T
  const stop = createRoot((dispose) => {
    createEffect(read, (value) => {
      current = value
    })
    return dispose
  })
  flush()
  return { value: () => current, stop }
}

test('global search combines column filters and responds to visible eligible columns', () => {
  const h = setup()
  const view = observe(h.table.getRowIds)
  try {
    h.table.setGlobalFilter('  RED ')
    h.table.getColumn('score')!.setFilterValue(25)
    flush()
    expect(view.value()).toEqual(['c'])
    h.table.getColumn('color')!.toggleVisibility(false)
    flush()
    expect(view.value()).toEqual([])
    h.table.setGlobalFilter('30')
    flush()
    expect(view.value()).toEqual(['c', 'd'])
    h.table.setGlobalFilter('x')
    flush()
    expect(view.value()).toEqual([])
    h.table.setGlobalFilter('   ')
    flush()
    expect(view.value()).toEqual(['c', 'd'])
    h.table.getColumn('color')!.setFilterValue('red')
    flush()
    expect(view.value()).toEqual(['c']) // hidden column filters still apply
  } finally {
    view.stop()
    h.dispose()
  }
})

test('facets exclude their own filter, include other filters and global search, and deduplicate values per record', () => {
  const h = setup()
  const colors = observe(h.table.getColumn('color')!.getFacetedUniqueValues)
  const scores = observe(h.table.getColumn('score')!.getFacetedUniqueValues)
  const tags = observe(h.table.getColumn('tags')!.getFacetedUniqueValues)
  try {
    expect(tags.value()).toEqual(
      new Map([
        ['x', 2],
        ['y', 2],
      ]),
    )
    h.table.setColumnFilters([
      { id: 'color', value: 'red' },
      { id: 'score', value: 25 },
    ])
    flush()
    expect(colors.value()).toEqual(
      new Map([
        ['red', 1],
        ['blue', 1],
      ]),
    )
    expect(scores.value()).toEqual(
      new Map([
        [20, 1],
        [30, 1],
      ]),
    )
    expect(tags.value()).toEqual(new Map([['y', 1]]))
    expect(h.table.getColumn('score')!.getFacetedMinMaxValues()).toEqual([
      20, 30,
    ])
    h.table.setGlobalFilter('Katherine')
    flush()
    expect(colors.value()).toEqual(new Map([['red', 1]]))
    expect(scores.value()).toEqual(new Map([[30, 1]]))
    h.table.setGlobalFilter('missing')
    flush()
    expect(colors.value()).toEqual(new Map())
    expect(h.table.getColumn('score')!.getFacetedMinMaxValues()).toBeUndefined()
  } finally {
    colors.stop()
    scores.stop()
    tags.stop()
    h.dispose()
  }
})

test('record edits, nested values, replacement, append and removal refresh facets through native tracking', () => {
  const h = setup()
  const tags = observe(h.table.getColumn('tags')!.getFacetedUniqueValues)
  const colors = observe(h.table.getColumn('color')!.getFacetedUniqueValues)
  try {
    h.setRecords((draft) => {
      draft.a!.tags.push('z')
      draft.a!.color = 'green'
      draft.b = { ...draft.b!, tags: ['z'] }
      draft.e = {
        name: 'New',
        color: 'green',
        score: 0,
        tags: ['z'],
        unused: 0,
      }
      delete draft.c
    })
    h.setIds(['e', 'b', 'a', 'd'])
    flush()
    expect(tags.value()).toEqual(
      new Map([
        ['z', 3],
        ['x', 1],
        ['y', 1],
      ]),
    )
    expect(colors.value()).toEqual(
      new Map([
        ['green', 2],
        ['blue', 2],
      ]),
    )
  } finally {
    tags.stop()
    colors.stop()
    h.dispose()
  }
})

test('facets run only while observed and release their dependencies without disposing the table', () => {
  const h = setup()
  const capture = OBSERVE!.diagnostics.capture()
  const rows = observe(h.table.getRowIds)
  try {
    expect(h.unique).not.toHaveBeenCalled()
    const tags = observe(h.table.getColumn('tags')!.getFacetedUniqueValues)
    expect(h.unique).toHaveBeenCalledTimes(4)
    h.setRecords((draft) => {
      draft.a!.unused++
    })
    flush()
    expect(h.unique).toHaveBeenCalledTimes(4)
    tags.stop()
    flush()
    h.setRecords((draft) => {
      draft.a!.tags.push('z')
    })
    flush()
    expect(h.unique).toHaveBeenCalledTimes(4)
    const reopened = observe(h.table.getColumn('tags')!.getFacetedUniqueValues)
    expect(reopened.value()?.get('z')).toBe(1)
    expect(h.unique).toHaveBeenCalledTimes(8)
    reopened.stop()
  } finally {
    rows.stop()
    h.dispose()
  }
  expect(capture.stop()).toEqual([])
})

test('changing only a facet column filter does not rescan its own values', () => {
  const h = setup()
  const scores = observe(h.table.getColumn('score')!.getFacetedUniqueValues)
  try {
    expect(h.score).toHaveBeenCalledTimes(4)
    const values = scores.value()
    h.table.getColumn('score')!.setFilterValue(25)
    flush()
    expect(scores.value()).toBe(values)
    expect(h.score).toHaveBeenCalledTimes(4)
    h.table.getColumn('score')!.setFilterValue(30)
    flush()
    expect(h.score).toHaveBeenCalledTimes(4)
    h.table.getColumn('color')!.setFilterValue('red')
    flush()
    expect(scores.value()).toEqual(
      new Map([
        [20, 1],
        [30, 1],
      ]),
    )
    expect(h.score).toHaveBeenCalledTimes(6)
  } finally {
    scores.stop()
    h.dispose()
  }
})

test('manual processing retains state and bypasses all local field work and facet counts', () => {
  const h = setup()
  h.setManual(true)
  h.table.setColumnFilters([{ id: 'score', value: 25 }])
  h.table.setGlobalFilter('red')
  h.table.setSorting([{ id: 'score', desc: true }])
  flush()
  const rows = observe(h.table.getRowIds)
  const facets = observe(h.table.getColumn('tags')!.getFacetedUniqueValues)
  try {
    expect(rows.value()).toEqual(['a', 'b', 'c', 'd'])
    expect(facets.value()).toBeUndefined()
    expect(h.score).not.toHaveBeenCalled()
    expect(h.unique).not.toHaveBeenCalled()
    h.setManual(false)
    flush()
    expect(rows.value()).toEqual(['c'])
    expect(facets.value()).toEqual(new Map([['y', 1]]))
    h.setManual(true)
    flush()
    const before = h.score.mock.calls.length
    h.setRecords((draft) => {
      draft.a!.score = 100
    })
    flush()
    expect(h.score).toHaveBeenCalledTimes(before)
    expect(rows.value()).toEqual(['a', 'b', 'c', 'd'])
    expect(h.table.state.globalFilter).toBe('red')
  } finally {
    rows.stop()
    facets.stop()
    h.dispose()
  }
})

test('external facet counts stay authoritative and reactive in manual mode', () => {
  const h = createRoot((dispose) => {
    const [counts, setCounts] = createSignal<
      ReadonlyMap<unknown, number> | undefined
    >(
      new Map([
        [2, 40],
        [9, 5],
      ]),
    )
    const get = vi.fn(() => ({ score: 0 }))
    const table = createTable({
      source: { ids: () => ['a'], get },
      columns: [{ id: 'score', accessorKey: 'score' }],
      manualFiltering: true,
      getFacetedUniqueValues: () => counts(),
    })
    return { table, setCounts, get, dispose }
  })
  const values = observe(h.table.getColumn('score')!.getFacetedMinMaxValues)
  try {
    expect(values.value()).toEqual([2, 9])
    h.setCounts(new Map([[4, 11]]))
    flush()
    expect(values.value()).toEqual([4, 4])
    h.setCounts(undefined)
    flush()
    expect(values.value()).toBeUndefined()
    expect(h.get).not.toHaveBeenCalled()
  } finally {
    values.stop()
    h.dispose()
  }
})

test('column metadata and custom global matching remain reactive', () => {
  const h = createRoot((dispose) => {
    const [label, setLabel] = createSignal('ready')
    const [query, setQuery] = createSignal('ready')
    const table = createTable<{ active: boolean }, { label: string }>({
      source: { ids: () => ['a'], get: () => ({ active: true }) },
      get columns() {
        return [
          {
            id: 'active',
            accessorKey: 'active' as const,
            meta: { label: label() },
          },
        ]
      },
      get state() {
        return { globalFilter: query() }
      },
      onGlobalFilterChange: setQuery,
      globalFilterFn: (value, search, column) =>
        value === true && column.meta!.label === search,
    })
    return { table, setLabel, dispose }
  })
  const rows = observe(h.table.getRowIds)
  try {
    expect(rows.value()).toEqual(['a'])
    h.setLabel('done')
    flush()
    expect(rows.value()).toEqual([])
    h.table.setGlobalFilter('done')
    flush()
    expect(rows.value()).toEqual(['a'])
  } finally {
    rows.stop()
    h.dispose()
  }
})

test('column removal disposes its facet handles and restoration creates current counts', () => {
  const h = setup()
  const old = h.table.getColumn('color')!
  const colors = observe(old.getFacetedUniqueValues)
  try {
    h.setColumns(h.definitions.filter((column) => column.id !== 'color'))
    flush()
    expect(old.getFacetedUniqueValues()).toBeUndefined()
    h.setRecords((draft) => {
      draft.a!.color = 'green'
    })
    h.setColumns(h.definitions)
    flush()
    expect(h.table.getColumn('color')).not.toBe(old)
    expect(old.getFacetedUniqueValues()).toBeUndefined()
    expect(h.table.getColumn('color')!.getFacetedUniqueValues()).toEqual(
      new Map([
        ['green', 1],
        ['blue', 2],
        ['red', 1],
      ]),
    )
  } finally {
    colors.stop()
    h.dispose()
  }
})

test('sorting reads one key per input row, preserves ties and ignores unused fields', () => {
  const h = setup()
  h.table.setSorting([{ id: 'score', desc: false }])
  flush()
  const rows = observe(h.table.getRowIds)
  try {
    expect(rows.value()).toEqual(['b', 'a', 'c', 'd'])
    expect(h.score).toHaveBeenCalledTimes(4)
    const comparisons = h.compare.mock.calls.length
    h.setRecords((draft) => {
      draft.a!.unused++
    })
    flush()
    expect(h.compare).toHaveBeenCalledTimes(comparisons)
    expect(h.score).toHaveBeenCalledTimes(4)
    h.table.getRow('a').toggleSelected(true)
    h.setRecords((draft) => {
      draft.a!.score = 40
    })
    flush()
    expect(rows.value()).toEqual(['b', 'c', 'd', 'a'])
    expect(h.score).toHaveBeenCalledTimes(8)
    expect(h.table.getRow('a').getIsSelected()).toBe(true)
    h.setIds(['d', 'c', 'b', 'a'])
    flush()
    expect(rows.value()).toEqual(['b', 'd', 'c', 'a'])
    h.table.setSorting([{ id: 'score', desc: true }])
    flush()
    expect(rows.value()).toEqual(['a', 'd', 'c', 'b'])
  } finally {
    rows.stop()
    h.dispose()
  }
})

test('missing values have explicit direction-independent placement and stable secondary keys', () => {
  const h = setup()
  h.setRecords((draft) => {
    draft.a!.score = null
    draft.b!.score = undefined
    draft.c!.score = NaN
  })
  h.table.setSorting([{ id: 'score', desc: false }])
  flush()
  const rows = observe(h.table.getRowIds)
  try {
    expect(rows.value()).toEqual(['d', 'a', 'b', 'c'])
    h.table.setSorting([{ id: 'score', desc: true }])
    flush()
    expect(rows.value()).toEqual(['d', 'a', 'b', 'c'])
    h.setColumns(
      h.definitions.map((column) =>
        column.id === 'score' ? { ...column, sortMissing: 'first' } : column,
      ),
    )
    flush()
    expect(rows.value()).toEqual(['a', 'b', 'c', 'd'])
    h.setColumns(
      h.definitions.map((column) =>
        column.id === 'name'
          ? { ...column, sortFn: (a, b) => String(b).localeCompare(String(a)) }
          : column,
      ),
    )
    h.table.setSorting([
      { id: 'score', desc: false },
      { id: 'name', desc: false },
    ])
    flush()
    expect(rows.value()).toEqual(['d', 'c', 'b', 'a'])
  } finally {
    rows.stop()
    h.dispose()
  }
})

test('custom missing-value handling and batched membership changes preserve correct sorted IDs', () => {
  const h = setup()
  h.setColumns(
    h.definitions.map((column) =>
      column.id === 'score'
        ? {
            ...column,
            sortMissing: false,
            sortFn: (a, b) => Number(a ?? -1) - Number(b ?? -1),
          }
        : column,
    ),
  )
  h.setRecords((draft) => {
    draft.a!.score = null
    draft.e = { name: 'New', color: 'green', score: 15, tags: [], unused: 0 }
    delete draft.c
  })
  h.setIds(['a', 'b', 'd', 'e'])
  h.table.setSorting([{ id: 'score', desc: false }])
  flush()
  expect(h.table.getRowIds()).toEqual(['a', 'b', 'e', 'd'])
  h.dispose()
})

test('unused local features release field dependencies when their last consumer stops', () => {
  const h = setup()
  h.table.setColumnFilters([{ id: 'score', value: 15 }])
  h.table.setSorting([{ id: 'score', desc: false }])
  flush()
  const rows = observe(h.table.getRowIds)
  rows.stop()
  flush()
  const before = h.score.mock.calls.length
  h.setRecords((draft) => {
    draft.a!.score = 99
  })
  flush()
  expect(h.score).toHaveBeenCalledTimes(before)
  expect(h.table.getRowIds()).toEqual(['c', 'd', 'a'])
  h.dispose()
})

test('controlled global-search updaters compose without internal state mirroring', () => {
  const changed = vi.fn()
  const h = createRoot((dispose) => {
    const [search, setSearch] =
      createSignal<NativeTableState['globalFilter']>('A')
    const table = createTable({
      source: { ids: () => ['a'], get: () => initial().a! },
      columns: [{ id: 'name', accessorKey: 'name' }],
      get state() {
        return { globalFilter: search() }
      },
      onGlobalFilterChange: (updater) => {
        changed(updater)
        setSearch(updater)
      },
    })
    return { table, dispose }
  })
  try {
    h.table.setGlobalFilter((old) => old + 'd')
    h.table.setGlobalFilter((old) => old + 'a')
    flush()
    expect(h.table.state.globalFilter).toBe('Ada')
    expect(changed).toHaveBeenCalledTimes(2)
    expect(h.table.getRowIds()).toEqual(['a'])
  } finally {
    h.dispose()
  }
})
