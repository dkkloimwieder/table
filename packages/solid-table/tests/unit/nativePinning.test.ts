import { expect, test } from 'vitest'
import { createRoot, createSignal, createStore, flush } from 'solid-js'
import { createTable } from '../../src/native'

function setup(keepPinnedRows = true) {
  return createRoot((dispose) => {
    const [records, setRecords] = createStore<
      Record<string, { region: string; amount: number }>
    >({
      a: { region: 'east', amount: 10 },
      b: { region: 'west', amount: 20 },
      c: { region: 'east', amount: 30 },
    })
    const [ids, setIds] = createSignal(['a', 'b', 'c'])
    const [manual, setManual] = createSignal(false)
    const table = createTable({
      source: { ids, get: (id) => records[id] },
      columns: [
        { id: 'region', accessorKey: 'region' },
        {
          id: 'amount',
          accessorKey: 'amount',
          filterFn: (a, b) => Number(a) >= Number(b),
          sortFn: (a, b) => Number(a) - Number(b),
        },
      ],
      keepPinnedRows,
      get manualProcessing() {
        return manual()
      },
    })
    const sections = () => {
      const value = table.getRowSections()
      return Object.fromEntries(
        Object.entries(value).map(([section, keys]) => [
          section,
          keys.map((key) => table.getDisplayItem(key)),
        ]),
      )
    }
    return { table, sections, setRecords, setIds, setManual, dispose }
  })
}

test('pinned sections deduplicate records and exclude them from the center sequence', () => {
  const h = setup()
  h.table.setRowPinning({ top: ['c', 'c', 'missing'], bottom: ['c', 'a', 'a'] })
  flush()
  expect(h.sections()).toEqual({
    top: [{ kind: 'row', id: 'c' }],
    center: [{ kind: 'row', id: 'b' }],
    bottom: [{ kind: 'row', id: 'a' }],
  })
  expect(h.table.getRowIds()).toEqual(['a', 'b', 'c'])
  h.dispose()
})

test('default pinning keeps source records through filtering and follows explicit pin order', () => {
  const h = setup()
  h.table.setRowPinning({ top: ['a', 'c'], bottom: [] })
  h.table.setColumnFilters([{ id: 'amount', value: 20 }])
  h.table.setSorting([{ id: 'amount', desc: true }])
  flush()
  expect(h.sections()).toEqual({
    top: [
      { kind: 'row', id: 'a' },
      { kind: 'row', id: 'c' },
    ],
    center: [{ kind: 'row', id: 'b' }],
    bottom: [],
  })
  h.dispose()
})

test('keepPinnedRows false hides filtered pins without losing saved state', () => {
  const h = setup(false)
  h.table.getRow('a').pin('top')
  h.table.setColumnFilters([{ id: 'amount', value: 20 }])
  flush()
  expect(h.table.getRowSections().top).toEqual([])
  expect(h.table.state.rowPinning.top).toEqual(['a'])
  h.table.setColumnFilters([])
  flush()
  expect(h.table.getRowSections().top).toEqual([h.table.getRowKey('a')])
  h.dispose()
})

test('collapsed ancestors hide pinned children, while ungrouping restores them', () => {
  const h = setup()
  h.table.getRow('a').pin('top')
  h.table.setGrouping(['region'])
  flush()
  expect(h.table.getRowSections().top).toEqual([])
  const east = h.table.getGroup(h.table.getRootGroupKeys()[0]!)
  east.toggleExpanded(true)
  flush()
  expect(h.table.getRowSections().top).toEqual([h.table.getRowKey('a')])
  expect(h.table.getRowSections().center).not.toContain(h.table.getRowKey('a'))
  east.toggleExpanded(false)
  flush()
  expect(h.table.getRowSections().top).toEqual([])
  h.setManual(true)
  flush()
  expect(h.table.getRowSections().top).toEqual([h.table.getRowKey('a')])
  h.dispose()
})

test('removal and empty sources exclude stale pins and replacement restores logical identity', () => {
  const h = setup()
  h.table.getRow('a').pin('top')
  flush()
  h.setIds(['b', 'c'])
  h.setRecords((draft) => {
    delete draft.a
  })
  flush()
  expect(h.table.getRowSections().top).toEqual([])
  h.setRecords((draft) => {
    draft.a = { region: 'west', amount: 50 }
  })
  h.setIds(['c', 'a', 'b'])
  flush()
  expect(h.table.getRowSections().top).toEqual([h.table.getRowKey('a')])
  h.setIds([])
  flush()
  expect(h.table.getRowSections()).toEqual({ top: [], center: [], bottom: [] })
  h.dispose()
})

test('raw record IDs cannot collide with group keys or other encoded record keys', () => {
  const h = setup()
  h.table.setGrouping(['region'])
  flush()
  const id = h.table.getRootGroupKeys()[0]!
  h.setRecords((draft) => {
    draft[id] = { region: 'east', amount: 50 }
  })
  h.setIds(['a', id])
  flush()
  h.table.toggleAllGroupsExpanded(true)
  h.table.getRow(id).pin('top')
  flush()
  const sections = h.table.getRowSections()
  const keys = [...sections.top, ...sections.center, ...sections.bottom]
  expect(new Set(keys).size).toBe(keys.length)
  expect(h.table.getDisplayItem(sections.top[0]!)).toEqual({ kind: 'row', id })
  h.dispose()
})
