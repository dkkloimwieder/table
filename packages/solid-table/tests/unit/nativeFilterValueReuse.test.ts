import { afterEach, expect, test, vi } from 'vitest'
import {
  createEffect,
  createRoot,
  createSignal,
  createStore,
  flush,
} from 'solid-js'
import { createTable } from '../../src/native'
import type { NativeColumnDef, NativeTableState } from '../../src/native'

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  flush()
})
function root<T>(setup: (dispose: () => void) => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose)
    return setup(dispose)
  })
}
function observe<T>(read: () => T) {
  let current!: T
  root(() =>
    createEffect(read, (value) => {
      current = value
    }),
  )
  flush()
  return () => current
}

test('unflagged callbacks keep separate reads and their evaluation order', () => {
  const events: Array<string> = []
  let reads = 0
  const table = root(() =>
    createTable({
      source: { ids: () => ['a'], get: () => ({ value: 'match' }) },
      columns: [
        {
          id: 'value',
          accessorFn: () => {
            events.push('access')
            return ++reads === 1 ? 'filter' : 'search'
          },
          filterFn: (value) => {
            events.push(`filter:${value}`)
            return value === 'filter'
          },
        },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'search',
      },
      globalFilterFn: (value) => {
        events.push(`search:${value}`)
        return value === 'search'
      },
    }),
  )
  expect(table.getFilteredRowIds()).toEqual(['a'])
  expect(events).toEqual(['access', 'filter:filter', 'access', 'search:search'])
})

test('mixed columns reuse only flagged values with a custom global predicate', () => {
  const first = vi.fn(() => 'first')
  const second = vi.fn(() => 'second')
  const searched: Array<unknown> = []
  const table = root(() =>
    createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [
        {
          id: 'first',
          accessorFn: first,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
        { id: 'second', accessorFn: second, filterFn: () => true },
      ],
      initialState: {
        columnFilters: [
          { id: 'first', value: true },
          { id: 'second', value: true },
        ],
        globalFilter: 'query',
      },
      globalFilterFn: (value) => {
        searched.push(value)
        return value === 'second'
      },
    }),
  )
  expect(table.getFilteredRowIds()).toEqual(['a'])
  expect(searched).toEqual(['first', 'second'])
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(2)
})

test.each([undefined, null])(
  'reuse retains %s values without another accessor call',
  (value) => {
    const access = vi.fn(() => value)
    const search = vi.fn((candidate: unknown) => candidate === value)
    const table = root(() =>
      createTable({
        source: { ids: () => ['a'], get: () => ({}) },
        columns: [
          {
            id: 'value',
            accessorFn: access,
            filterFn: () => true,
            enableFilterValueReuse: true,
          },
        ],
        initialState: {
          columnFilters: [{ id: 'value', value: true }],
          globalFilter: 'query',
        },
        globalFilterFn: search,
      }),
    )
    expect(table.getFilteredRowIds()).toEqual(['a'])
    expect(access).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]![0]).toBe(value)
  },
)

test('failed column predicates and successful global predicates retain short circuits', () => {
  const later = vi.fn(() => 'later')
  const first = vi.fn((record: { pass: boolean }) =>
    record.pass ? 'match' : 'fail',
  )
  const table = root(() =>
    createTable({
      source: { ids: () => ['a', 'b'], get: (id) => ({ pass: id === 'b' }) },
      columns: [
        {
          id: 'first',
          accessorFn: first,
          filterFn: (value) => value === 'match',
          enableFilterValueReuse: true,
        },
        { id: 'later', accessorFn: later, enableFilterValueReuse: true },
      ],
      initialState: {
        columnFilters: [{ id: 'first', value: true }],
        globalFilter: 'match',
      },
    }),
  )
  expect(table.getFilteredRowIds()).toEqual(['b'])
  expect(first).toHaveBeenCalledTimes(2)
  expect(later).not.toHaveBeenCalled()
})

