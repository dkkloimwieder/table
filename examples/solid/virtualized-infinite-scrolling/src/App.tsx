import {
  FlexRender,
  columnSizingFeature,
  createAtom,
  createColumnHelper,
  createSortedRowModel,
  createTable,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/solid-table'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/solid-query'
import {
  For,
  Repeat,
  Show,
  createEffect,
  createMemo,
  onSettled,
} from 'solid-js'
import { createVirtualizer } from './createVirtualizer'
import { fetchData } from './makeData'
import type { Person, PersonApiResponse } from './makeData'
import type { Cell, Row, SortingState } from '@tanstack/solid-table'
import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'

const fetchSize = 50

const features = tableFeatures({
  columnSizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

const columnHelper = createColumnHelper<typeof features, Person>()

const columns = columnHelper.columns([
  columnHelper.accessor('id', {
    header: 'ID',
    size: 60,
  }),
  columnHelper.accessor('firstName', {
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => row.lastName, {
    id: 'lastName',
    cell: (info) => info.getValue(),
    header: () => <span>Last Name</span>,
  }),
  columnHelper.accessor('age', {
    header: () => 'Age',
    size: 50,
  }),
  columnHelper.accessor('visits', {
    header: () => <span>Visits</span>,
    size: 50,
  }),
  columnHelper.accessor('status', {
    header: 'Status',
  }),
  columnHelper.accessor('progress', {
    header: 'Profile Progress',
    size: 80,
  }),
  columnHelper.accessor('createdAt', {
    header: 'Created At',
    cell: (info) => info.getValue<Date>().toLocaleString(),
    size: 200,
  }),
])

function App() {
  let tableContainerRef: HTMLDivElement | undefined

  const sortingAtom = createAtom<SortingState>([])
  const sorting = () => sortingAtom.get()

  const query = useInfiniteQuery<PersonApiResponse>(() => ({
    queryKey: ['people', sorting()],
    queryFn: async ({ pageParam = 0 }) => {
      const start = (pageParam as number) * fetchSize
      return fetchData(start, fetchSize, sorting())
    },
    initialPageParam: 0,
    getNextPageParam: (
      _lastGroup: PersonApiResponse,
      groups: Array<PersonApiResponse>,
    ) => groups.length,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  }))

  const flatData = createMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
  )
  const totalDBRowCount = () => query.data?.pages[0]?.meta?.totalRowCount ?? 0
  const totalFetched = () => flatData().length

  const fetchMoreOnBottomReached = (
    containerRefElement?: HTMLDivElement | null,
  ) => {
    if (containerRefElement) {
      const { scrollHeight, scrollTop, clientHeight } = containerRefElement
      if (
        scrollHeight - scrollTop - clientHeight < 500 &&
        !query.isFetching &&
        totalFetched() < totalDBRowCount()
      ) {
        void query.fetchNextPage()
      }
    }
  }

  // Check once settled to see if the table is already scrolled to the bottom and immediately needs to fetch more data
  onSettled(() => {
    fetchMoreOnBottomReached(tableContainerRef)
  })

  const table = createTable({
    features,
    get data() {
      return flatData()
    },
    columns,
    atoms: {
      sorting: sortingAtom,
    },
    manualSorting: true,
    debugTable: true,
  })

  const rows = () => table.getRowModel().rows

  // Important: The virtualizer and the scroll container ref must be in the same
  // component scope, and NOT inside a <Show> wrapper. <Show> creates a reactive
  // boundary that disrupts the virtualizer's onSettled timing.
  const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>(
    {
      get count() {
        return rows().length
      },
      // Keep this as close to the real rendered height as possible:
      // virtual-core rebuilds its measurement array from the first row whose
      // measured size differs from the estimate all the way to `count`, so an
      // inaccurate estimate costs a rebuild for every row scrolled into view.
      // These rows render at 29px.
      estimateSize: () => 29,
      getScrollElement: () => tableContainerRef ?? null,
      measureElement:
        typeof window !== 'undefined' &&
        navigator.userAgent.indexOf('Firefox') === -1
          ? (element) => element.getBoundingClientRect().height
          : undefined,
      overscan: 5,
    },
  )

  return (
    <div class="app">
      <Show when={import.meta.env.DEV}>
        <p>
          <strong>Notice:</strong> You are currently running Solid in
          development mode. Virtualized rendering performance will be slightly
          degraded until this application is built for production.
        </p>
      </Show>
      ({totalFetched().toLocaleString()} of {totalDBRowCount().toLocaleString()}{' '}
      rows fetched)
      <div
        class="container"
        onScroll={(e) => fetchMoreOnBottomReached(e.currentTarget)}
        ref={tableContainerRef}
        style={{
          overflow: 'auto',
          position: 'relative',
          height: '600px',
        }}
      >
        <table
          style={{
            display: 'grid',
            // The scroll range lives here rather than on <tbody>, because
            // <tbody> is the element that gets translated (see the note there).
            height: `${rowVirtualizer.getTotalSize()}px`,
            // Grid's default align-content stretches auto-sized tracks to fill
            // the container, which would spread <thead> and <tbody> over half
            // of this tall table each.
            'align-content': 'start',
          }}
        >
          <thead
            style={{
              display: 'grid',
              position: 'sticky',
              top: '0px',
              'z-index': 1,
            }}
          >
            <For each={table.getHeaderGroups()}>
              {(headerGroup) => (
                <tr style={{ display: 'flex', width: '100%' }}>
                  <For each={headerGroup.headers}>
                    {(header) => (
                      <th
                        style={{
                          display: 'flex',
                          width: `${header.getSize()}px`,
                        }}
                      >
                        <div
                          class={
                            header.column.getCanSort() ? 'sortable-header' : ''
                          }
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <FlexRender header={header} />
                          {(
                            {
                              asc: ' 🔼',
                              desc: ' 🔽',
                            } as Record<string, string>
                          )[header.column.getIsSorted() as string] ?? null}
                        </div>
                      </th>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </thead>
          <tbody
            style={{
              display: 'grid',
              // ONE transform for the whole window, instead of one per row.
              // Chrome restyles an element AND its immediate children whenever
              // its style changes, so translating N rows that hold C cells
              // each restyles N x (1 + C) elements, while translating their
              // parent restyles 1 + N. Rows flow normally; only this moves.
              transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
            }}
          >
            {/*
              Slot-based, NOT <For>. A virtual window holds a near-constant
              number of rows — scrolling changes which data they show, not how
              many there are. <For> keys by item identity, so a scroll reads as
              "N items left, N arrived" and rebuilds every row and cell
              component. <Repeat> keeps one component per slot.
            */}
            <Repeat count={rowVirtualizer.getVirtualItems().length}>
              {(slot) => (
                <TableBodyRow
                  virtualRow={() => rowVirtualizer.getVirtualItems()[slot]}
                  rows={rows}
                  rowVirtualizer={rowVirtualizer}
                />
              )}
            </Repeat>
          </tbody>
        </table>
      </div>
      <Show when={query.isFetching}>
        <div>Fetching More...</div>
      </Show>
    </div>
  )
}

// One instance per visible SLOT, reused for the whole scroll. Every prop is an
// accessor so the slot re-points at different data without being rebuilt.
function TableBodyRow(props: {
  virtualRow: () => VirtualItem | undefined
  rows: () => Array<Row<typeof features, Person>>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
}) {
  let el: HTMLTableRowElement | undefined

  // Memoized, not plain accessors: each cell slot below reads `cells()`, which
  // walks cells -> row -> rows -> table.getRowModel(). As bare functions that
  // whole chain re-runs once per cell instead of once per row.
  const virtualRow = createMemo(() => props.virtualRow())
  const row = createMemo<Row<typeof features, Person> | undefined>(
    () => props.rows()[virtualRow()?.index ?? -1],
  )
  const cells = createMemo(() => row()?.getAllCells() ?? [])
  // Explicit `| undefined` so the guards below are honest: a slot can briefly
  // outlive its data while the window is being resized.
  const cellAt = (
    slot: number,
  ): Cell<typeof features, Person, unknown> | undefined => cells()[slot]

  // The ref fires once per slot, but a slot changes index on every scroll, so
  // measurement cannot ride on ref creation. Re-measure whenever the index
  // changes, setting data-index first: virtual-core reads that attribute to
  // identify the row and silently skips the measurement when it is absent.
  // Solid compiles a dynamic `data-index={...}` into an effect that runs AFTER
  // the ref, which is why the attribute form never worked here.
  createEffect(
    () => virtualRow()?.index,
    (index) => {
      if (el === undefined || index === undefined) return
      el.setAttribute('data-index', String(index))
      props.rowVirtualizer.measureElement(el)
    },
  )

  return (
    // Rows are in normal flow and carry NO per-row position: the parent
    // <tbody> is translated once for the whole window.
    <tr ref={el} style={{ display: 'flex', width: '100%' }}>
      <Repeat count={cells().length}>
        {(slot) => (
          <td
            style={{
              display: 'flex',
              width: `${cellAt(slot)?.column.getSize() ?? 0}px`,
            }}
          >
            <FlexRender cell={cellAt(slot)!} />
          </td>
        )}
      </Repeat>
    </tr>
  )
}

export default App
