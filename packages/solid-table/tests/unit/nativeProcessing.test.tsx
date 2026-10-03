import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import {
  For,
  createEffect,
  createRoot,
  createSignal,
  createStore,
  flush,
} from 'solid-js'
import { createTable, nativeAggregations } from '../../src/native'

afterEach(cleanup)
type Item = { id: string; region: string; amount: number }
const rows: Array<Item> = [
  { id: 'a', region: 'east', amount: 10 },
  { id: 'b', region: 'west', amount: 20 },
  { id: 'c', region: 'east', amount: 30 },
]
function setup() {
  return createRoot((dispose) => {
    const [records, setRecords] = createStore<Record<string, Item>>({})
    const [ids, setIds] = createSignal<Array<string>>([])
    const [load, setLoad] = createStore({
      fullyRead: false,
      busy: true,
      cap: 3,
      generation: 1,
    })
    let generation = 1
    let cap = 3
    const read = vi.fn((record: Item) => record.amount)
    const aggregate = vi.fn(nativeAggregations.sum)
    const table = createTable({
      source: { ids, get: (id) => records[id] },
      columns: [
        { id: 'region', accessorKey: 'region' },
        {
          id: 'amount',
          accessorFn: read,
          aggregationFn: aggregate,
          filterFn: (value, minimum) => Number(value) >= Number(minimum),
          sortFn: (a, b) => Number(a) - Number(b),
        },
      ],
      initialState: {
        globalFilter: 'east',
        columnFilters: [{ id: 'amount', value: 15 }],
        sorting: [{ id: 'amount', desc: true }],
        grouping: ['region'],
      },
      get manualProcessing() {
        return !load.fullyRead || load.busy
      },
    })
    // This generation guard represents application loading policy, not Table.
    function begin(nextCap: number) {
      generation++
      cap = nextCap
      setLoad((draft) => {
        draft.generation = generation
        draft.cap = cap
        draft.busy = true
        draft.fullyRead = false
      })
      return generation
    }
    function accept(
      version: number,
      result: Array<Item>,
      more: boolean,
      busy = false,
    ) {
      if (version !== generation) return false
      const batch = result.slice(0, cap)
      setRecords(() => Object.fromEntries(batch.map((row) => [row.id, row])))
      setIds(batch.map((row) => row.id))
      setLoad((draft) => {
        draft.busy = busy
        draft.fullyRead = !busy && !more && result.length <= cap
      })
      return true
    }
    return { table, load, begin, accept, read, aggregate, setRecords, dispose }
  })
}

test('partial sets expose supplied rows but no local refinements, facets, grouping, or totals', () => {
  const h = setup()
  h.accept(1, rows, true)
  flush()
  expect(h.table.getRowIds()).toEqual(['a', 'b', 'c'])
  expect(h.table.getFilteredRowIds()).toEqual(['a', 'b', 'c'])
  expect(h.table.getDisplayKeys().map(h.table.getDisplayItem)).toEqual(
    ['a', 'b', 'c'].map((id) => ({ kind: 'row', id })),
  )
  expect(h.table.getColumn('amount')!.getFacetedUniqueValues()).toBeUndefined()
  expect(h.table.getTotalValue('amount')).toBeUndefined()
  expect(h.table.getTotalValue('amount', 'source')).toBeUndefined()
  expect(h.table.getRootGroupKeys()).toEqual([])
  expect(h.read).not.toHaveBeenCalled()
  expect(h.aggregate).not.toHaveBeenCalled()
  h.dispose()
})

test('one table switches between complete and partial data while retaining valid selection and expansion', () => {
  const h = setup()
  const originalTable = h.table
  h.accept(1, rows, false)
  h.table.getRow('c').toggleSelected(true)
  flush()
  expect(h.table.getRowIds()).toEqual(['c'])
  expect(h.table.getTotalValue('amount')).toBe(30)
  expect(h.table.getTotalValue('amount', 'source')).toBe(60)
  const east = h.table.getGroup(h.table.getRootGroupKeys()[0]!)
  east.toggleExpanded(true)
  flush()
  const next = h.begin(2)
  h.accept(next, rows, true)
  flush()
  expect(h.table.getRowIds()).toEqual(['a', 'b'])
  expect(h.table.getTotalValue('amount')).toBeUndefined()
  expect(h.table.getRow('c').getIsSelected()).toBe(true)
  const refresh = h.begin(4)
  h.accept(
    refresh,
    rows.map((row) => ({ ...row, amount: row.amount + 20 })),
    false,
  )
  flush()
  expect(h.table).toBe(originalTable)
  expect(h.table.getRowIds()).toEqual(['c', 'a'])
  expect(east.getIsExpanded()).toBe(true)
  expect(h.table.getRow('c').getIsSelected()).toBe(true)
  expect(h.table.getDisplayKeys().map(h.table.getDisplayItem)).toEqual([
    { kind: 'group', key: east.key },
    { kind: 'row', id: 'c' },
    { kind: 'row', id: 'a' },
  ])
  expect(h.table.getTotalValue('amount')).toBe(80)
  h.dispose()
})