test('values stay isolated between records and refresh after nested edits and source replacement', () => {
  const h = root(() => {
    const [records, setRecords] = createStore({
      a: { nested: { value: 'yes' } },
      b: { nested: { value: 'no' } },
    })
    const access = vi.fn((record: typeof records.a) => record.nested.value)
    const table = createTable({
      source: { ids: () => ['a', 'b'], get: (id) => records[id as 'a' | 'b'] },
      columns: [
        {
          id: 'value',
          accessorFn: access,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'yes',
      },
    })
    return { table, setRecords, access }
  })
  const rows = observe(h.table.getFilteredRowIds)
  expect(rows()).toEqual(['a'])
  expect(h.access).toHaveBeenCalledTimes(2)
  h.setRecords((draft) => {
    draft.a.nested.value = 'no'
    draft.b.nested.value = 'yes'
  })
  flush()
  expect(rows()).toEqual(['b'])
  expect(h.access).toHaveBeenCalledTimes(4)
  h.setRecords((draft) => {
    draft.a = { nested: { value: 'yes' } }
    draft.b = { nested: { value: 'no' } }
  })
  flush()
  expect(rows()).toEqual(['a'])
  expect(h.access).toHaveBeenCalledTimes(6)
})

test('reactive opt-in and accessor getters refresh matching without a new column identity', () => {
  const h = root(() => {
    const [reuse, setReuse] = createSignal(false)
    const [alternate, setAlternate] = createSignal(false)
    const original = vi.fn(() => 'yes')
    const replacement = vi.fn(() => 'no')
    const definition: NativeColumnDef<{}> = {
      id: 'value',
      get accessorFn() {
        return alternate() ? replacement : original
      },
      get enableFilterValueReuse() {
        return reuse()
      },
      filterFn: () => true,
    }
    const table = createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [definition],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'yes',
      },
    })
    return { table, setReuse, setAlternate, original, replacement }
  })
  const rows = observe(h.table.getFilteredRowIds)
  expect(rows()).toEqual(['a'])
  expect(h.original).toHaveBeenCalledTimes(2)
  h.setReuse(true)
  flush()
  expect(rows()).toEqual(['a'])
  expect(h.original).toHaveBeenCalledTimes(3)
  h.setAlternate(true)
  flush()
  expect(rows()).toEqual([])
  expect(h.replacement).toHaveBeenCalledTimes(1)
  h.setReuse(false)
  flush()
  expect(h.replacement).toHaveBeenCalledTimes(3)
})

test('a replacement column with the same ID uses its current definition and policy', () => {
  const h = root(() => {
    const first = vi.fn(() => 'yes')
    const replacement = vi.fn(() => 'no')
    const [columns, setColumns] = createSignal<Array<NativeColumnDef<{}>>>([
      {
        id: 'value',
        accessorFn: first,
        filterFn: () => true,
        enableFilterValueReuse: true,
      },
    ])
    const table = createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      get columns() {
        return columns()
      },
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'yes',
      },
    })
    return { table, setColumns, first, replacement }
  })
  const rows = observe(h.table.getFilteredRowIds)
  expect(rows()).toEqual(['a'])
  h.setColumns([
    { id: 'value', accessorFn: h.replacement, filterFn: () => true },
  ])
  flush()
  expect(rows()).toEqual([])
  expect(h.first).toHaveBeenCalledTimes(1)
  expect(h.replacement).toHaveBeenCalledTimes(2)
})

test('controlled filter and search commands start fresh matcher passes', () => {
  const h = root(() => {
    const [state, setState] = createStore<Partial<NativeTableState>>({
      columnFilters: [{ id: 'value', value: true }],
      globalFilter: 'yes',
    })
    const access = vi.fn(() => 'yes')
    const table = createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [
        {
          id: 'value',
          accessorFn: access,
          filterFn: (_value, filter) => filter === true,
          enableFilterValueReuse: true,
        },
      ],
      get state() {
        return state
      },
      onGlobalFilterChange: (updater) =>
        setState((draft) => {
          draft.globalFilter =
            typeof updater === 'function'
              ? updater(draft.globalFilter!)
              : updater
        }),
      onColumnFiltersChange: (updater) =>
        setState((draft) => {
          draft.columnFilters =
            typeof updater === 'function'
              ? updater(draft.columnFilters!)
              : updater
        }),
    })
    return { table, access }
  })
  const rows = observe(h.table.getFilteredRowIds)
  expect(rows()).toEqual(['a'])
  h.table.setGlobalFilter('no')
  flush()
  expect(rows()).toEqual([])
  expect(h.access).toHaveBeenCalledTimes(2)
  h.table.setColumnFilters([{ id: 'value', value: false }])
  flush()
  expect(rows()).toEqual([])
  expect(h.access).toHaveBeenCalledTimes(3)
  h.table.setGlobalFilter('yes')
  h.table.setColumnFilters([{ id: 'value', value: true }])
  flush()
  expect(rows()).toEqual(['a'])
  expect(h.access).toHaveBeenCalledTimes(4)
})

test('facet extraction, facet matcher passes, sorting, and cell reads keep separate accesses', () => {
  const access = vi.fn((record: { value: string }) => record.value)
  const table = root(() =>
    createTable({
      source: { ids: () => ['a', 'b'], get: () => ({ value: 'yes' }) },
      columns: [
        {
          id: 'value',
          accessorFn: access,
          sortFn: () => 0,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
        { id: 'other', accessorFn: () => 'other', enableGlobalFilter: false },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'yes',
        sorting: [{ id: 'value', desc: false }],
      },
    }),
  )
  observe(table.getRowIds)
  expect(access).toHaveBeenCalledTimes(4)
  observe(table.getColumn('value')!.getFacetedUniqueValues)
  expect(access).toHaveBeenCalledTimes(8)
  observe(table.getColumn('other')!.getFacetedUniqueValues)
  expect(access).toHaveBeenCalledTimes(10)
  expect(table.getRow('a').getValue('value')).toBe('yes')
  expect(table.getRow('a').getValue('value')).toBe('yes')
  expect(access).toHaveBeenCalledTimes(12)
})

test('disposal releases accessor and policy dependencies', () => {
  const h = root((dispose) => {
    const [value, setValue] = createSignal('yes')
    const [reuse, setReuse] = createSignal(true)
    const access = vi.fn(value)
    const policy = vi.fn(reuse)
    const table = createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [
        {
          id: 'value',
          accessorFn: access,
          filterFn: () => true,
          get enableFilterValueReuse() {
            return policy()
          },
        },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'yes',
      },
    })
    createEffect(table.getFilteredRowIds, () => {})
    return { dispose, access, policy, setValue, setReuse }
  })
  flush()
  expect(h.access).toHaveBeenCalledTimes(1)
  h.dispose()
  flush()
  const reads = h.access.mock.calls.length
  const policies = h.policy.mock.calls.length
  h.setValue('no')
  h.setReuse(false)
  flush()
  expect(h.access).toHaveBeenCalledTimes(reads)
  expect(h.policy).toHaveBeenCalledTimes(policies)
})

