import { render } from '@solidjs/web'
import {
  For,
  createMemo,
  createRenderEffect,
  createSignal,
  createStore,
  deep,
  flush,
  onCleanup,
  reconcile,
} from 'solid-js'
import {
  columnFilteringFeature,
  coreCellsFeature,
  coreRowsFeature,
  createFilteredRowModel,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/table-core'
import { createTable } from '../src/createTable'
import { createNativeTable } from './native-table'
import {
  createStoreFilteredRowModel,
  createStoreRowModel,
  createStoreSortedRowModel,
} from './store-row-model'

type RecordData = {
  id: string
  name: string
  score: number
  quantity: number
  region: string
  active: boolean
  details: { label: string }
  revision: number
  unused: number
}
type Mode = 'array' | 'deep' | 'store' | 'keyed' | 'native'
type Stage = 'source' | 'ids' | 'rows' | 'view'
type Action =
  | 'append'
  | 'edit'
  | 'unrelated'
  | 'replace'
  | 'filter'
  | 'sort'
  | 'activeEdit'
  | 'refresh'
const rowHeight = 28
const windowSize = 40
const seed = 1729

function record(index: number): RecordData {
  return {
    id: `row-${index}`,
    name: `Record ${index}`,
    score: (Math.imul(index, 7919) + seed) % 1000,
    quantity: index % 97,
    region: ['East', 'West', 'North', 'South'][index % 4]!,
    active: index % 3 !== 0,
    details: { label: `Detail ${index}` },
    revision: 0,
    unused: 0,
  }
}

function counters() {
  return {
    rows: 0,
    cells: 0,
    mounts: 0,
    unmounts: 0,
    comparators: 0,
    filters: 0,
    idReads: 0,
    accessors: {} as Record<string, number>,
  }
}

let dispose: (() => void) | undefined
let api: ReturnType<typeof mount> | undefined
function mount(mode: Mode, size: number, stage: Stage = 'view') {
  const counts = counters()
  const data = Array.from({ length: size }, (_, i) => record(i))
  let readData!: () => ReadonlyArray<RecordData>
  let mutate!: (action: Action) => void
  let inspect!: () => {
    count: number
    first: string | undefined
    last: string | undefined
    visible: Array<string>
  }
  let scroller!: HTMLDivElement
  const node = document.getElementById('root')!
  dispose = render(() => {
    const immutable = mode === 'array' ? createSignal(data) : undefined
    const stored =
      mode === 'deep' || mode === 'store' ? createStore(data) : undefined
    const keyed =
      mode === 'keyed'
        ? createStore({
            ids: data.map((row) => row.id),
            records: Object.fromEntries(data.map((row) => [row.id, row])),
          })
        : undefined
    const order =
      mode === 'native' ? createSignal(data.map((row) => row.id)) : undefined
    const nativeRecords =
      mode === 'native'
        ? createStore(Object.fromEntries(data.map((row) => [row.id, row])))
        : undefined
    const keyedSource = nativeRecords
      ? { ids: order![0], get: (id: string) => nativeRecords[0][id]! }
      : keyed
        ? {
            ids: () => keyed[0].ids,
            get: (id: string) => keyed[0].records[id]!,
          }
        : undefined
    const keyedArray = keyed
      ? createMemo(() => keyed[0].ids.map((id) => keyed[0].records[id]!), {
          lazy: true,
        })
      : undefined
    readData =
      mode === 'array'
        ? immutable![0]
        : mode === 'native'
          ? () => order![0]().map((id) => nativeRecords![0][id]!)
          : keyed
            ? keyedArray!
            : () => stored![0]
    if (stage === 'source') return null
    if (stage === 'ids') {
      createRenderEffect(
        () => readData().map((row) => row.id),
        () => {},
      )
      return null
    }
    const rows =
      mode === 'array'
        ? immutable![0]
        : mode === 'deep'
          ? createMemo(() => deep(stored![0]))
          : keyed
            ? keyedArray!
            : () => stored![0]
    const getId = (row: RecordData) => {
      counts.idReads++
      return row.id
    }
    const access =
      (id: string, read: (row: RecordData) => unknown) => (row: RecordData) => {
        counts.accessors[id] = (counts.accessors[id] ?? 0) + 1
        return read(row)
      }
    const table =
      mode === 'native'
        ? undefined
        : (() => {
            const features = tableFeatures({
              coreRowsFeature: {
                ...coreRowsFeature,
                initRowInstanceData: () => {
                  counts.rows++
                },
              },
              coreCellsFeature: {
                ...coreCellsFeature,
                initCellInstanceData: () => {
                  counts.cells++
                },
              },
              columnFilteringFeature,
              rowSortingFeature,
              ...(mode === 'store' || mode === 'keyed'
                ? {
                    coreRowModel: createStoreRowModel<RecordData>(
                      getId,
                      keyedSource,
                    ),
                    filteredRowModel: createStoreFilteredRowModel(),
                    sortedRowModel: createStoreSortedRowModel(),
                  }
                : {
                    filteredRowModel: createFilteredRowModel(),
                    sortedRowModel: createSortedRowModel(),
                  }),
            })
            return createTable({
              features,
              get data() {
                return rows()
              },
              getRowId: getId,
              columns: [
                { id: 'id', accessorFn: access('id', (row) => row.id) },
                { id: 'name', accessorFn: access('name', (row) => row.name) },
                {
                  id: 'score',
                  accessorFn: access('score', (row) => row.score),
                  filterFn: (row, id, value: number) => {
                    counts.filters++
                    return row.getValue<number>(id) >= value
                  },
                  sortFn: (a, b, id) => {
                    counts.comparators++
                    return a.getValue<number>(id) - b.getValue<number>(id)
                  },
                },
                {
                  id: 'quantity',
                  accessorFn: access('quantity', (row) => row.quantity),
                },
                {
                  id: 'region',
                  accessorFn: access('region', (row) => row.region),
                },
                {
                  id: 'active',
                  accessorFn: access('active', (row) => row.active),
                },
                {
                  id: 'detail',
                  accessorFn: access('detail', (row) => row.details.label),
                },
                {
                  id: 'revision',
                  accessorFn: access('revision', (row) => row.revision),
                },
              ],
            })
          })()
    const native =
      mode === 'native'
        ? createNativeTable<RecordData>({
            source: keyedSource!,
            columns: [
              { id: 'id', accessorFn: access('id', (row) => row.id) },
              { id: 'name', accessorFn: access('name', (row) => row.name) },
              {
                id: 'score',
                accessorFn: access('score', (row) => row.score),
                filterFn: (value, minimum) => {
                  counts.filters++
                  return (value as number) >= (minimum as number)
                },
                sortFn: (a, b) => {
                  counts.comparators++
                  return (a as number) - (b as number)
                },
              },
              {
                id: 'quantity',
                accessorFn: access('quantity', (row) => row.quantity),
              },
              {
                id: 'region',
                accessorFn: access('region', (row) => row.region),
              },
              {
                id: 'active',
                accessorFn: access('active', (row) => row.active),
              },
              {
                id: 'detail',
                accessorFn: access('detail', (row) => row.details.label),
              },
              {
                id: 'revision',
                accessorFn: access('revision', (row) => row.revision),
              },
            ],
          })
        : undefined
    const model = table ? createMemo(() => table.getRowModel()) : undefined
    const rowCount = () =>
      native ? native.getRowIds().length : model!().rows.length
    if (stage === 'rows') {
      createRenderEffect(
        () => (native ? native.getRowIds() : model!()),
        () => {},
      )
      return null
    }
    const [start, setStart] = createSignal(0)
    const visible = createMemo(() =>
      native
        ? native.getRowIds().slice(start(), start() + windowSize)
        : model!().rows.slice(start(), start() + windowSize),
    )
    mutate = (action) => {
      if (action === 'filter') {
        if (native) native.setColumnFilters([{ id: 'score', value: 500 }])
        else table!.setColumnFilters([{ id: 'score', value: 500 }])
        return
      }
      if (action === 'sort') {
        if (native) native.setSorting([{ id: 'score', desc: true }])
        else table!.setSorting([{ id: 'score', desc: true }])
        return
      }
      if (mode === 'array') {
        immutable![1]((old) => {
          if (action === 'append')
            return [
              ...old,
              ...Array.from({ length: 100 }, (_, i) => record(old.length + i)),
            ]
          if (action === 'refresh')
            return old.map((row, i) =>
              i % 100 === 0
                ? { ...row, score: row.score + 1, revision: row.revision + 1 }
                : row,
            )
          const next = old.slice()
          const row = old[0]!
          next[0] =
            action === 'unrelated'
              ? { ...row, unused: row.unused + 1 }
              : action === 'replace'
                ? { ...row, name: 'Replacement', revision: row.revision + 1 }
                : { ...row, score: action === 'activeEdit' ? 400 : 2000 }
          return next
        })
      } else if (nativeRecords) {
        if (action === 'append') {
          const added = Array.from({ length: 100 }, (_, i) =>
            record(order![0]().length + i),
          )
          nativeRecords[1]((draft) => {
            for (const row of added) draft[row.id] = row
          })
          order![1]((old) => [...old, ...added.map((row) => row.id)])
        } else {
          nativeRecords[1]((draft) => {
            if (action === 'refresh') {
              const next = readData().map((row, i) =>
                i % 100 === 0
                  ? { ...row, score: row.score + 1, revision: row.revision + 1 }
                  : row,
              )
              reconcile(
                Object.fromEntries(next.map((row) => [row.id, row])),
                'id',
              )(draft)
            } else {
              const id = order![0]()[0]!
              const row = draft[id]!
              if (action === 'unrelated') row.unused++
              else if (action === 'replace')
                draft[id] = {
                  ...row,
                  name: 'Replacement',
                  revision: row.revision + 1,
                }
              else row.score = action === 'activeEdit' ? 400 : 2000
            }
          })
        }
      } else if (keyed) {
        keyed[1]((draft) => {
          if (action === 'append') {
            const length = draft.ids.length
            for (let i = 0; i < 100; i++) {
              const row = record(length + i)
              draft.ids.push(row.id)
              draft.records[row.id] = row
            }
          } else if (action === 'refresh') {
            const next = readData().map((row, i) =>
              i % 100 === 0
                ? { ...row, score: row.score + 1, revision: row.revision + 1 }
                : row,
            )
            reconcile(
              Object.fromEntries(next.map((row) => [row.id, row])),
              'id',
            )(draft.records)
          } else {
            const id = draft.ids[0]!
            const row = draft.records[id]!
            if (action === 'unrelated') row.unused++
            else if (action === 'replace')
              draft.records[id] = {
                ...row,
                name: 'Replacement',
                revision: row.revision + 1,
              }
            else row.score = action === 'activeEdit' ? 400 : 2000
          }
        })
      } else {
        stored![1]((draft) => {
          if (action === 'append') {
            const length = draft.length
            draft.push(
              ...Array.from({ length: 100 }, (_, i) => record(length + i)),
            )
            return
          }
          if (action === 'refresh') {
            const next = readData().map((row, i) =>
              i % 100 === 0
                ? { ...row, score: row.score + 1, revision: row.revision + 1 }
                : row,
            )
            reconcile(next, 'id')(draft)
          } else if (action === 'unrelated') draft[0]!.unused++
          else if (action === 'replace')
            draft[0] = {
              ...draft[0]!,
              name: 'Replacement',
              revision: draft[0]!.revision + 1,
            }
          else draft[0]!.score = action === 'activeEdit' ? 400 : 2000
        })
      }
    }
    inspect = () => {
      const filters = native
        ? native.state.columnFilters
        : table!.atoms.columnFilters.get()
      const sorting = native ? native.state.sorting : table!.atoms.sorting.get()
      const expected = Array.from(readData()).filter(
        (row) => !filters.length || row.score >= 500,
      )
      if (sorting.length) expected.sort((a, b) => b.score - a.score)
      const actual = native
        ? native.getRowIds()
        : model!().rows.map((row) => row.id)
      if (
        actual.length !== expected.length ||
        actual.some((id, i) => id !== expected[i]!.id)
      )
        throw new Error('Incorrect row sequence')
      const mounted = Array.from(node.querySelectorAll('[data-row]'))
      mounted.forEach((element, i) => {
        const expectedRow = expected[start() + i]!
        if (element.getAttribute('data-row') !== expectedRow.id)
          throw new Error('Incorrect mounted row')
        const expectedValues = [
          expectedRow.id,
          expectedRow.name,
          expectedRow.score,
          expectedRow.quantity,
          expectedRow.region,
          expectedRow.active,
          expectedRow.details.label,
          expectedRow.revision,
        ].map(String)
        Array.from(element.children).forEach((cell, column) => {
          if (cell.textContent !== expectedValues[column])
            throw new Error(
              `Stale ${expectedRow.id} column ${column}: ${cell.textContent}`,
            )
        })
      })
      if (mounted.length !== Math.min(windowSize, expected.length - start()))
        throw new Error('Incorrect window size')
      return {
        count: actual.length,
        first: actual[0],
        last: actual.at(-1),
        visible: mounted.map((el) => el.getAttribute('data-row')!),
      }
    }
    return (
      <div
        ref={scroller}
        style={{
          height: '560px',
          overflow: 'auto',
          width: '960px',
          'font-family': 'sans-serif',
          'font-size': '12px',
        }}
        onScroll={() =>
          setStart(
            Math.min(
              Math.floor(scroller.scrollTop / rowHeight),
              Math.max(0, rowCount() - windowSize),
            ),
          )
        }
      >
        <div
          style={{
            height: `${rowCount() * rowHeight}px`,
            position: 'relative',
          }}
        >
          <div style={{ transform: `translateY(${start() * rowHeight}px)` }}>
            <For each={visible()}>
              {(item) => {
                const row =
                  typeof item === 'string'
                    ? (() => {
                        counts.rows++
                        const view = native!.createRowView(item)
                        const seen = new WeakSet()
                        return {
                          id: view.id,
                          getAllCells: () => {
                            const cells = view.getVisibleCells()
                            for (const cell of cells) {
                              if (seen.has(cell)) continue
                              seen.add(cell)
                              counts.cells++
                            }
                            return cells
                          },
                        }
                      })()
                    : item
                counts.mounts++
                onCleanup(() => {
                  counts.unmounts++
                })
                return (
                  <div
                    data-row={row.id}
                    style={{ display: 'flex', height: `${rowHeight}px` }}
                  >
                    <For each={row.getAllCells()}>
                      {(cell) => (
                        <span style={{ width: '120px', overflow: 'hidden' }}>
                          {String(cell.getValue())}
                        </span>
                      )}
                    </For>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </div>
    )
  }, node)
  flush()
  return {
    counts,
    mutate,
    inspect,
    get scroller() {
      return scroller
    },
  }
}

const frame = () =>
  new Promise<number>((resolve) => requestAnimationFrame(resolve))
const copyCounts = () => structuredClone(api!.counts)
const benchmark = {
  start(mode: Mode, size: number, stage: Stage = 'view') {
    benchmark.dispose()
    const begin = performance.now()
    api = mount(mode, size, stage)
    return { duration: performance.now() - begin, counts: copyCounts() }
  },
  async action(action: Action) {
    const before = copyCounts()
    const begin = performance.now()
    api!.mutate(action)
    flush()
    const duration = performance.now() - begin
    const after = copyCounts()
    const firstFrame = await frame()
    const secondFrame = await frame()
    return {
      duration,
      frameLatency: secondFrame - begin,
      frameGap: secondFrame - firstFrame,
      before,
      after,
    }
  },
  inspect() {
    return api!.inspect()
  },
  async scroll() {
    const before = copyCounts()
    const times: Array<number> = []
    for (let i = 0; i <= 60; i++) {
      times.push(await frame())
      api!.scroller.scrollTop = Math.floor(
        ((api!.scroller.scrollHeight - api!.scroller.clientHeight) * i) / 60,
      )
    }
    await frame()
    await frame()
    return {
      intervals: times.slice(1).map((time, i) => time - times[i]!),
      before,
      after: copyCounts(),
    }
  },
  dispose() {
    dispose?.()
    dispose = undefined
    flush()
    const counts = api ? copyCounts() : undefined
    api = undefined
    return counts
  },
  async settle() {
    await frame()
    await frame()
    flush()
  },
  metadata: { seed, rowHeight, windowSize, columns: 8 },
}
Object.assign(window, { benchmark })
