import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import {
  For,
  OBSERVE,
  createEffect,
  createRoot,
  createSignal,
  createStore,
  flush,
  onCleanup,
} from 'solid-js'
import { createTable, nativeAggregations } from '../../src/native'
import type { NativeColumnDef, NativeGroupValue } from '../../src/native'

afterEach(cleanup)
type Item = {
  region: string | null
  city: string
  amount: number
  unused: number
}
const initial = (): Record<string, Item> => ({
  a: { region: 'east', city: 'A', amount: 10, unused: 0 },
  b: { region: 'west', city: 'B', amount: 20, unused: 0 },
  c: { region: 'east', city: 'C', amount: 30, unused: 0 },
  d: { region: null, city: 'A', amount: 40, unused: 0 },
})
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
function setup(grouping = ['region']) {
  return createRoot((dispose) => {
    const [records, setRecords] = createStore(initial())
    const [ids, setIds] = createSignal(Object.keys(initial()))
    const [manual, setManual] = createSignal(false)
    const region = vi.fn((item: Item) => item.region)
    const amount = vi.fn((item: Item) => item.amount)
    const sum = vi.fn(nativeAggregations.sum)
    const definitions: Array<NativeColumnDef<Item>> = [
      {
        id: 'region',
        accessorFn: region,
        sortFn: (a, b) => String(a).localeCompare(String(b)),
      },
      { id: 'city', accessorKey: 'city' },
      {
        id: 'amount',
        accessorFn: amount,
        aggregationFn: sum,
        filterFn: (a, b) => Number(a) >= Number(b),
        sortFn: (a, b) => Number(a) - Number(b),
      },
    ]
    const [columns, setColumns] = createSignal(definitions)
    const table = createTable({
      source: { ids, get: (id) => records[id] },
      get columns() {
        return columns()
      },
      initialState: { grouping },
      get manualGrouping() {
        return manual()
      },
      get manualAggregating() {
        return manual()
      },
      get manualSorting() {
        return manual()
      },
      get manualFiltering() {
        return manual()
      },
    })
    const group = (value: NativeGroupValue) =>
      table.getGroup(
        table
          .getRootGroupKeys()
          .find((key) => table.getGroup(key).path![0]!.value === value)!,
      )
    return {
      table,
      records,
      setRecords,
      ids,
      setIds,
      setManual,
      region,
      amount,
      sum,
      definitions,
      setColumns,
      group,
      dispose,
    }
  })
}

test('nested groups expose raw paths, independent expansion, and leaf IDs without row wrappers', () => {
  const h = setup(['region', 'city'])
  const view = observe(h.table.getDisplayKeys)
  try {
    expect(view.value()).toHaveLength(3)
    const east = h.group('east')
    expect(east.count).toBe(2)
    expect([...east.getLeafRowIds()]).toEqual(['a', 'c'])
    expect(east.getValue('amount')).toBe(40)
    expect(east.path).toEqual([{ columnId: 'region', value: 'east' }])
    east.toggleExpanded(true)
    flush()
    expect(view.value()).toHaveLength(5)
    const child = h.table.getGroup(east.getChildGroupKeys()[0]!)
    expect(child.depth).toBe(1)
    expect(child.getValue('region')).toBe('east')
    expect(child.getValue('city')).toBe('A')
    child.toggleExpanded(true)
    flush()
    expect(view.value().map(h.table.getDisplayItem)).toContainEqual({
      kind: 'row',
      id: 'a',
    })
    h.table.toggleAllGroupsExpanded(false, 0)
    flush()
    expect(view.value()).toHaveLength(3)
    expect(child.getIsExpanded()).toBe(true)
    h.table.toggleAllGroupsExpanded(true, 0)
    flush()
    expect(view.value()).toHaveLength(8)
    expect(h.table.getRowIds()).toEqual(['a', 'b', 'c', 'd'])
  } finally {
    view.stop()
    h.dispose()
  }
})

