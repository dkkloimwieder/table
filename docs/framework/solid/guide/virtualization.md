---
title: Virtualization (Solid) Guide
---

## Examples

Want to skip to the implementation? Check out these Solid examples:

- [Virtualized Columns](../examples/virtualized-columns)
- [Virtualized Rows](../examples/virtualized-rows)
- [Virtualized Infinite Scrolling](../examples/virtualized-infinite-scrolling)

Use getters for reactive inputs such as `data` when passing Solid signals to `createTable`.

### Virtualization Setup

Here's how you set up your table to use virtualization with TanStack Table. Virtualization is a rendering strategy, so TanStack Table does not need a feature or row model for it.

The Solid examples build on the framework-agnostic `@tanstack/virtual-core` through a small local `createVirtualizer` wrapper (see [Install TanStack Virtual](#install-tanstack-virtual) below — `@tanstack/solid-virtual` currently supports Solid 1 only). TanStack Table still owns rows, columns, and table state; the virtualizer owns scroll indexes and measurements.
Also see the [TanStack Virtual table example](https://tanstack.com/virtual/latest/docs/framework/react/examples/table) (a React example, but the virtualizer options translate directly to `createVirtualizer`).

## Virtualization (Solid) Guide

The TanStack Table packages do not come with any virtualization APIs or features built in. Virtualization is a rendering strategy, not a table feature. You can use TanStack Table with any virtualization library, but the official examples use TanStack Virtual.

TanStack Table and TanStack Virtual solve different parts of the problem:

- TanStack Table builds the row models, columns, headers, cells, sizing, sorting, filtering, and other table state.
- TanStack Virtual decides which item indexes should be rendered for the current scroll position.
- Your table renderer maps those virtual indexes back to rows, headers, and cells.

### When To Use Virtualization

Use virtualization when your table has a very large number of rows, columns, or both. Virtualization keeps the DOM small by only rendering the items that are visible in the scroll viewport plus a small overscan buffer.

Virtualization is not a replacement for server-side pagination, filtering, or sorting. If the data is virtualized on the client, the data still needs to exist on the client. If your dataset is too large to load into the browser, use server-side data operations or infinite scrolling.

For small tables, normal rendering is simpler and usually preferable.

### Install TanStack Virtual

`@tanstack/solid-virtual` currently supports Solid 1 only, while the v9 table adapter targets Solid 2 (see the [Solid 2 Upgrade](./solid-2) guide). Until solid-virtual ships a Solid 2 release, install the framework-agnostic virtualizer core instead:

```sh
npm install @tanstack/virtual-core
```

The Solid examples pair it with a small local `createVirtualizer` wrapper (copy `src/createVirtualizer.ts` from any of the three virtualized examples — the file is identical in all of them). The wrapper exposes the same `Virtualizer` instance API as solid-virtual's `createVirtualizer`, so everything below — and the option patterns in TanStack Virtual's own docs — applies unchanged. Once `@tanstack/solid-virtual` supports Solid 2, swapping the import back is the whole migration.

How the wrapper works, in brief:

- It creates a `virtual-core` `Virtualizer` and re-resolves the options object in the tracked half of a `createRenderEffect`, so live option getters (like a reactive `get count()`) re-subscribe automatically; the untracked effect half pushes the resolved options into the core and bumps the version signal.
- Virtual items go through a store and `reconcile(items, 'index')` — the same shape solid-virtual uses. This matters: `virtual-core` returns a brand-new array of brand-new `VirtualItem` objects on every recompute, so handing that raw array to a keyed renderer disposes and rebuilds every visible row on every scroll update. Reconciling on `index` lets rows that stay in the window keep their identity and their DOM nodes. Note that `reconcile` takes its key positionally and defaults to `"id"`; `VirtualItem` has no `id`, so passing `'index'` explicitly is required or it silently degrades to positional matching.
- A version signal is bumped by the core's `onChange` callback (and whenever the resolved options are re-pushed). `getTotalSize()` rides that signal and `getVirtualItems()` returns the store, both through a `Proxy`, which is what makes scrolling reactive.
- The version signal is created with `{ ownedWrite: true }` because the render effect's first run executes synchronously inside the creating component's owned scope (a Solid 2 constraint — see [Writes during component setup](./solid-2#writes-during-component-setup)).
- `onSettled` mounts the core (`_didMount()`) once the DOM exists and returns its cleanup.
- Because items are store proxies, reading a `VirtualItem` outside a tracking scope (in a `ref` callback, say) needs `untrack` or Solid 2 logs `STRICT_READ_UNTRACKED`.

TanStack Table still owns rows, columns, headers, cells, sizing, sorting, filtering, and other table state; TanStack Virtual decides which item indexes should render for the current scroll position.

The table itself is set up like any other v9 table. Declare your features with `tableFeatures()` and create the table with `createTable`; nothing about virtualization changes the table setup.

```tsx
import {
  columnSizingFeature,
  rowSortingFeature,
  createSortedRowModel,
  sortFns,
  tableFeatures,
  createTable,
} from '@tanstack/solid-table'
// the local wrapper over @tanstack/virtual-core described above
import { createVirtualizer } from './createVirtualizer'

const features = tableFeatures({
  columnSizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

const table = createTable({
  features,
  columns,
  get data() {
    return data()
  },
})
```

### The Basic Pattern

Most virtualized table implementations follow the same pattern:

1. Create a fixed-height scroll container.
2. Pass the scroll element to the virtualizer.
3. Use `table.getRowModel().rows` or `table.getVisibleLeafColumns()` as the source list.
4. Configure `count`, `estimateSize`, `overscan`, and optional `measureElement`.
5. Render only virtual items.
6. Use virtual offsets or spacer padding to preserve the full scroll geometry.

Here is a compact row virtualization example:

In Solid, define `rows` as a thunk and pass `count` through a `get count()` getter so the virtualizer tracks row-model changes (data refresh, filtering, expansion); a plain `count: rows.length` would be a one-time snapshot.

```tsx
const rows = () => table.getRowModel().rows

let tableContainerRef: HTMLDivElement | undefined

const rowVirtualizer = createVirtualizer({
  get count() {
    return rows().length
  },
  getScrollElement: () => tableContainerRef ?? null,
  // Measure this against your own rendering rather than copying a number —
  // see Dynamic Row Heights below for why an inaccurate estimate is costly.
  estimateSize: () => 32,
  overscan: 5,
})

<table
  style={{
    display: 'grid',
    // The scroll range lives on the table, because <tbody> is the element
    // that gets translated.
    height: `${rowVirtualizer.getTotalSize()}px`,
    // Grid's default align-content stretches auto-sized tracks to fill the
    // container, which on a very tall table would spread <thead> and <tbody>
    // over half of it each.
    'align-content': 'start',
  }}
>
  <thead style={{ display: 'grid', position: 'sticky', top: '0px' }}>
    {/* header groups render normally */}
  </thead>
  <tbody
    style={{
      display: 'grid',
      // ONE transform for the whole window, not one per row.
      transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
    }}
  >
    <Repeat count={rowVirtualizer.getVirtualItems().length}>
      {(slot) => (
        <TableBodyRow
          virtualRow={() => rowVirtualizer.getVirtualItems()[slot]}
          rows={rows}
        />
      )}
    </Repeat>
  </tbody>
</table>
```

Two choices there are load-bearing, and both are covered under [Performance Tips](#performance-tips):

`<Repeat>` (from `solid-js`), not `<For>`. A virtual window holds a near-constant number of rows — scrolling changes which data they show, not how many there are. `<For>` keys by item identity, so a scroll reads as "N items left, N arrived" and it tears down and rebuilds every row component and every cell inside it. `<Repeat>` keeps one component per slot for as long as the count holds, so scrolling updates content in place. That is why each row takes accessors (`virtualRow`, `rows`) instead of resolved values: the slot re-points at different data without being rebuilt.

One transform on `<tbody>`, not one per row. Rows stay in normal flow; only the window offset moves.

Each row component resolves its own row and cells through memos, so the walk from cell to row to row model runs once per row rather than once per cell:

```tsx
function TableBodyRow(props: {
  virtualRow: () => VirtualItem | undefined
  rows: () => Array<Row<typeof features, Person>>
}) {
  const virtualRow = createMemo(() => props.virtualRow())
  const row = createMemo(() => props.rows()[virtualRow()?.index ?? -1])
  const cells = createMemo(() => row()?.getAllCells() ?? [])

  return (
    <tr style={{ display: 'flex', width: '100%' }}>
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
```

### Virtualized Rows

The [virtualized rows examples](../examples/virtualized-rows) show how to render large row counts while keeping the DOM small. The examples are available for React, Solid, Svelte, Vue, Angular, and Lit.

The core idea is that sorting, filtering, grouping, and other row-model work still comes from TanStack Table. The virtualizer reads from the final table row model:

```tsx
const rows = () => table.getRowModel().rows
```

The row virtualizer is configured with a reactive `get count()` getter over `rows().length`, a row height estimate, the scroll container, and an overscan value. The `table` element carries the full virtual height from `rowVirtualizer.getTotalSize()`, and the `tbody` carries a single `transform: translateY(...)` taken from the first virtual item's `start`. Rows themselves are in normal flow with no per-row positioning.

The examples render cells from the current row with APIs like `row.getVisibleCells()` or `row.getAllCells()`, depending on whether the example needs visibility-aware cells or all cells.

The official examples use large generated datasets, commonly tens or hundreds of thousands of rows. They also support dynamic row heights by using `measureElement` when possible. The examples skip dynamic row measurement in Firefox because Firefox can measure table border height differently.

### Virtualized Columns

The [virtualized columns examples](../examples/virtualized-columns) show how to render large row and column counts. The examples are available for React, Solid, Svelte, Vue, Angular, and Lit.

Column virtualization uses the current visible column list, again as a thunk so the count stays reactive:

```tsx
const visibleColumns = () => table.getVisibleLeafColumns()
```

The column virtualizer is configured for horizontal virtualization:

```tsx
const columnVirtualizer = createVirtualizer({
  get count() {
    return visibleColumns().length
  },
  estimateSize: (index) => visibleColumns()[index].getSize(),
  getScrollElement: () => tableContainerRef ?? null,
  horizontal: true,
  overscan: 3,
})
```

Column virtualization uses a different rendering strategy than row virtualization. Rather than offsetting the rendered columns, the examples add fake spacer cells to the left and right:

```tsx
const virtualPaddingLeft = () => {
  const vcs = columnVirtualizer.getVirtualItems()
  return vcs.length ? (vcs[0]?.start ?? 0) : undefined
}

const virtualPaddingRight = () => {
  const vcs = columnVirtualizer.getVirtualItems()
  if (!vcs.length) return undefined
  return columnVirtualizer.getTotalSize() - (vcs[vcs.length - 1]?.end ?? 0)
}
```

The paddings are thunks so the reads stay reactive (a component-body `getVirtualItems()` call would be a one-time snapshot), and they return `undefined` when there are no virtual columns so the renderer can skip the spacer cells entirely. Those spacer cells preserve the horizontal scroll width while the renderer only mounts the virtual columns. This approach keeps row rendering table-like and allows dynamic row height measurement to keep working.

### Virtualized Rows And Columns Together

The official virtualized columns examples also virtualize rows. In those examples:

- The row virtualizer controls vertical positioning and total body height.
- The column virtualizer controls horizontal header/cell rendering and left/right spacer cells.
- `virtualRow.index` maps to `rows[virtualRow.index]`.
- `virtualColumn.index` maps to `visibleCells[virtualColumn.index]`.

Always use virtual indexes against the same current row and column lists returned by the table. If sorting, filtering, pagination, grouping, or column visibility changes, recompute the virtualized rows and columns from the current table state.

### Virtualized Infinite Scrolling

The [virtualized infinite scrolling examples](../examples/virtualized-infinite-scrolling) combine row virtualization with progressive data fetching. The examples are available for React, Solid, Svelte, Vue, Angular, and Lit.

The common pattern is:

1. Fetch a page of rows.
2. Flatten fetched pages into the table `data`.
3. Use row virtualization over the loaded rows.
4. Listen to scroll events on the table container.
5. Fetch the next page when the user scrolls near the bottom.

The Solid infinite scrolling pattern can use TanStack Query or any other data-fetching layer.

```tsx
const { scrollHeight, scrollTop, clientHeight } = scrollElement

if (scrollHeight - scrollTop - clientHeight < 500) {
  fetchNextPage()
}
```

If sorting is handled by the server, use manual sorting so the fetched data reflects the whole backend dataset rather than only the currently loaded rows (the Solid example does this with `manualSorting: true` and a sorting atom). When sorting changes and the fetched dataset is replaced, you can scroll back to the top with `rowVirtualizer.scrollToIndex(0)` — a pattern the React infinite-scrolling example implements.

### Dynamic Row Heights

Dynamic row heights are useful when content can wrap or expand. They are also more complex than fixed-height rows.

`estimateSize` is the virtualizer's initial guess, and its accuracy is load-bearing at large row counts — this is worth more attention than it looks:

```tsx
estimateSize: () => 32
```

`virtual-core` rebuilds its measurement array from the first row whose measured size differs from its cached or estimated size, all the way to `count`. A 1px error on a 200,000-row table therefore costs a ~170,000-iteration rebuild for _every_ row scrolled into view. Profiling the Solid example with a 33px estimate against rows that actually rendered at 32px put 70% of all script time in `getMeasurements`; correcting the single digit removed it.

So measure the value, do not copy one. The right number depends on your font rendering, so read it from the page you are actually shipping:

```js
document.querySelector('tbody tr').getBoundingClientRect().height
```

Then use `measureElement` to refine the real row height after rendering. A slot-based renderer needs this in an effect rather than on the ref, because a slot outlives any single row:

```tsx
let el: HTMLTableRowElement | undefined

createEffect(
  () => virtualRow()?.index,
  (index) => {
    if (el === undefined || index === undefined) return
    el.setAttribute('data-index', String(index))
    rowVirtualizer.measureElement(el)
  },
)

<tr ref={el} style={{ display: 'flex', width: '100%' }}>
```

Two things there are easy to get wrong. The ref fires once per slot, but a slot changes index on every scroll, so measurement cannot ride on ref creation. And `data-index` must be set _before_ `measureElement` runs: the virtualizer reads that attribute to identify the row and silently skips the measurement when it is absent. Writing it as a dynamic JSX attribute does not work — Solid compiles `data-index={...}` into an effect that runs _after_ the ref, so the virtualizer sees a node with no index, warns, and never measures. That warning is not dev-gated, so it ships to production.

The [Virtualized Rows example](../examples/virtualized-rows) also skips dynamic measurement in Firefox (passing `measureElement: undefined`) because Firefox measures table border heights differently.

Overscan helps avoid blank regions while measurements settle. If every row has a known fixed height, skip dynamic measurement and use the fixed height estimate instead.

### Sticky Headers And Semantic Table Markup

The examples still use semantic table tags, but they change table layout CSS to support virtual positioning and sticky headers.

Dynamic row virtualization commonly requires:

```css
table {
  display: grid;
}

thead {
  display: grid;
  position: sticky;
  top: 0;
}

tr {
  display: flex;
}

th,
td {
  box-sizing: border-box;
}
```

The `box-sizing` rule is not cosmetic. Once cells are laid out with flexbox, the width you set from `column.getSize()` lands on the element directly, and under the default `content-box` any padding and borders are added on top of it. Header and body cells rarely carry identical padding — a `th` with `padding: 2px 4px` and a `1px` right border renders 9px wider than its column while a `td` with `padding: 6px` renders 12px wider — so each column shifts its neighbour a little further and header labels drift off the data they label. `border-box` makes the declared width the rendered width for both.

Cells use flex sizing so they can match `column.getSize()` or `cell.column.getSize()`. This is intentional: native table layout does not work well with dynamic-height virtual rows. The scroll range goes on the `table` element and the window offset on the `tbody`, so rows themselves need no positioning at all — see [Performance Tips](#performance-tips) for why that is not just a stylistic choice.

### Performance Tips

Two of these came out of profiling the Solid examples and are worth more than the rest combined, because each one was individually responsible for most of the cost of a scroll.

**Translate the window once, never one transform per row.** Chrome restyles an element _and its immediate children_ whenever its style changes, so the elements restyled per update are `writes × (1 + immediate child count)`. Moving 36 rows that hold 9 cells each restyles 36 × 10 = 360 elements; moving their shared parent restyles 1 + 36 = 37. Measured on the virtualized-rows example, that difference was 1,262 ms of style recalculation over a scripted scroll versus 27 ms. Reaching for layer promotion instead is the wrong instinct and measured _worse_ — `will-change: transform` cost 30% more and `contain: layout` 16% more, because the cost is child restyling, not compositing.

**Keep `estimateSize` accurate.** See [Dynamic Row Heights](#dynamic-row-heights): an estimate that is 1px off costs an O(count) measurement rebuild for every row scrolled into view.

The rest:

- Keep virtualizers near the components that render the virtualized items.
- Render slots, not items. `<Repeat count={...}>` over a near-constant window keeps one component per slot and updates it in place; `<For>` keys by identity and rebuilds the whole window on every scroll.
- Memoize the row and cell chain once per row. Reading `row.getAllCells()` from a bare accessor inside each cell re-walks cells → row → row model once per _cell_, and those reads land outside a tracking scope.
- Keep row, column, and data references stable where possible.
- Use `overscan` deliberately. More overscan reduces visible blanking, while less overscan reduces DOM nodes.
- Avoid expensive cell renderers in very large virtualized tables.
- Test production builds. Framework development builds can be slower than production builds; profile production bundles before optimizing. In particular, Solid's `STRICT_READ_UNTRACKED` diagnostic exists only in the dev build and can dominate a dev-mode scroll profile.
- Prefer fixed row sizes when the UI allows it.
- For column virtualization, use `column.getSize()`, `header.getSize()`, and `cell.column.getSize()` consistently.
- Measure with a scripted gesture, not by hand. Identical start offset, frame count and per-frame delta, several runs, compare medians — hand-performed scrolls of different speed and distance are not comparable, and neither are runs taken while other dev servers are competing for the machine.
