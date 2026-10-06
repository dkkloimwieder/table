import { expect, test } from 'vitest'
import {
  createProjection,
  createRoot,
  createSignal,
  createStore,
  flush,
  onCleanup,
} from 'solid-js'
import { tableFeatures } from '@tanstack/table-core'
import {
  createInfiniteQueryRows,
  getInfiniteQueryReconcileKey,
} from '../../../../examples/solid/virtualized-infinite-scrolling/src/createInfiniteQueryRows'
import { createTable } from '../../src/createTable'

type Item = { id: string; name: string; details: { score: number } }
type Page = { id: string; data: Array<Item> }

test('Query reconciliation keys preserve row IDs and distinguish keyless page arrays', () => {
  const rows: Array<Item> = []
  expect(getInfiniteQueryReconcileKey({ data: rows })).toBe(rows)
  expect(getInfiniteQueryReconcileKey({ data: rows, metadata: 'new' })).toBe(
    rows,
  )
  expect(getInfiniteQueryReconcileKey({ id: 0, data: rows })).toBe(0)
  expect(getInfiniteQueryReconcileKey({ id: 'row' })).toBe('row')
  for (const value of [null, undefined, 1, 'id', {}, { pages: [] }, []]) {
    expect(getInfiniteQueryReconcileKey(value)).toBeUndefined()
  }
})

test('keyless Query pages survive edits, retained-object prepend, and reorder without aliases', () => {
  const f = createRoot((dispose) => {
    const [source, setSource] = createSignal({
      pages: [
        {
          data: [
            { id: 'a', score: 0 },
            { id: 'b', score: 1 },
          ],
        },
        { data: [{ id: 'c', score: 2 }] },
      ],
    })
    // Match Solid Query's wrapper and positional, ID-free pages.
    const projected = createProjection(
      () => ({ value: source() }),
      {},
      {
        key: getInfiniteQueryReconcileKey,
      },
    )
    const rows = createInfiniteQueryRows(
      () => projected.value.pages,
      (part) => part.data,
    )
    const table = createTable({
      features: tableFeatures({}),
      columns: [{ accessorKey: 'score' }],
      get data() {
        return rows()
      },
      getRowId: (row) => row.id,
    })
    return { dispose, source, setSource, rows, table }
  })
  try {
    const initial = f.rows()
    f.table.getCoreRowModel().rows.forEach((row) => row.getValue('score'))
    const cached = f.source()
    f.setSource({
      pages: [
        { data: [{ id: 'a', score: 99 }, cached.pages[0]!.data[1]!] },
        cached.pages[1]!,
      ],
    })
    flush()
    const edited = f.rows()
    expect(edited[0]!.score).toBe(99)
    expect(edited[1]).toBe(initial[1])
    expect(edited[2]).toBe(initial[2])
    for (let i = 0; i < 20; i++) {
      const before = f.source()
      f.setSource({
        pages: [{ data: [{ id: `d${i}`, score: i }] }, ...before.pages],
      })
      flush()
      f.setSource({ pages: [...f.source().pages].reverse() })
      flush()
      const expected = f.source().pages.flatMap((part) => part.data)
      expect(f.rows()).toEqual(expected)
      expect(
        f.table
          .getCoreRowModel()
          .rows.map((row) => [row.id, row.getValue('score')]),
      ).toEqual(expected.map((row) => [row.id, row.score]))
      f.setSource({
        pages: f.source().pages.filter((part) => part.data[0]!.id !== `d${i}`),
      })
      flush()
    }
    const beforeMetadata = f.rows()
    const beforeModel = f.table.getCoreRowModel()
    f.setSource({
      pages: f.source().pages.map((part) => ({ ...part, metadata: 'changed' })),
    })
    flush()
    expect(f.rows()).toBe(beforeMetadata)
    expect(f.table.getCoreRowModel()).toBe(beforeModel)
    expect(initial.map((row) => row.score)).toEqual([0, 1, 2])
    expect(edited.map((row) => row.score)).toEqual([99, 1, 2])
  } finally {
    f.dispose()
  }
})