test('group-key edits move membership, and final-member removal invalidates old handles', () => {
  const h = setup()
  const view = observe(() =>
    h.table
      .getRootGroupKeys()
      .map((key) => [key, h.table.getGroup(key).getValue('amount')]),
  )
  try {
    const east = h.group('east')
    const west = h.group('west')
    h.setRecords((draft) => {
      draft.b!.region = 'east'
    })
    flush()
    expect(east.count).toBe(3)
    expect(east.getValue('amount')).toBe(60)
    expect(west.path).toBeUndefined()
    expect(west.count).toBe(0)
    expect(west.depth).toBe(-1)
    expect(west.getValue('amount')).toBeUndefined()
    expect([...west.getLeafRowIds()]).toEqual([])
    h.setRecords((draft) => {
      delete draft.d
      draft.e = { region: 'south', city: 'D', amount: 5, unused: 0 }
    })
    h.setIds(['e', 'a', 'b', 'c'])
    flush()
    expect(
      h.table
        .getRootGroupKeys()
        .map((key) => h.table.getGroup(key).getValue('region')),
    ).toEqual(['south', 'east'])
  } finally {
    view.stop()
    h.dispose()
  }
})

test('an aggregate edit tracks only its observed group and does not rebuild membership', () => {
  const h = setup()
  const east = h.group('east')
  const west = h.group('west')
  const a = observe(() => east.getValue('amount'))
  const b = observe(() => west.getValue('amount'))
  try {
    h.region.mockClear()
    h.amount.mockClear()
    h.sum.mockClear()
    h.setRecords((draft) => {
      draft.a!.amount = 12
    })
    flush()
    expect(a.value()).toBe(42)
    expect(b.value()).toBe(20)
    expect(h.region).not.toHaveBeenCalled()
    expect(h.sum).toHaveBeenCalledTimes(1)
    expect(h.amount).toHaveBeenCalledTimes(2)
    h.setRecords((draft) => {
      draft.a!.unused++
    })
    flush()
    expect(h.sum).toHaveBeenCalledTimes(1)
  } finally {
    a.stop()
    b.stop()
    h.dispose()
  }
})

test('group aggregate ordering and leaf ordering react independently', () => {
  const h = setup()
  h.table.setGroupSorting([{ depth: 0, id: 'amount', desc: true }])
  h.table.setSorting([{ id: 'amount', desc: true }])
  flush()
  const view = observe(h.table.getDisplayKeys)
  try {
    expect(
      h.table
        .getRootGroupKeys()
        .map((key) => h.table.getGroup(key).getValue('region')),
    ).toEqual(['east', null, 'west'])
    h.setRecords((draft) => {
      draft.b!.amount = 100
    })
    flush()
    expect(h.table.getRootGroupKeys()[0]).toBe(h.group('west').key)
    h.table.toggleAllGroupsExpanded(true)
    flush()
    expect(
      view
        .value()
        .map(h.table.getDisplayItem)
        .filter((item) => item.kind === 'row'),
    ).toEqual([
      { kind: 'row', id: 'b' },
      { kind: 'row', id: 'c' },
      { kind: 'row', id: 'a' },
      { kind: 'row', id: 'd' },
    ])
    h.table.setGroupSorting([{ depth: 0, id: 'region', desc: true }])
    flush()
    expect(
      h.table
        .getRootGroupKeys()
        .map((key) => h.table.getGroup(key).getValue('region')),
    ).toEqual(['west', 'east', null])
  } finally {
    view.stop()
    h.dispose()
  }
})

test('collapsed groups do not read leaf sort keys or unobserved aggregates', () => {
  const h = setup()
  h.table.setSorting([{ id: 'amount', desc: true }])
  flush()
  const view = observe(h.table.getDisplayKeys)
  try {
    expect(h.amount).not.toHaveBeenCalled()
    expect(h.sum).not.toHaveBeenCalled()
    h.group('east').toggleExpanded(true)
    flush()
    expect(h.amount).toHaveBeenCalledTimes(4)
    h.table.toggleAllGroupsExpanded(false)
    flush()
    h.setRecords((draft) => {
      draft.a!.amount = 11
    })
    flush()
    expect(h.amount).toHaveBeenCalledTimes(4)
  } finally {
    view.stop()
    h.dispose()
  }
})

