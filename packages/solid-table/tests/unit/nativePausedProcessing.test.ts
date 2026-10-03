import { createRoot, createSignal, createStore, flush } from 'solid-js'
import { expect, test, vi } from 'vitest'
import { createTable, nativeAggregations } from '../../src/native'

function setup(grouped = false) {
  return createRoot((dispose) => {
    const [records, setRecords] = createStore({
      a: { id: 'a', group: 'one', value: 1 },
      b: { id: 'b', group: 'two', value: 2 },
      c: { id: 'c', group: 'one', value: 3 },
    })
    const [paused, setPaused] = createSignal(false)
    const access = vi.fn((row: { value: number }) => row.value)
    const table = createTable<(typeof records)['a']>({
      source: {
        ids: () => ['a', 'b', 'c'],
        get: (id) => records[id as keyof typeof records],
      },
      get rowProcessingPaused() {
        return paused()
      },
      columns: [
        { id: 'group', accessorKey: 'group' },
        {
          id: 'weight',
          accessorKey: 'value',
          aggregationFn: nativeAggregations.sum,
          sortFn: (a, b) => Number(a) - Number(b),
        },
        {
          id: 'value',
          accessorFn: access,
          filterFn: (v, limit) => Number(v) >= Number(limit),
          sortFn: (a, b) => Number(a) - Number(b),
          aggregationFn: nativeAggregations.sum,
        },
      ],
      initialState: {
        columnFilters: [{ id: 'value', value: 2 }],
        sorting: [{ id: 'value', desc: false }],
        grouping: grouped ? ['group'] : [],
        groupSorting: [{ depth: 0, id: 'value', desc: false }],
      },
    })
    return { table, records, setRecords, setPaused, access, dispose }
  })
}

test('paused processing keeps row references and skips scans while saved values remain live', () => {
  const h = setup()
  try {
    const ids = h.table.getRowIds()
    const filtered = h.table.getFilteredRowIds()
    const display = h.table.getDisplayKeys()
    const identity = h.records.b
    expect(ids).toEqual(['b', 'c'])
    h.setPaused(true)
    flush()
    expect(h.table.getRowIds()).toBe(ids)
    h.access.mockClear()
    h.setRecords((draft) => {
      draft.b.value = 9
      draft.c.value = 0
      draft.a.value = 4
    })
    flush()
    expect(h.table.getRowIds()).toBe(ids)
    expect(h.table.getFilteredRowIds()).toBe(filtered)
    expect(h.table.getDisplayKeys()).toBe(display)
    expect(h.access).not.toHaveBeenCalled()
    expect(h.table.getValue('b', 'value')).toBe(9)
    expect(h.records.b).toBe(identity)
    h.setPaused(false)
    flush()
    expect(h.table.getRowIds()).toEqual(['a', 'b'])
    expect(h.table.getDisplayIndex('a')).toBe(0)
  } finally {
    h.dispose()
    flush()
  }
})

test('paused groups retain membership, ordering and expansion while aggregates use live values', () => {
  const h = setup(true)
  try {
    h.table.toggleAllGroupsExpanded(true)
    flush()
    const roots = h.table.getRootGroupKeys()
    const display = h.table.getDisplayKeys()
    const first = h.table.getGroup(roots[0]!)
    expect([...first.getLeafRowIds()]).toEqual(['b'])
    h.setPaused(true)
    flush()
    h.setRecords((draft) => {
      draft.b.group = 'one'
      draft.b.value = 20
    })
    flush()
    expect(h.table.getRootGroupKeys()).toBe(roots)
    expect(h.table.getDisplayKeys()).toBe(display)
    expect([...first.getLeafRowIds()]).toEqual(['b'])
    expect(first.getAggregateValue('value')).toBe(20)
    h.setPaused(false)
    flush()
    expect(h.table.getRootGroupKeys()).toHaveLength(1)
    expect([
      ...h.table.getGroup(h.table.getRootGroupKeys()[0]!).getLeafRowIds(),
    ]).toEqual(['b', 'c'])
  } finally {
    h.dispose()
    flush()
  }
})

test('a table first read while paused initializes once and resumes from current records', () => {
  const h = setup()
  try {
    h.setPaused(true)
    flush()
    expect(h.table.getRowIds()).toEqual(['b', 'c'])
    h.setRecords((draft) => {
      draft.b.value = 0
    })
    flush()
    expect(h.table.getRowIds()).toEqual(['b', 'c'])
    h.setPaused(false)
    flush()
    expect(h.table.getRowIds()).toEqual(['c'])
  } finally {
    h.dispose()
    flush()
  }
})

test('paused nested group APIs retain their last aggregate order', () => {
  const h = setup(true)
  try {
    h.setRecords((draft) => {
      draft.a.value = 2
    })
    h.table.setGrouping(['group', 'value'])
    h.table.setGroupSorting([{ depth: 1, id: 'weight', desc: false }])
    flush()
    const parent = h.table.getGroup(h.table.getRootGroupKeys()[0]!)
    const children = parent.getChildGroupKeys()
    expect(children).toHaveLength(2)
    h.setPaused(true)
    flush()
    h.setRecords((draft) => {
      draft.a.value = 99
    })
    flush()
    expect(parent.getChildGroupKeys()).toBe(children)
    h.setPaused(false)
    flush()
    expect(parent.getChildGroupKeys()).not.toEqual(children)
  } finally {
    h.dispose()
    flush()
  }
})