const page = (id: string, name: string): Page => ({
  id,
  data: [{ id: `${id}-row`, name, details: { score: 1 } }],
})

function fixture() {
  return createRoot((dispose) => {
    const initial = { pages: [page('a', 'Ada'), page('b', 'Grace')] }
    const [source, setSource] = createSignal(initial)
    const projected = createProjection(
      () => source(),
      { pages: [] },
      { key: getInfiniteQueryReconcileKey },
    )
    const reads = new Map<string, number>()
    const rows = createInfiniteQueryRows(
      () => projected.pages,
      (part) => {
        reads.set(part.id, (reads.get(part.id) ?? 0) + 1)
        return part.data
      },
    )
    const table = createTable({
      features: tableFeatures({}),
      columns: [
        { accessorKey: 'name' },
        { id: 'score', accessorFn: (row: Item) => row.details.score },
      ],
      get data() {
        return rows()
      },
      getRowId: (row) => row.id,
    })
    flush()
    return { dispose, initial, source, setSource, rows, table, reads }
  })
}

test('page snapshots refresh flat and nested cached cells without reading another page', () => {
  const f = fixture()
  try {
    const before = f.rows()
    const beforeModel = f.table.getCoreRowModel()
    expect(beforeModel.rows[0]!.getValue('name')).toBe('Ada')
    expect(beforeModel.rows[0]!.getValue('score')).toBe(1)
    f.reads.clear()
    f.setSource({
      pages: [
        {
          ...f.initial.pages[0]!,
          data: [{ id: 'a-row', name: 'Edited', details: { score: 2 } }],
        },
        f.initial.pages[1]!,
      ],
    })
    flush()
    expect(f.rows()).not.toBe(before)
    expect(f.rows()[1]).toBe(before[1])
    expect(before[0]!.name).toBe('Ada')
    expect(before[0]!.details.score).toBe(1)
    expect(f.table.getCoreRowModel()).not.toBe(beforeModel)
    expect(f.table.getCoreRowModel().rows[0]!.getValue('name')).toBe('Edited')
    expect(f.table.getCoreRowModel().rows[0]!.getValue('score')).toBe(2)
    expect(f.reads.get('a')).toBeGreaterThan(0)
    expect(f.reads.has('b')).toBe(false)
  } finally {
    f.dispose()
  }
})

test('page snapshots preserve repeated reads and identical source references', () => {
  const f = fixture()
  try {
    const before = f.rows()
    const model = f.table.getCoreRowModel()
    f.reads.clear()
    f.setSource(f.source())
    flush()
    expect(f.rows()).toBe(before)
    expect(f.table.getCoreRowModel()).toBe(model)
    expect(f.reads.size).toBe(0)
  } finally {
    f.dispose()
  }
})

test('page snapshots preserve old values across distinct equal payloads and later writes', () => {
  const f = fixture()
  try {
    const before = f.rows()
    f.setSource(structuredClone(f.source()))
    flush()
    expect(f.rows()).toEqual(before)
    const equal = f.rows()
    const next = structuredClone(f.source())
    next.pages[1]!.data[0]!.details.score = 3
    f.setSource(next)
    flush()
    expect(f.rows()[1]!.details.score).toBe(3)
    expect(before[1]!.details.score).toBe(1)
    expect(equal[1]!.details.score).toBe(1)
  } finally {
    f.dispose()
  }
})

