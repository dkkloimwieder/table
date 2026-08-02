import {
  FlexRender,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createSortedRowModel,
  createTable,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/solid-table'
import { For, Repeat, createEffect, createMemo, createSignal } from 'solid-js'
import { createVirtualizer } from './createVirtualizer'
import { makeColumns, makeData } from './makeData'
import type {
  Cell,
  Header,
  HeaderGroup,
  Row,
  SolidTable,
} from '@tanstack/solid-table'
import type { VirtualItem, Virtualizer } from '@tanstack/virtual-core'
import type { Person } from './makeData'

const features = tableFeatures({
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

const DEFAULT_ROW_COUNT = 1_000
const DEFAULT_COLUMN_COUNT = 1_000
const STRESS_ROW_COUNT = 10_000
const STRESS_COLUMN_COUNT = 10_000

function App() {
  const [columns, setColumns] = createSignal(makeColumns(DEFAULT_COLUMN_COUNT))
  const [data, setData] = createSignal(makeData(DEFAULT_ROW_COUNT, columns()))

  const refreshData = () => {
    const nextColumns = makeColumns(DEFAULT_COLUMN_COUNT)
    setColumns(nextColumns)
    setData(makeData(DEFAULT_ROW_COUNT, nextColumns))
  }

  const stressTestRows = () => {
    setData(makeData(STRESS_ROW_COUNT, columns()))
  }

  const stressTestColumns = () => {
    const nextColumns = makeColumns(STRESS_COLUMN_COUNT)
    setColumns(nextColumns)
    setData(makeData(data().length, nextColumns))
  }

  const table = createTable({
    features,
    get columns() {
      return columns()
    },
    get data() {
      return data()
    },
    columnResizeMode: 'onChange',
    debugTable: true,
  })

  return (
    <div class="app">
      <div>
        <button onClick={() => refreshData()}>Regenerate Data</button>
        <button onClick={() => stressTestRows()}>Stress Test (10k rows)</button>
        <button onClick={() => stressTestColumns()}>
          Stress Test (10k columns)
        </button>
      </div>
      <div>({columns().length.toLocaleString()} columns)</div>
      <div>({data().length.toLocaleString()} rows)</div>
      <TableContainer table={table} />
    </div>
  )
}

// Important: Keep both virtualizers and the scroll container ref in the same component.
// The ref must be undefined when createVirtualizer runs (before JSX return),
// so that onSettled can set up scroll observers after the element is in the DOM.
function TableContainer(props: { table: SolidTable<typeof features, Person> }) {
  const visibleColumns = () => props.table.getVisibleLeafColumns()
  const rows = () => props.table.getRowModel().rows

  let tableContainerRef: HTMLDivElement | undefined

  // We are using a slightly different virtualization strategy for columns (compared to virtual rows)
  // in order to support dynamic row heights.
  const columnVirtualizer = createVirtualizer<
    HTMLDivElement,
    HTMLTableCellElement
  >({
    get count() {
      return visibleColumns().length
    },
    estimateSize: (index) => visibleColumns()[index].getSize(), // estimate width of each column for accurate scrollbar dragging
    getScrollElement: () => tableContainerRef ?? null,
    horizontal: true,
    overscan: 3, // how many columns to render on each side off screen (adjust this for performance)
  })

  // re-measure virtual column widths when a column is resized so the
  // virtualizer's scroll math stays in sync with the rendered widths
  createEffect(
    () => props.table.atoms.columnSizing?.get(),
    () => {
      columnVirtualizer.measure()
    },
  )

  // dynamic row height virtualization - alternatively you could use a simpler fixed row height strategy without `measureElement`
  const rowVirtualizer = createVirtualizer<HTMLDivElement, HTMLTableRowElement>(
    {
      get count() {
        return rows().length
      },
      // Estimate row height for accurate scrollbar dragging. Keep this as close
      // to the real rendered height as possible: virtual-core rebuilds its
      // measurement array from the first row whose measured size differs from
      // the estimate all the way to `count`, so an inaccurate estimate costs a
      // rebuild for every row scrolled into view. These rows render at 29px.
      estimateSize: () => 29,
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

  // Different virtualization strategy for columns - instead of absolute and translateY,
  // we add empty columns to the left and right
  const virtualPaddingLeft = () => {
    const vcs = columnVirtualizer.getVirtualItems()
    return vcs.length ? (vcs[0]?.start ?? 0) : undefined
  }

  const virtualPaddingRight = () => {
    const vcs = columnVirtualizer.getVirtualItems()
    if (!vcs.length) return undefined
    return columnVirtualizer.getTotalSize() - (vcs[vcs.length - 1]?.end ?? 0)
  }

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
          // the container, which would spread <thead> and <tbody> over half of
          // this very tall table each.
          'align-content': 'start',
        }}
      >
        <TableHead
          columnVirtualizer={columnVirtualizer}
          table={props.table}
          virtualPaddingLeft={virtualPaddingLeft()}
          virtualPaddingRight={virtualPaddingRight()}
        />
        <TableBody
          columnVirtualizer={columnVirtualizer}
          rowVirtualizer={rowVirtualizer}
          rows={rows}
          table={props.table}
          virtualPaddingLeft={virtualPaddingLeft()}
          virtualPaddingRight={virtualPaddingRight()}
        />
      </table>
    </div>
  )
}

function TableHead(props: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  table: SolidTable<typeof features, Person>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
}) {
  return (
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
          <TableHeadRow
            columnVirtualizer={props.columnVirtualizer}
            headerGroup={headerGroup}
            virtualPaddingLeft={props.virtualPaddingLeft}
            virtualPaddingRight={props.virtualPaddingRight}
            table={props.table}
          />
        )}
      </For>
    </thead>
  )
}