test.each([false, true])(
  'duplicate filters retain their predicates with reuse set to %s',
  (reuse) => {
    const access = vi.fn(() => 7)
    const predicate = vi.fn(
      (value: unknown, minimum: unknown) => Number(value) >= Number(minimum),
    )
    const table = root(() =>
      createTable({
        source: { ids: () => ['a'], get: () => ({}) },
        columns: [
          {
            id: 'value',
            accessorFn: access,
            filterFn: predicate,
            enableFilterValueReuse: reuse,
          },
        ],
        initialState: {
          columnFilters: [
            { id: 'value', value: 2 },
            { id: 'value', value: 5 },
          ],
        },
      }),
    )
    expect(table.getFilteredRowIds()).toEqual(['a'])
    expect(access).toHaveBeenCalledTimes(reuse ? 1 : 2)
    expect(predicate.mock.calls).toEqual([
      [7, 2],
      [7, 5],
    ])
  },
)

test('columns with the same accessor function retain separate values', () => {
  const access = vi.fn(() => 'yes')
  const table = root(() =>
    createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [
        {
          id: 'first',
          accessorFn: access,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
        { id: 'second', accessorFn: access, enableFilterValueReuse: true },
      ],
      initialState: {
        columnFilters: [{ id: 'first', value: true }],
        globalFilter: 'yes',
      },
      globalFilterFn: (_value, _query, column) => column.id === 'second',
    }),
  )
  expect(table.getFilteredRowIds()).toEqual(['a'])
  expect(access).toHaveBeenCalledTimes(2)
})

test('accessorKey reuse tracks reactive property getters', () => {
  const h = root(() => {
    const [value, setValue] = createSignal('yes')
    const read = vi.fn(value)
    const record = {
      get value() {
        return read()
      },
    }
    const table = createTable({
      source: { ids: () => ['a'], get: () => record },
      columns: [
        {
          id: 'value',
          accessorKey: 'value',
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'yes',
      },
    })
    return { table, setValue, read }
  })
  const rows = observe(h.table.getFilteredRowIds)
  expect(rows()).toEqual(['a'])
  expect(h.read).toHaveBeenCalledTimes(1)
  h.setValue('no')
  flush()
  expect(rows()).toEqual([])
  expect(h.read).toHaveBeenCalledTimes(2)
})

test('two opted-in definitions reuse their own distinct values', () => {
  const first = vi.fn(() => 'first')
  const second = vi.fn(() => 'second')
  const searched: Array<unknown> = []
  const table = root(() =>
    createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [
        {
          id: 'first',
          accessorFn: first,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
        {
          id: 'second',
          accessorFn: second,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
      ],
      initialState: {
        columnFilters: [
          { id: 'first', value: true },
          { id: 'second', value: true },
        ],
        globalFilter: 'query',
      },
      globalFilterFn: (value) => {
        searched.push(value)
        return value === 'second'
      },
    }),
  )
  expect(table.getFilteredRowIds()).toEqual(['a'])
  expect(searched).toEqual(['first', 'second'])
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
})

test('a reactive custom search replacement starts a fresh matcher pass', () => {
  const h = root(() => {
    const [accept, setAccept] = createSignal(true)
    const first = vi.fn(() => true)
    const replacement = vi.fn(() => false)
    const access = vi.fn(() => 'yes')
    const table = createTable({
      source: { ids: () => ['a'], get: () => ({}) },
      columns: [
        {
          id: 'value',
          accessorFn: access,
          filterFn: () => true,
          enableFilterValueReuse: true,
        },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: true }],
        globalFilter: 'query',
      },
      get globalFilterFn() {
        return accept() ? first : replacement
      },
    })
    return { table, setAccept, first, replacement, access }
  })
  const rows = observe(h.table.getFilteredRowIds)
  expect(rows()).toEqual(['a'])
  expect(h.first).toHaveBeenCalledTimes(1)
  h.setAccept(false)
  flush()
  expect(rows()).toEqual([])
  expect(h.replacement).toHaveBeenCalledTimes(1)
  expect(h.access).toHaveBeenCalledTimes(2)
})