test('sorting a hidden group level reads no aggregate values until expanded', () => {
  const h = setup(['region', 'city'])
  h.table.setGroupSorting([{ depth: 1, id: 'amount', desc: true }])
  flush()
  const view = observe(h.table.getDisplayKeys)
  try {
    expect(h.amount).not.toHaveBeenCalled()
    h.group('east').toggleExpanded(true)
    flush()
    expect(h.amount).toHaveBeenCalledTimes(2)
    expect(
      h
        .group('east')
        .getChildGroupKeys()
        .map((key) => h.table.getGroup(key).getValue('city')),
    ).toEqual(['C', 'A'])
    h.table.toggleAllGroupsExpanded(false)
    flush()
    const before = h.amount.mock.calls.length
    h.setRecords((draft) => {
      draft.a!.amount = 100
    })
    flush()
    expect(h.amount).toHaveBeenCalledTimes(before)
  } finally {
    view.stop()
    h.dispose()
  }
})

test('compatible replacement preserves group expansion and record selection without identity collisions', () => {
  const h = setup()
  const view = observe(h.table.getDisplayKeys)
  try {
    const east = h.group('east')
    east.toggleExpanded(true)
    const collision = east.key
    h.setRecords((draft) => {
      draft[collision] = { region: 'east', city: 'D', amount: 5, unused: 0 }
      draft.a = { ...draft.a!, amount: 15 }
    })
    h.setIds(['a', collision, 'b', 'c', 'd'])
    h.table.getRow(collision).toggleSelected(true)
    h.table.getRow(collision).toggleExpanded(false)
    flush()
    expect(east.getIsExpanded()).toBe(true)
    expect(h.table.getRow(collision).getIsExpanded()).toBe(false)
    expect(h.table.getRow(collision).getIsSelected()).toBe(true)
    expect(east.getValue('amount')).toBe(50)
    expect(new Set(view.value()).size).toBe(view.value().length)
    expect(view.value().map(h.table.getDisplayItem)).toContainEqual({
      kind: 'row',
      id: collision,
    })
  } finally {
    view.stop()
    h.dispose()
  }
})

test('typed scalar keys distinguish values, coalesce nullish values, and preserve unusual strings', () => {
  createRoot((dispose) => {
    const values = [
      1,
      '1',
      1n,
      true,
      null,
      undefined,
      NaN,
      Infinity,
      -Infinity,
      0,
      -0,
      'x:[]"/',
    ]
    const table = createTable({
      source: {
        ids: () => values.map((_, i) => String(i)),
        get: (id) => ({ value: values[Number(id)] }),
      },
      columns: [{ id: 'v:[]"/', accessorKey: 'value' }],
      initialState: { grouping: ['v:[]"/'] },
    })
    const keys = table.getRootGroupKeys()
    expect(keys).toHaveLength(10)
    expect(new Set(keys).size).toBe(10)
    expect(keys.map((key) => table.getGroup(key).count).sort()).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 2, 2,
    ])
    dispose()
  })
})

test('date buckets and custom aggregates read original leaves at every level', () => {
  const h = setup(['region', 'city'])
  h.setColumns(
    h.definitions.map((column) =>
      column.id === 'amount'
        ? {
            ...column,
            aggregationFn: (values) =>
              Array.from(values, Number).reduce((sum, n) => sum + n * n, 0),
          }
        : column.id === 'city'
          ? {
              ...column,
              getGroupingValue: (item) =>
                item.city === 'A' ? 'first' : 'other',
            }
          : column,
    ),
  )
  flush()
  const east = h.group('east')
  expect(east.getValue('amount')).toBe(1000)
  expect(
    east
      .getChildGroupKeys()
      .map((key) => h.table.getGroup(key).getValue('city')),
  ).toEqual(['first', 'other'])
  expect(h.table.getTotalValue('amount')).toBe(3000)
  h.dispose()
})