test('stale generations cannot re-enable local processing and a busy batch cannot present complete totals', () => {
  const h = setup()
  const old = h.begin(2)
  const current = h.begin(4)
  h.accept(current, rows, false, true)
  flush()
  expect(
    h.accept(old, [{ id: 'old', region: 'old', amount: 999 }], false),
  ).toBe(false)
  flush()
  expect(h.load.generation).toBe(current)
  expect(h.load.cap).toBe(4)
  expect(h.load.busy).toBe(true)
  expect(h.table.getRowIds()).toEqual(['a', 'b', 'c'])
  expect(h.table.getTotalValue('amount')).toBeUndefined()
  h.accept(current, rows, false)
  flush()
  expect(h.load.fullyRead).toBe(true)
  expect(h.table.getRowIds()).toEqual(['c'])
  expect(h.table.getTotalValue('amount')).toBe(30)
  h.dispose()
})

test('batched record and load-state updates never render totals over an intermediate dataset', () => {
  const h = setup()
  const seen: Array<unknown> = []
  const stop = createRoot((dispose) => {
    createEffect(
      () => ({
        ids: h.table.getRowIds(),
        total: h.table.getTotalValue('amount'),
      }),
      (value) => {
        seen.push(value)
      },
    )
    return dispose
  })
  const ui = render(() => (
    <>
      <output>{h.table.getTotalValue('amount') ?? 'unavailable'}</output>
      <For each={h.table.getRowIds()}>{(id) => <span>{id}</span>}</For>
    </>
  ))
  flush()
  seen.length = 0
  h.accept(1, rows, false)
  flush()
  expect(seen).toEqual([{ ids: ['c'], total: 30 }])
  expect(ui.container.textContent).toBe('30c')
  seen.length = 0
  h.begin(1)
  flush()
  expect(seen).toEqual([{ ids: ['a', 'b', 'c'], total: undefined }])
  expect(ui.container.textContent).toBe('unavailableabc')
  ui.unmount()
  stop()
  h.dispose()
})

test('authoritative external totals and facets stay reactive in manual mode and unavailable values stay unavailable', () => {
  const h = createRoot((dispose) => {
    const [total, setTotal] = createSignal<number | undefined>(900)
    const [facets, setFacets] = createSignal<
      ReadonlyMap<unknown, number> | undefined
    >(new Map([[7, 100]]))
    const get = vi.fn(() => ({ amount: 7 }))
    const table = createTable({
      source: { ids: () => ['a'], get },
      columns: [
        {
          id: 'amount',
          accessorKey: 'amount',
          aggregationFn: nativeAggregations.sum,
        },
      ],
      manualProcessing: true,
      getTotalValue: (_column, scope) =>
        scope === 'filtered' ? total() : undefined,
      getFacetedUniqueValues: () => facets(),
    })
    return { table, setTotal, setFacets, get, dispose }
  })
  const ui = render(() => (
    <output>
      {String(h.table.getTotalValue('amount'))}:
      {String(h.table.getColumn('amount')!.getFacetedUniqueValues()?.get(7))}
    </output>
  ))
  flush()
  expect(ui.container.textContent).toBe('900:100')
  h.setTotal(1200)
  h.setFacets(new Map([[7, 200]]))
  flush()
  expect(ui.container.textContent).toBe('1200:200')
  expect(h.table.getTotalValue('amount', 'source')).toBeUndefined()
  h.setTotal(undefined)
  h.setFacets(undefined)
  flush()
  expect(ui.container.textContent).toBe('undefined:undefined')
  expect(h.get).not.toHaveBeenCalled()
  ui.unmount()
  h.dispose()
})

test('controlled grouping and expansion commands compose once per action', () => {
  const changed = vi.fn()
  const h = createRoot((dispose) => {
    const [grouping, setGrouping] = createSignal<Array<string>>([])
    const [expanded, setExpanded] = createStore<Record<string, boolean>>({})
    const table = createTable({
      source: {
        ids: () => rows.map((row) => row.id),
        get: (id) => rows.find((row) => row.id === id),
      },
      columns: [{ id: 'region', accessorKey: 'region' }],
      get state() {
        return { grouping: grouping(), groupExpanded: expanded }
      },
      onGroupingChange: (updater) => {
        changed()
        setGrouping(updater)
      },
      onGroupExpandedChange: (updater) => {
        changed()
        setExpanded((draft) =>
          typeof updater === 'function' ? updater(draft) : updater,
        )
      },
    })
    return { table, dispose }
  })
  h.table.setGrouping((old) => [...old, 'region'])
  flush()
  const [east, west] = h.table.getRootGroupKeys().map(h.table.getGroup)
  east!.toggleExpanded(true)
  west!.toggleExpanded(true)
  flush()
  expect(east!.getIsExpanded()).toBe(true)
  expect(west!.getIsExpanded()).toBe(true)
  expect(changed).toHaveBeenCalledTimes(3)
  h.dispose()
})