function TableHeadRow(props: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  headerGroup: HeaderGroup<typeof features, Person>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
  table: SolidTable<typeof features, Person>
}) {
  const virtualColumns = createMemo(() =>
    props.columnVirtualizer.getVirtualItems(),
  )
  const headerAt = (
    slot: number,
  ): Header<typeof features, Person, unknown> | undefined =>
    props.headerGroup.headers[virtualColumns()[slot]?.index ?? -1]
  return (
    <tr style={{ display: 'flex', width: '100%' }}>
      {props.virtualPaddingLeft ? (
        // fake empty column to the left for virtualization scroll padding
        <th
          style={{ display: 'flex', width: `${props.virtualPaddingLeft}px` }}
        />
      ) : null}
      {/* Slot-based, NOT <For>: horizontal scrolling changes which column each
          slot shows, not how many slots there are. */}
      <Repeat count={virtualColumns().length}>
        {(slot) => (
          <TableHeadCell header={() => headerAt(slot)} table={props.table} />
        )}
      </Repeat>
      {props.virtualPaddingRight ? (
        // fake empty column to the right for virtualization scroll padding
        <th
          style={{ display: 'flex', width: `${props.virtualPaddingRight}px` }}
        />
      ) : null}
    </tr>
  )
}

function TableHeadCell(props: {
  header: () => Header<typeof features, Person, unknown> | undefined
  table: SolidTable<typeof features, Person>
}) {
  // Memoized: this component reads its header a dozen times below, and a slot
  // re-points at a different column on every horizontal scroll update.
  const header = createMemo(() => props.header())
  return (
    <th
      style={{
        display: 'flex',
        position: 'relative', // needed for absolute positioning of the resizer
        width: `${header()?.getSize() ?? 0}px`,
      }}
    >
      <div
        class={header()?.column.getCanSort() ? 'sortable-header' : ''}
        onClick={(event) => header()?.column.getToggleSortingHandler()?.(event)}
      >
        <FlexRender header={header()!} />
        {(
          {
            asc: ' 🔼',
            desc: ' 🔽',
          } as Record<string, string>
        )[header()?.column.getIsSorted() as string] ?? null}
      </div>
      <div
        onDblClick={() => header()?.column.resetSize()}
        onMouseDown={(event) => header()?.getResizeHandler()(event)}
        onTouchStart={(event) => header()?.getResizeHandler()(event)}
        class={`resizer ${header()?.column.getIsResizing() ? 'isResizing' : ''}`}
      />
    </th>
  )
}

