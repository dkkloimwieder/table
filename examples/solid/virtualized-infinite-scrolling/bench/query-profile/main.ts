import { createMemo, createRoot, deep, flush } from 'solid-js'
import { QueryClient, useInfiniteQuery } from '@tanstack/solid-query'
import { createTable, tableFeatures } from '@tanstack/solid-table'
import type { InfiniteData } from '@tanstack/solid-query'

type Item = { id: string; name: string; score: number }
type Page = { data: Array<Item> }
type Data = InfiniteData<Page, number>
type Mode = 'deep' | 'clone' | 'shallow'
type Action =
  | 'load'
  | 'stableRead'
  | 'sameReference'
  | 'equalPayload'
  | 'fieldEdit'
  | 'appendPage'
  | 'pageReplacement'
  | 'removePage'
const pageSize = 1000
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

function start(mode: Mode, size: number, structuralSharing: boolean) {
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
    const rows = createMemo(() => {
      bridgeRuns++
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
        equalPayload: mode === 'deep' && !structuralSharing ? size : 0,
        fieldEdit: mode === 'deep' ? 1 : mode === 'clone' ? size : 0,
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
declare global {
  interface Window {
    queryProfile: { start: typeof start }
  }
}
window.queryProfile = { start }
