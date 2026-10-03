import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  For,
  createMemo,
  createProjection,
  createRoot,
  createSignal,
  createStore,
  flush,
  onCleanup,
  reconcile,
} from 'solid-js'
import {
  columnFilteringFeature,
  coreRowsFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/table-core'
import { createTable } from '../../src/createTable'
import {
  createStoreFilteredRowModel,
  createStoreRowModel,
  createStoreSortedRowModel,
} from '../../bench/store-row-model'

afterEach(cleanup)
type Item = {
  id: string
  score: number
  details: { label: string }
  unused: number
}
const initial = (): Array<Item> => [
  { id: 'a', score: 20, details: { label: 'Ada' }, unused: 0 },
  { id: 'b', score: 10, details: { label: 'Grace' }, unused: 0 },
]

function setup() {
  const reads: Record<string, number> = {}
  let created = 0
  let mounts = 0
  let unmounts = 0
  let released = 0
  const result = createRoot((dispose) => {
    const [data, setData] = createStore(initial())
    const [factor, setFactor] = createSignal(1)
    const features = tableFeatures({
      coreRowsFeature: {
        ...coreRowsFeature,
        initRowInstanceData: () => {
          created++
          onCleanup(() => {
            released++
          })
        },
      },
      columnFilteringFeature,
      rowSortingFeature,
      coreRowModel: createStoreRowModel<Item>((row) => row.id),
      filteredRowModel: createStoreFilteredRowModel(),
      sortedRowModel: createStoreSortedRowModel(),
    })
    const columns = createMemo(() => {
      const multiple = factor()
      return [
        {
          id: 'score',
          accessorFn: (row: Item, index: number) => {
            const key = `${row.id}.score`
            reads[key] = (reads[key] ?? 0) + 1
            return row.score * multiple + index
          },
          filterFn: (
            row: { getValue: <T>(id: string) => T },
            id: string,
            value: number,
          ) => row.getValue<number>(id) >= value,
          sortFn: (
            a: { getValue: <T>(id: string) => T },
            b: { getValue: <T>(id: string) => T },
            id: string,
          ) => a.getValue<number>(id) - b.getValue<number>(id),
        },
        {
          id: 'label',
          accessorFn: (row: Item) => {
            const key = `${row.id}.label`
            reads[key] = (reads[key] ?? 0) + 1
            return row.details.label
          },
        },
      ]
    })
    const table = createTable({
      features,
      data,
      get columns() {
        return columns()
      },
      getRowId: (row) => row.id,
    })
    return { table, data, setData, setFactor, dispose }
  })
  const View = () => (
    <output>
      <For each={result.table.getRowModel().rows}>
        {(row) => {
          mounts++
          onCleanup(() => {
            unmounts++
          })
          return (
            <span data-id={row.id}>
              {String(row.getValue('score'))}:{String(row.getValue('label'))};
            </span>
          )
        }}
      </For>
    </output>
  )
  return {
    ...result,
    reads,
    View,
    released: () => released,
    counts: () => ({ created, mounts, unmounts }),
  }
}

test('field edits reuse rows and cells and evaluate only affected accessors', () => {
  const harness = setup()
  try {
    render(harness.View)
    flush()
    const row = harness.table.getCoreRowModel().rows[0]!
    const cell = row.getAllCells()[0]!
    expect(screen.getByRole('status').textContent).toBe('20:Ada;11:Grace;')
    const before = { ...harness.reads }
    harness.setData((draft) => {
      draft[0]!.score = 25
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('25:Ada;11:Grace;')
    expect(harness.table.getCoreRowModel().rows[0]).toBe(row)
    expect(row.getAllCells()[0]).toBe(cell)
    expect(harness.reads).toEqual({
      ...before,
      'a.score': before['a.score']! + 1,
    })
    const afterEdit = { ...harness.reads }
    harness.setData((draft) => {
      draft[0]!.unused++
    })
    flush()
    expect(harness.reads).toEqual(afterEdit)
    expect(harness.counts()).toEqual({ created: 2, mounts: 2, unmounts: 0 })
  } finally {
    harness.dispose()
  }
})

test('append, same-ID replacement, nested edits and reordering retain row identity', () => {
  const harness = setup()
  try {
    render(harness.View)
    flush()
    const [a, b] = harness.table.getCoreRowModel().rows
    harness.setData((draft) => {
      draft.push({
        id: 'c',
        score: 5,
        details: { label: 'Katherine' },
        unused: 0,
      })
    })
    flush()
    expect(harness.table.getCoreRowModel().rows.slice(0, 2)).toEqual([a, b])
    expect(harness.counts()).toEqual({ created: 3, mounts: 3, unmounts: 0 })
    harness.setData((draft) => {
      draft[0] = {
        id: 'a',
        score: 30,
        details: { label: 'New Ada' },
        unused: 0,
      }
    })
    flush()
    expect(harness.table.getCoreRowModel().rows[0]).toBe(a)
    expect(screen.getByRole('status').textContent).toContain('30:New Ada;')
    harness.setData((draft) => {
      draft[0]!.details.label = 'Nested'
    })
    flush()
    expect(screen.getByRole('status').textContent).toContain('30:Nested;')
    harness.setData((draft) => {
      draft.reverse()
    })
    flush()
    expect(harness.table.getCoreRowModel().rows[2]).toBe(a)
    expect(a!.index).toBe(2)
    expect(screen.getByRole('status').textContent).toBe(
      '5:Katherine;11:Grace;32:Nested;',
    )
    expect(harness.counts()).toEqual({ created: 3, mounts: 3, unmounts: 0 })
  } finally {
    harness.dispose()
  }
})

test('active filters and sorts react to values without reconstructing rows', () => {
  const harness = setup()
  try {
    render(harness.View)
    flush()
    harness.table.setColumnFilters([{ id: 'score', value: 15 }])
    harness.table.setSorting([{ id: 'score', desc: false }])
    flush()
    expect(screen.getByRole('status').textContent).toBe('20:Ada;')
    harness.setData((draft) => {
      draft[1]!.score = 30
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('20:Ada;31:Grace;')
    harness.setData((draft) => {
      draft[0]!.score = 40
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('31:Grace;40:Ada;')
    harness.setData((draft) => {
      draft[1]!.score = 0
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('40:Ada;')
    expect(harness.counts().created).toBe(2)
  } finally {
    harness.dispose()
  }
})

test('column replacement invalidates values and keyed reconciliation preserves rows', () => {
  const harness = setup()
  try {
    render(harness.View)
    flush()
    const a = harness.table.getCoreRowModel().rows[0]
    harness.setFactor(2)
    flush()
    expect(screen.getByRole('status').textContent).toBe('40:Ada;21:Grace;')
    harness.setData((draft) => {
      reconcile([{ ...initial()[0]!, score: 50 }, initial()[1]!], 'id')(draft)
    })
    flush()
    expect(harness.table.getCoreRowModel().rows[0]).toBe(a)
    expect(screen.getByRole('status').textContent).toBe('100:Ada;21:Grace;')
    expect(harness.counts().created).toBe(2)
  } finally {
    harness.dispose()
  }
})

test('removal disposes a row scope and reinsertion creates a fresh row', () => {
  const harness = setup()
  render(harness.View)
  flush()
  const a = harness.table.getCoreRowModel().rows[0]
  harness.setData((draft) => {
    draft.shift()
  })
  flush()
  expect(harness.released()).toBe(1)
  expect(harness.counts()).toEqual({ created: 2, mounts: 2, unmounts: 1 })
  harness.setData((draft) => {
    draft.unshift(initial()[0]!)
  })
  flush()
  expect(harness.table.getCoreRowModel().rows[0]).not.toBe(a)
  expect(harness.counts()).toEqual({ created: 3, mounts: 3, unmounts: 1 })
  harness.dispose()
  expect(harness.released()).toBe(3)
})

test('remounting a renderer does not dispose the table row scopes', () => {
  const harness = setup()
  try {
    const view = render(harness.View)
    flush()
    const row = harness.table.getCoreRowModel().rows[0]
    view.unmount()
    expect(harness.released()).toBe(0)
    harness.setData((draft) => {
      draft[0]!.score = 42
    })
    flush()
    render(harness.View)
    expect(screen.getByRole('status').textContent).toContain('42:Ada;')
    expect(harness.table.getCoreRowModel().rows[0]).toBe(row)
  } finally {
    harness.dispose()
  }
})

test('duplicate IDs fail before constructing an ambiguous model', () => {
  createRoot((dispose) => {
    try {
      const model = createStoreRowModel<Item>((row) => row.id)
      const table = createTable({
        features: tableFeatures({ coreRowModel: model }),
        data: [initial()[0]!, initial()[0]!],
        columns: [],
        getRowId: (row) => row.id,
      })
      expect(() => table.getCoreRowModel()).toThrow('unique nonempty IDs')
    } finally {
      dispose()
    }
  })
})

test('a Query-shaped projection updates cells without a deep snapshot', () => {
  const harness = createRoot((dispose) => {
    const [source, setSource] = createSignal(initial())
    const data = createProjection(() => source(), [], { key: 'id' })
    const table = createTable({
      features: tableFeatures({
        coreRowModel: createStoreRowModel<Item>((row) => row.id),
      }),
      data,
      columns: [{ accessorKey: 'score' }],
      getRowId: (row) => row.id,
    })
    return { table, setSource, dispose }
  })
  try {
    render(() => (
      <output>
        {String(harness.table.getCoreRowModel().rows[0]!.getValue('score'))}
      </output>
    ))
    flush()
    const row = harness.table.getCoreRowModel().rows[0]
    harness.setSource([{ ...initial()[0]!, score: 70 }, initial()[1]!])
    flush()
    expect(screen.getByRole('status').textContent).toBe('70')
    expect(harness.table.getCoreRowModel().rows[0]).toBe(row)
  } finally {
    harness.dispose()
  }
})

test('keyed records replace independently of membership and support caller-defined record keys', () => {
  let membershipReads = 0
  let constructed = 0
  const harness = createRoot((dispose) => {
    const [data, setData] = createStore({
      ids: ['__proto__', 'constructor'],
      records: Object.fromEntries(
        initial().map((row, i) => [
          i ? '$constructor' : '$__proto__',
          { ...row, id: i ? 'constructor' : '__proto__' },
        ]),
      ),
    })
    const source = {
      ids: () => {
        membershipReads++
        return data.ids
      },
      get: (id: string) => data.records[`$${id}`]!,
    }
    const table = createTable({
      features: tableFeatures({
        coreRowModel: createStoreRowModel<Item>((row) => row.id, source),
        coreRowsFeature: {
          ...coreRowsFeature,
          initRowInstanceData: () => {
            constructed++
          },
        },
      }),
      get data() {
        return data.ids.map((id) => data.records[`$${id}`]!)
      },
      columns: [{ accessorKey: 'score' }],
      getRowId: (row) => row.id,
    })
    return { table, setData, dispose }
  })
  try {
    render(() => (
      <output>
        {String(harness.table.getCoreRowModel().rows[0]!.getValue('score'))}
      </output>
    ))
    flush()
    const row = harness.table.getCoreRowModel().rowsById['__proto__']!
    const before = membershipReads
    harness.setData((draft) => {
      draft.records['$__proto__'] = {
        ...initial()[0]!,
        id: '__proto__',
        score: 90,
      }
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('90')
    expect(harness.table.getCoreRowModel().rowsById['__proto__']).toBe(row)
    expect(harness.table.getCoreRowModel().rowsById['constructor']!.id).toBe(
      'constructor',
    )
    expect(membershipReads).toBe(before)
    expect(constructed).toBe(2)
  } finally {
    harness.dispose()
  }
})

test('changing an array record ID removes the old row and constructs a new one', () => {
  const harness = setup()
  try {
    render(harness.View)
    flush()
    const old = harness.table.getCoreRowModel().rows[0]
    harness.setData((draft) => {
      draft[0]!.id = 'new-a'
    })
    flush()
    expect(harness.table.getCoreRowModel().rows[0]!.id).toBe('new-a')
    // Compare identity without asking the matcher to inspect disposed getters.
    expect(harness.table.getCoreRowModel().rows[0] === old).toBe(false)
    expect(harness.released()).toBe(1)
    expect(harness.counts()).toEqual({ created: 3, mounts: 3, unmounts: 1 })
  } finally {
    harness.dispose()
  }
})