function TableBody(props: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
  rows: () => Array<Row<typeof features, Person>>
  table: SolidTable<typeof features, Person>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
}) {
  const virtualRows = () => props.rowVirtualizer.getVirtualItems()

  return (
    <tbody
      style={{
        display: 'grid',
        // ONE transform for the whole window, instead of one per row. Chrome
        // restyles an element AND its immediate children whenever its style
        // changes, so translating N rows that hold C cells each restyles
        // N x (1 + C) elements, while translating their parent restyles 1 + N.
        // Rows therefore flow normally and only this offset moves.
        transform: `translateY(${virtualRows()[0]?.start ?? 0}px)`,
      }}
    >
      {/*
        Slot-based, NOT <For>. A virtual window holds a near-constant number of
        rows — scrolling changes which data they show, not how many there are.
        <For> keys by item identity, so a scroll reads as "N items left, N
        arrived" and it tears down and rebuilds every row and cell component.
        <Repeat> keeps one component per slot for as long as the count holds.
      */}
      <Repeat count={virtualRows().length}>
        {(slot) => (
          <TableBodyRow
            columnVirtualizer={props.columnVirtualizer}
            rows={props.rows}
            rowVirtualizer={props.rowVirtualizer}
            virtualPaddingLeft={props.virtualPaddingLeft}
            virtualPaddingRight={props.virtualPaddingRight}
            virtualRow={() => virtualRows()[slot]}
            table={props.table}
          />
        )}
      </Repeat>
    </tbody>
  )
}

// One instance per visible SLOT, reused for the whole scroll. Every prop is an
// accessor so the slot re-points at different data without being rebuilt.
function TableBodyRow(props: {
  columnVirtualizer: Virtualizer<HTMLDivElement, HTMLTableCellElement>
  rows: () => Array<Row<typeof features, Person>>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>
  virtualPaddingLeft: number | undefined
  virtualPaddingRight: number | undefined
  virtualRow: () => VirtualItem | undefined
  table: SolidTable<typeof features, Person>
}) {
  let el: HTMLTableRowElement | undefined

  // Memoized, not plain accessors: each visible cell slot below reads
  // `visibleCells()`, which walks cells -> row -> rows -> table.getRowModel().
  // As bare functions that whole chain re-runs once per cell instead of once
  // per row, and the reads land outside a tracking scope
  // ([STRICT_READ_UNTRACKED] on every cell, every update).
  const virtualRow = createMemo(() => props.virtualRow())
  const row = createMemo<Row<typeof features, Person> | undefined>(
    () => props.rows()[virtualRow()?.index ?? -1],
  )
  const visibleCells = createMemo(() => row()?.getVisibleCells() ?? [])
  const virtualColumns = createMemo(() =>
    props.columnVirtualizer.getVirtualItems(),
  )
  const cellAt = (slot: number): Cell<typeof features, Person, unknown> | undefined =>
    visibleCells()[virtualColumns()[slot]?.index ?? -1]

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
      {props.virtualPaddingLeft ? (
        // fake empty column to the left for virtualization scroll padding
        <td
          style={{ display: 'flex', width: `${props.virtualPaddingLeft}px` }}
        />
      ) : null}
      {/* Slot-based for the same reason as the rows above. */}
      <Repeat count={virtualColumns().length}>
        {(slot) => (
          <TableBodyCell cell={() => cellAt(slot)} table={props.table} />
        )}
      </Repeat>
      {props.virtualPaddingRight ? (
        // fake empty column to the right for virtualization scroll padding
        <td
          style={{ display: 'flex', width: `${props.virtualPaddingRight}px` }}
        />
      ) : null}
    </tr>
  )
}

function TableBodyCell(props: {
  cell: () => Cell<typeof features, Person, unknown> | undefined
  table: SolidTable<typeof features, Person>
}) {
  const cell = createMemo(() => props.cell())
  return (
    <td
      style={{
        display: 'flex',
        width: `${cell()?.column.getSize() ?? 0}px`,
      }}
    >
      {/* FlexRender renders nothing when the cell is momentarily undefined
          (its keyed <Match> sees a falsy `when`), so no guard is needed. */}
      <FlexRender cell={cell()!} />
    </td>
  )
}

export default App