test('page snapshots follow prepend, reorder, same-length replacement, and removal', () => {
  const f = fixture()
  try {
    const before = f.rows()
    f.setSource({ pages: [page('c', 'Katherine'), ...f.initial.pages] })
    flush()
    expect(f.rows().map((row) => row.id)).toEqual(['c-row', 'a-row', 'b-row'])
    expect(f.rows()[1]).toBe(before[0])
    f.reads.clear()
    f.setSource({ pages: [f.initial.pages[1]!, f.initial.pages[0]!] })
    flush()
    expect(f.rows().map((row) => row.id)).toEqual(['b-row', 'a-row'])
    expect(f.rows()[0]).toBe(before[1])
    expect(f.rows()[1]).toBe(before[0])
    f.setSource({ pages: [page('d', 'Dorothy'), f.initial.pages[0]!] })
    flush()
    expect(f.table.getCoreRowModel().rows.map((row) => row.id)).toEqual([
      'd-row',
      'a-row',
    ])
    expect(f.table.getCoreRowModel().rows[0]!.getValue('name')).toBe('Dorothy')
    f.setSource({ pages: [f.initial.pages[0]!] })
    flush()
    expect(f.rows()).toEqual([before[0]])
  } finally {
    f.dispose()
  }
})

test('page snapshots handle absent pages, empty results, and subsequent loads', () => {
  const f = createRoot((dispose) => {
    const [pages, setPages] = createSignal<Array<Page>>()
    const rows = createInfiniteQueryRows(pages, (part) => part.data)
    return { dispose, setPages, rows }
  })
  try {
    expect(f.rows()).toEqual([])
    f.setPages([page('a', 'Ada')])
    flush()
    const before = f.rows()
    expect(before[0]!.name).toBe('Ada')
    f.setPages([])
    flush()
    expect(f.rows()).toEqual([])
    f.setPages(undefined)
    flush()
    expect(f.rows()).toEqual([])
    f.setPages([page('b', 'Grace')])
    flush()
    expect(f.rows()[0]!.name).toBe('Grace')
    expect(before[0]!.name).toBe('Ada')
  } finally {
    f.dispose()
  }
})

test('removing a page releases its memo and ignores later detached writes', () => {
  const f = createRoot((dispose) => {
    const [removed, setRemoved] = createStore(page('a', 'Ada'))
    const [remaining] = createStore(page('b', 'Grace'))
    const [pages, setPages] = createSignal([removed, remaining])
    let reads = 0
    let active = 0
    const rows = createInfiniteQueryRows(pages, (part) => {
      reads++
      active++
      onCleanup(() => {
        active--
      })
      return part.data
    })
    return {
      dispose,
      setRemoved,
      setPages,
      remaining,
      rows,
      reads: () => reads,
      active: () => active,
    }
  })
  try {
    f.rows()
    flush()
    expect(f.active()).toBe(2)
    f.setPages([f.remaining])
    flush()
    expect(f.rows().map((row) => row.id)).toEqual(['b-row'])
    expect(f.active()).toBe(1)
    const reads = f.reads()
    f.setRemoved((draft) => {
      draft.data[0]!.name = 'Late'
    })
    flush()
    expect(f.reads()).toBe(reads)
    expect(f.rows()[0]!.name).toBe('Grace')
  } finally {
    f.dispose()
  }
  expect(f.active()).toBe(0)
})

test('repeated page replacement keeps one live snapshot computation', () => {
  const f = createRoot((dispose) => {
    const [pages, setPages] = createSignal([page('a', 'Ada')])
    let active = 0
    const rows = createInfiniteQueryRows(pages, (part) => {
      active++
      onCleanup(() => {
        active--
      })
      return part.data
    })
    return { dispose, rows, setPages, active: () => active }
  })
  try {
    for (let i = 0; i < 20; i++) {
      f.setPages([page(`p${i}`, `Person ${i}`)])
      flush()
      expect(f.rows()[0]!.name).toBe(`Person ${i}`)
      expect(f.active()).toBe(1)
    }
  } finally {
    f.dispose()
  }
  expect(f.active()).toBe(0)
})

test('disposing before settlement prevents later page writes from starting work', () => {
  const f = createRoot((dispose) => {
    const [pages, setPages] = createSignal([page('a', 'Ada')])
    let reads = 0
    const rows = createInfiniteQueryRows(pages, (part) => {
      reads++
      return part.data
    })
    dispose()
    return { setPages, rows, reads: () => reads }
  })
  const reads = f.reads()
  f.setPages([page('b', 'Grace')])
  flush()
  expect(f.reads()).toBe(reads)
})
