import {
  FlexRender,
  columnSizingFeature,
  createSortedRowModel,
  createTable,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/solid-table'
import { For, Repeat, createEffect, createMemo, createSignal } from 'solid-js'
import { createVirtualizer } from './createVirtualizer'
import { makeData } from './makeData'
import type { Row, SolidTable } from '@tanstack/solid-table'
import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import type { Person } from './makeData'

const features = tableFeatures({
  columnSizingFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

// This is a dynamic row height example, which is more complicated, but allows for a more realistic table.
// See https://tanstack.com/virtual/v3/docs/examples/solid/table for a simpler fixed row height example.
function App() {
  const columns = [
    {
      id: 'select',
      header: ({ table }: any) => (
        <IndeterminateCheckbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }: any) => (
        <IndeterminateCheckbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          indeterminate={row.getIsSomeSelected()}
          onClick={row.getToggleSelectedHandler({
            // selectChildren: false
          })}
        />
      ),
      size: 40,
    },
    {
      accessorKey: 'id',
      header: 'ID',
      size: 60,
    },
    {
      accessorKey: 'firstName',
      cell: (info: any) => info.getValue(),
    },
    {
      accessorFn: (row: Person) => row.lastName,
      id: 'lastName',
      cell: (info: any) => info.getValue(),
      header: () => <span>Last Name</span>,
    },
    {
      accessorKey: 'age',
      header: () => 'Age',
      size: 50,
    },
    {
      accessorKey: 'visits',
      header: () => <span>Visits</span>,
      size: 50,
    },
    {
      accessorKey: 'status',
      header: 'Status',
    },
    {
      accessorKey: 'progress',
      header: 'Profile Progress',
      size: 80,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created At',
      cell: (info: any) => (info.getValue() as Date).toLocaleString(),
      size: 250,
    },
  ]

  const [data, setData] = createSignal(makeData(200_000))

  const refreshData = () => setData(makeData(200_000))
  const stressTest = () => setData(makeData(1_000_000))

  const table = createTable({
    features,
    columns,
    get data() {
      return data()
    },
    getRowId: (row) => String(row.id),
    debugTable: true,
  })

  return (
    <>
      <div class="app">
        <div>
          <button onClick={() => refreshData()}>Regenerate Data</button>
          <button onClick={() => stressTest()}>Stress Test (1M rows)</button>
        </div>
        ({data().length.toLocaleString()} rows)
        <p>Hold Shift while selecting rows to select or deselect a range.</p>
        <p>{table.getSelectedRowIds().length.toLocaleString()} rows selected</p>
        <VirtualizedTable table={table} />
      </div>
    </>
  )
}

// Important: Keep the virtualizer and the scroll container ref in the same component.
// The ref must be undefined when createVirtualizer runs (before JSX return),
// so that onSettled can set up scroll observers after the element is in the DOM.
function VirtualizedTable(props: {
  table: SolidTable<typeof features, Person>
}) {
  let tableContainerRef: HTMLDivElement | undefined

  const rows = () => props.table.getRowModel().rows

  // Important: Keep the row virtualizer in the lowest component possible to avoid unnecessary re-renders.
  const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>(
    {
      get count() {
        return rows().length
      },
      // Estimate row height for accurate scrollbar dragging. Keep this as close
      // to the real rendered height as possible: virtual-core rebuilds its
      // measurement array from the first row whose measured size differs from
      // the estimate all the way to `count`, so on a 200k-row table a 1px
      // error costs a ~170,000-iteration rebuild for every row scrolled into
      // view. These rows render at exactly 32px.
      estimateSize: () => 32,
      getScrollElement: () => tableContainerRef ?? null,
      // measure dynamic row height, except in firefox because it measures table border height incorrectly
      measureElement:
        typeof window !== 'undefined' &&
        navigator.userAgent.indexOf('Firefox') === -1
          ? (element) => element.getBoundingClientRect().height
          : undefined,
      overscan: 5,
    },
  )

  return (
    <div
      class="container"
      ref={tableContainerRef}
      style={{
        overflow: 'auto',
        position: 'relative',
        height: '800px',
      }}
    >
      {/* Even though we're still using semantic table tags, we must use CSS grid and flexbox for dynamic row heights */}
      <table
        style={{
          display: 'grid',
          // The scroll range lives here rather than on <tbody>, because <tbody>
          // is the element that gets translated (see the note there).
          height: `${rowVirtualizer.getTotalSize()}px`,
          // Grid's default align-content stretches auto-sized tracks to fill
          // the container, which on a 6.6M-pixel table would spread <thead> and
          // <tbody> over half of it each.
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
          <For each={props.table.getHeaderGroups()}>
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
            // its style changes, so translating 36 rows that hold 9 cells each
            // restyles 36 x 10 = 360 elements per pass; translating their
            // parent restyles 1 + 36 = 37. Measured on this example: 1,262 ms
            // of style recalculation over a scripted scroll, versus 27 ms.
            // Rows therefore flow normally and only this offset moves.
            transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
          }}
        >
          {/*
            Slot-based, NOT <For>. A virtual window holds a near-constant number
            of rows (~30 here) — scrolling changes which data they show, not how
            many there are. <For> keys by item identity, so a scroll reads as
            "30 items left, 30 arrived" and it tears down and rebuilds 30 row
            components plus ~270 cell components per batch. <Repeat> keeps one
            component per slot for as long as the count holds, so scrolling
            updates content in place and constructs nothing.
          */}
          <Repeat count={rowVirtualizer.getVirtualItems().length}>
            {(slot) => (
              <TableBodyRow
                virtualRow={() => rowVirtualizer.getVirtualItems()[slot]}
                rows={rows}
                rowVirtualizer={rowVirtualizer}
                table={props.table}
              />
            )}
          </Repeat>
        </tbody>
      </table>
    </div>
  )
}

// One instance per visible SLOT, reused for the whole scroll. Every prop is an
// accessor so the slot re-points at different data without being rebuilt.
function TableBodyRow(props: {
  virtualRow: () => VirtualItem | undefined
  rows: () => Array<Row<typeof features, Person>>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
  table: SolidTable<typeof features, Person>
}) {
  let el: HTMLTableRowElement | undefined

  // Memoized, not plain accessors: each of the ~9 cell slots below reads
  // `cells()`, which walks cells -> row -> rows -> table.getRowModel(). As bare
  // functions that whole chain re-runs once per cell instead of once per row.
  const virtualRow = createMemo(() => props.virtualRow())
  const row = createMemo(() => props.rows()[virtualRow()?.index ?? -1])
  const cells = createMemo(() => row()?.getAllCells() ?? [])

  // The ref fires once per slot, but a slot changes index on every scroll, so
  // measurement cannot ride on ref creation. Re-measure whenever the index
  // changes, setting data-index first: virtual-core reads that attribute to
  // identify the row and silently skips the measurement when it is absent.
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
    // <tbody> is translated once for the whole window. Their heights are still
    // whatever the content needs, which is what the virtualizer measures.
    <tr ref={el} style={{ display: 'flex', width: '100%' }}>
      {/* Slot-based for the same reason as the rows: the column count is fixed,
          so these cell components are built once and then only update. */}
      <Repeat count={cells().length}>
        {(slot) => (
          <td
            style={{
              display: 'flex',
              width: `${cells()[slot]?.column.getSize() ?? 0}px`,
            }}
          >
            <FlexRender cell={cells()[slot]} />
          </td>
        )}
      </Repeat>
    </tr>
  )
}

function IndeterminateCheckbox(props: {
  indeterminate?: boolean
  class?: string
  checked?: boolean
  disabled?: boolean
  onChange?: (event: Event) => void
  onClick?: (event: MouseEvent) => void
}) {
  let ref: HTMLInputElement | undefined

  createEffect(
    () => ({ indeterminate: props.indeterminate, checked: props.checked }),
    ({ indeterminate, checked }) => {
      if (typeof indeterminate === 'boolean' && ref) {
        ref.indeterminate = !checked && indeterminate
      }
    },
  )

  return (
    <input
      type="checkbox"
      ref={ref}
      class={props.class ?? ''}
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
      onClick={props.onClick}
    />
  )
}

export default App