test('totals use explicit source or filtered membership and aggregates handle empty and missing numbers', () => {
  const h = setup()
  h.table.setColumnFilters([{ id: 'amount', value: 25 }])
  flush()
  expect(h.table.getTotalValue('amount')).toBe(70)
  expect(h.table.getTotalValue('amount', 'source')).toBe(100)
  const values = [2, null, undefined, NaN, Infinity, '4', 6]
  expect(nativeAggregations.sum(values)).toBe(8)
  expect(nativeAggregations.mean(values)).toBe(4)
  expect(nativeAggregations.min(values)).toBe(2)
  expect(nativeAggregations.max(values)).toBe(6)
  expect(nativeAggregations.mean([])).toBeUndefined()
  expect(nativeAggregations.min([])).toBeUndefined()
  expect(nativeAggregations.sum([])).toBe(0)
  const noRead = {
    [Symbol.iterator](): Iterator<unknown> {
      throw new Error('Count must not read values')
    },
  }
  expect(nativeAggregations.count(noRead, { count: 7 })).toBe(7)
  h.table.setColumnFilters([{ id: 'amount', value: 100 }])
  flush()
  expect(h.table.getRootGroupKeys()).toEqual([])
  expect(h.table.getTotalValue('amount')).toBe(0)
  h.dispose()
})

test('manual mode bypasses grouping and aggregates, then restores saved expansion', () => {
  const h = setup()
  const view = observe(h.table.getDisplayKeys)
  try {
    const east = h.group('east')
    east.toggleExpanded(true)
    h.setManual(true)
    flush()
    expect(view.value().map(h.table.getDisplayItem)).toEqual(
      ['a', 'b', 'c', 'd'].map((id) => ({ kind: 'row', id })),
    )
    expect(h.table.getTotalValue('amount')).toBeUndefined()
    expect(h.table.getRootGroupKeys()).toEqual([])
    h.region.mockClear()
    h.amount.mockClear()
    h.setRecords((draft) => {
      draft.a!.region = 'west'
      draft.a!.amount = 12
    })
    flush()
    expect(h.region).not.toHaveBeenCalled()
    expect(h.amount).not.toHaveBeenCalled()
    h.setManual(false)
    flush()
    expect(east.getIsExpanded()).toBe(true)
    expect([...east.getLeafRowIds()]).toEqual(['c'])
  } finally {
    view.stop()
    h.dispose()
  }
})

test('removed grouping columns suspend their saved level and restore its path keys', () => {
  const h = setup(['region', 'city'])
  const east = h.group('east')
  east.toggleExpanded(true)
  h.setColumns(h.definitions.filter((column) => column.id !== 'region'))
  flush()
  expect(
    h.table
      .getRootGroupKeys()
      .map((key) => h.table.getGroup(key).path![0]!.columnId),
  ).toEqual(['city', 'city', 'city'])
  expect(east.path).toBeUndefined()
  h.setColumns(h.definitions)
  flush()
  expect(h.group('east').key).toBe(east.key)
  expect(east.getIsExpanded()).toBe(true)
  h.dispose()
})

test('group views retain visible cells through value edits and dispose with their owner', () => {
  const h = setup()
  const capture = OBSERVE!.diagnostics.capture()
  let mounts = 0
  let stops = 0
  const View = () => (
    <For each={h.table.getRootGroupKeys()}>
      {(key) => {
        const group = h.table.createGroupView(key)
        mounts++
        onCleanup(() => {
          stops++
        })
        return (
          <div data-group={key}>
            <For each={group.getVisibleCells()}>
              {(cell) => <span>{String(cell.getValue())}</span>}
            </For>
          </div>
        )
      }}
    </For>
  )
  const ui = render(View)
  flush()
  const first = ui.container.querySelector('span')
  h.setRecords((draft) => {
    draft.a!.amount = 12
  })
  flush()
  expect(ui.container.textContent).toContain('42')
  expect(ui.container.querySelector('span')).toBe(first)
  expect(mounts).toBe(3)
  ui.unmount()
  flush()
  expect(stops).toBe(3)
  h.sum.mockClear()
  h.region.mockClear()
  h.setRecords((draft) => {
    draft.a!.amount = 14
    draft.a!.region = 'other'
  })
  flush()
  expect(h.sum).not.toHaveBeenCalled()
  expect(h.region).not.toHaveBeenCalled()
  h.dispose()
  expect(capture.stop()).toEqual([])
})

test('objects require an explicit scalar grouping value', () => {
  createRoot((dispose) => {
    const table = createTable({
      source: { ids: () => ['a'], get: () => ({ date: new Date(0) }) },
      columns: [{ id: 'date', accessorKey: 'date' }],
      initialState: { grouping: ['date'] },
    })
    expect(() => table.getRootGroupKeys()).toThrow('Set getGroupingValue')
    dispose()
  })
})
