import {
  createMemo,
  createRoot,
  createSignal,
  deep,
  flush,
  onCleanup,
} from 'solid-js'
import { QueryClient, useInfiniteQuery } from '@tanstack/solid-query'
import { createTable, tableFeatures } from '@tanstack/solid-table'
import { createInfiniteQueryRows } from '../../src/createInfiniteQueryRows'
import type { InfiniteData } from '@tanstack/solid-query'

type Item = { id: string; name: string; score: number }
type Page = { data: Array<Item> }
type Data = InfiniteData<Page, number>
type Mode = 'deep' | 'page-deep' | 'clone' | 'shallow'
type Action =
  | 'load'
  | 'stableRead'
  | 'sameReference'
  | 'equalPayload'
  | 'fieldEdit'
  | 'appendPage'
  | 'pageReplacement'
  | 'removePage'
const item = (i: number): Item => ({
  id: `r${i}`,
  name: `Person ${i}`,
  score: i % 100,
})
const page = (start: number, length: number): Page => ({
  data: Array.from({ length }, (_, i) => item(start + i)),
})
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}

function start(
  mode: Mode,
  size: number,
  structuralSharing: boolean,
  pageSize = 1000,
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, structuralSharing },
    },
  })
  const key = ['query-profile']
  let expected: Data = {
    pages: Array.from({ length: Math.ceil(size / pageSize) }, (_, i) =>
      page(i * pageSize, Math.min(pageSize, size - i * pageSize)),
    ),
    pageParams: Array.from({ length: Math.ceil(size / pageSize) }, (_, i) => i),
  }
  client.setQueryData(key, expected)
  let bridgeRuns = 0
  let pageReads = 0
  let rowVisits = 0
  let accessorReads = 0
  let previousRows: Array<Item> = []
  let previousValues: Array<[string, string, number]> = []
  let previousModel:
    ReturnType<typeof fixture.table.getCoreRowModel> | undefined
  let pending: Data | undefined
  let currentAction: Action = 'load'
  const fixture = createRoot((dispose) => {
    const query = useInfiniteQuery(
      () => ({
        queryKey: key,
        initialPageParam: 0,
        queryFn: ({ pageParam }) =>
          Promise.resolve(page(pageParam * pageSize, pageSize)),
        getNextPageParam: (_last, pages) => pages.length,
        enabled: false,
        staleTime: Infinity,
      }),
      () => client,
    )
    const pageRows =
      mode === 'page-deep'
        ? createInfiniteQueryRows(
            () => query.data.pages,
            (part) => {
              pageReads++
              return part.data
            },
          )
        : undefined
    const rows = createMemo(() => {
      bridgeRuns++
      if (pageRows) return pageRows()
      return query.data.pages.flatMap((part) => {
        pageReads++
        if (mode === 'deep') return deep(part.data)
        return part.data.map((row) => {
          rowVisits++
          return mode === 'clone' ? { ...row } : row
        })
      })
    })
    const table = createTable({
      features: tableFeatures({}),
      columns: [
        {
          id: 'name',
          accessorFn: (row: Item) => {
            accessorReads++
            return row.name
          },
        },
        {
          id: 'score',
          accessorFn: (row: Item) => {
            accessorReads++
            return row.score
          },
        },
      ],
      get data() {
        return rows()
      },
      getRowId: (row) => row.id,
    })
    return { dispose, rows, table }
  })
  flush()
  let currentRows: Array<Item> = []
  let currentModel: ReturnType<typeof fixture.table.getCoreRowModel> | undefined
  return {
    prepare(action: Action) {
      currentAction = action
      pending = undefined
      const cached = client.getQueryData<Data>(key)!
      if (action === 'sameReference') pending = cached
      if (action === 'equalPayload') pending = structuredClone(cached)
      if (action === 'fieldEdit') {
        pending = {
          ...cached,
          pages: cached.pages.map((part, i) =>
            i === 0
              ? {
                  data: part.data.map((row, j) =>
                    j === 0 ? { ...row, name: 'Edited', score: 101 } : row,
                  ),
                }
              : part,
          ),
        }
      }
      if (action === 'appendPage')
        pending = {
          pages: [...cached.pages, page(size, pageSize)],
          pageParams: [...cached.pageParams, cached.pages.length],
        }
      if (action === 'pageReplacement')
        pending = {
          ...cached,
          pages: cached.pages.map((part, i) =>
            i === 0 ? page(size + pageSize, part.data.length) : part,
          ),
        }
      if (action === 'removePage')
        pending = {
          pages: cached.pages.slice(0, -1),
          pageParams: cached.pageParams.slice(0, -1),
        }
      if (pending) expected = pending
      if (action !== 'load')
        bridgeRuns = pageReads = rowVisits = accessorReads = 0
    },
    measure() {
      const begin = performance.now()
      if (pending) client.setQueryData(key, pending)
      flush()
      const updated = performance.now()
      currentRows = fixture.rows()
      const bridged = performance.now()
      currentModel = fixture.table.getCoreRowModel()
      let checksum = 0
      for (const row of currentModel.rows) {
        checksum +=
          row.getValue<string>('name').length + row.getValue<number>('score')
      }
      const modeled = performance.now()
      return {
        action: currentAction,
        timings: {
          update: updated - begin,
          bridge: bridged - updated,
          model: modeled - bridged,
          total: modeled - begin,
        },
        counts: { bridgeRuns, pageReads, rowVisits, accessorReads },
        checksum,
      }
    },
    inspect() {
      const expectedRows = expected.pages.flatMap((part) => part.data)
      assert(
        currentModel!.rows.length === expectedRows.length,
        `${currentAction}: row count`,
      )
      let staleCells = 0
      for (let i = 0; i < currentModel!.rows.length; i++) {
        const actual = currentModel!.rows[i]
        const id = actual.id
        const name = actual.getValue<string>('name')
        const score = actual.getValue<number>('score')
        const row = expectedRows[i]
        assert(id === row.id, `${currentAction}: row order at ${i}`)
        if (name !== row.name || score !== row.score) staleCells++
      }
      assert(
        staleCells ===
          (mode === 'shallow' && currentAction === 'fieldEdit' ? 1 : 0),
        `${currentAction}: unexpected stale cells ${staleCells}`,
      )
      const before = new Map(previousRows.map((row) => [row.id, row]))
      const newRows = currentRows.filter(
        (row) => before.get(row.id) !== row,
      ).length
      const sameArray = currentRows === previousRows
      const sameModel = currentModel === previousModel
      const beforeModel = new Map(
        previousModel?.rows.map((row) => [row.id, row]),
      )
      const newCoreRows = currentModel!.rows.filter(
        (row) => beforeModel.get(row.id) !== row,
      ).length
      const expectedNewRows = {
        load: size,
        stableRead: 0,
        sameReference: 0,
        equalPayload:
          (mode === 'deep' || mode === 'page-deep') && !structuralSharing
            ? size
            : 0,
        fieldEdit:
          mode === 'deep' || mode === 'page-deep'
            ? 1
            : mode === 'clone'
              ? size
              : 0,
        appendPage: mode === 'clone' ? size + pageSize : pageSize,
        pageReplacement: mode === 'clone' ? size + pageSize : pageSize,
        removePage: mode === 'clone' ? size : 0,
      }[currentAction]
      assert(
        newRows === expectedNewRows,
        `${currentAction}: unexpected row identities ${newRows}`,
      )
      assert(
        newCoreRows === (sameModel ? 0 : currentRows.length),
        `${currentAction}: unexpected core row identities`,
      )
      let changedOldRows = 0
      previousRows.forEach((row, i) => {
        const [, name, score] = previousValues[i]
        if (row.name !== name || row.score !== score) changedOldRows++
      })
      if (mode !== 'shallow')
        assert(changedOldRows === 0, `${currentAction}: mutated old snapshot`)
      if (currentAction === 'stableRead' || currentAction === 'sameReference') {
        assert(
          sameArray && sameModel && newRows === 0,
          `${currentAction}: unstable references`,
        )
      }
      previousRows = currentRows
      previousValues = currentRows.map((row) => [row.id, row.name, row.score])
      previousModel = currentModel
      pending = undefined
      return {
        rows: currentRows.length,
        newRows,
        sameArray,
        sameModel,
        newCoreRows,
        staleCells,
        changedOldRows,
      }
    },
    dispose() {
      const runsBefore = bridgeRuns
      fixture.dispose()
      client.clear()
      client.setQueryData(key, { pages: [page(0, 1)], pageParams: [0] })
      flush()
      assert(
        bridgeRuns === runsBefore,
        'Disposed Query bridge ran after a cache write',
      )
      client.clear()
      currentRows = previousRows = []
      previousValues = []
      previousModel = currentModel = undefined
      pending = undefined
      expected = { pages: [], pageParams: [] }
      flush()
      return { cacheEntries: client.getQueryCache().getAll().length }
    },
  }
}
async function verifyPageContracts(pageScoped = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  const firstKey = ['page-contracts', 0]
  const secondKey = ['page-contracts', 1]
  const initial: Data = {
    pages: [{ data: [item(0), item(1)] }, { data: [item(2)] }],
    pageParams: [0, 1],
  }
  client.setQueryData(firstKey, initial)
  let active = 0
  let reads = 0
  const steps: Array<string> = []
  const fixture = createRoot((dispose) => {
    const [key, setKey] = createSignal(firstKey)
    const query = useInfiniteQuery(
      () => ({
        queryKey: key(),
        initialPageParam: 0,
        queryFn: ({ pageParam }) =>
          Promise.resolve({ data: [item(10 + pageParam)] }),
        getNextPageParam: (_last, pages) => pages.length,
        enabled: false,
        staleTime: Infinity,
      }),
      () => client,
    )
    const rows = pageScoped
      ? createInfiniteQueryRows(
          () => query.data.pages,
          (part) => {
            reads++
            active++
            onCleanup(() => {
              active--
            })
            return part.data
          },
        )
      : createMemo(() => query.data.pages.flatMap((part) => deep(part.data)))
    const table = createTable({
      features: tableFeatures({}),
      columns: [{ accessorKey: 'name' }, { accessorKey: 'score' }],
      get data() {
        return rows()
      },
      getRowId: (row) => row.id,
    })
    return { dispose, setKey, query, rows, table }
  })
  let key = firstKey
  let old: Array<Item> = []
  let oldValues: Array<[string, number]> = []
  const inspect = (name: string) => {
    flush()
    const expected = client.getQueryData<Data>(key)!
    const rows = fixture.rows()
    const model = fixture.table.getCoreRowModel()
    const expectedRows = expected.pages.flatMap((part) => part.data)
    assert(
      JSON.stringify(
        model.rows.map((row) => [
          row.id,
          row.getValue('name'),
          row.getValue('score'),
        ]),
      ) ===
        JSON.stringify(
          expectedRows.map((row) => [row.id, row.name, row.score]),
        ),
      `${name}: stale Query cells actual=${JSON.stringify(model.rows.map((row) => [row.id, row.getValue('name'), row.getValue('score')]))} expected=${JSON.stringify(expectedRows)}`,
    )
    assert(
      active === (pageScoped ? expected.pages.length : 0),
      `${name}: unbounded page computations ${active}`,
    )
    old.forEach((row, i) => {
      assert(
        row.name === oldValues[i][0] && row.score === oldValues[i][1],
        `${name}: mutated old snapshot`,
      )
    })
    old = rows
    oldValues = rows.map((row) => [row.name, row.score])
    steps.push(name)
  }
  const write = (name: string, data: Data) => {
    client.setQueryData(key, structuredClone(data))
    inspect(name)
  }
  try {
    inspect('initial')
    for (let i = 0; i < 20; i++) {
      const data = client.getQueryData<Data>(key)!
      write(`edit${i}`, {
        ...data,
        pages: [
          {
            data: data.pages[0].data.map((row, j) =>
              j === 0 ? { ...row, name: `Edit ${i}`, score: 100 + i } : row,
            ),
          },
          data.pages[1],
        ],
      })
    }
    const beforeMetadata = fixture.rows()
    const beforeModel = fixture.table.getCoreRowModel()
    const cached = client.getQueryData<Data>(key)!
    const metadataOnly: Data = {
      ...cached,
      pages: cached.pages.map((part) => ({ ...part, metadata: 'changed' })),
    }
    write('metadataOnly', metadataOnly)
    assert(
      fixture.rows() === beforeMetadata &&
        fixture.table.getCoreRowModel() === beforeModel,
      'Metadata rebuilt row data',
    )
    write('prepend', {
      pages: [{ data: [item(3)] }, ...cached.pages],
      pageParams: [-1, ...cached.pageParams],
    })
    const prepended = client.getQueryData<Data>(key)!
    write('reorder', {
      pages: [...prepended.pages].reverse(),
      pageParams: [...prepended.pageParams].reverse(),
    })
    const reordered = client.getQueryData<Data>(key)!
    write('replace', {
      ...reordered,
      pages: [{ data: [item(4)] }, ...reordered.pages.slice(1)],
    })
    const replaced = client.getQueryData<Data>(key)!
    write('insertRow', {
      ...replaced,
      pages: [
        { data: [item(5), ...replaced.pages[0].data] },
        ...replaced.pages.slice(1),
      ],
    })
    const inserted = client.getQueryData<Data>(key)!
    write('removeRow', {
      ...inserted,
      pages: [
        { data: inserted.pages[0].data.slice(1) },
        ...inserted.pages.slice(1),
      ],
    })
    const trimmed = client.getQueryData<Data>(key)!
    write('emptyPage', {
      ...trimmed,
      pages: [{ data: [] }, ...trimmed.pages.slice(1)],
    })
    write('emptyPages', { pages: [], pageParams: [] })
    write('restore', initial)
    await fixture.query.fetchNextPage()
    inspect('fetchNextPage')
    assert(fixture.rows().at(-1)?.id === 'r12', 'Next page did not append')
    client.setQueryData(secondKey, {
      pages: [{ data: [item(99)] }],
      pageParams: [0],
    })
    key = secondKey
    fixture.setKey(secondKey)
    inspect('queryKeyChange')
    const readsBefore = reads
    client.setQueryData(firstKey, {
      pages: [{ data: [item(98)] }],
      pageParams: [0],
    })
    inspect('oldKeyWrite')
    assert(reads === readsBefore, 'Previous Query key reran page snapshots')
  } finally {
    fixture.dispose()
    client.clear()
  }
  assert(active === 0, 'Disposed page computations remain active')
  const readsBefore = reads
  client.setQueryData(key, initial)
  flush()
  assert(
    reads === readsBefore && active === 0,
    'Disposed Query pages restarted',
  )
  client.clear()
  return { steps, active, reads }
}

declare global {
  interface Window {
    queryProfile: {
      start: typeof start
      verifyPageContracts: typeof verifyPageContracts
    }
  }
}
window.queryProfile = { start, verifyPageContracts }
