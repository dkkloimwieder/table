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

The Solid examples pair it with a small local `createVirtualizer` wrapper (copy `src/createVirtualizer.ts` from any of the three virtualized examples — the file is identical in all of them). The wrapper exposes the same `Virtualizer` instance API as solid-virtual's `createVirtualizer`, so everything below — and the option patterns in TanStack Virtual's own docs — applies unchanged. One behavioral difference: there is no store/reconcile layer, so each change hands fresh `VirtualItem` objects to `<For>`, which recreates the visible items' DOM — fine for plain cells, but rows with local state or expensive renderers may need keying or memoization. Once `@tanstack/solid-virtual` supports Solid 2, swapping the import back is the whole migration.

How the wrapper works, in brief:

- It creates a `virtual-core` `Virtualizer` and re-resolves the options object in the tracked half of a `createRenderEffect`, so live option getters (like a reactive `get count()`) re-subscribe automatically; the untracked effect half pushes the resolved options into the core and bumps the version signal.
- A single version signal is bumped by the core's `onChange` callback (and whenever the resolved options are re-pushed), and the two render-time reads — `getVirtualItems()` and `getTotalSize()` — subscribe to it through a `Proxy`, which is what makes scrolling reactive.
- The version signal is created with `{ ownedWrite: true }` because the render effect's first run executes synchronously inside the creating component's owned scope (a Solid 2 constraint — see [Writes during component setup](./solid-2#writes-during-component-setup)).
- `onSettled` mounts the core (`_didMount()`) once the DOM exists and returns its cleanup.

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
  estimateSize: () => 33,
  overscan: 5,
})

<tbody
  style={{
    height: `${rowVirtualizer.getTotalSize()}px`,
    position: 'relative',
  }}
>
  <For each={rowVirtualizer.getVirtualItems()}>
    {(virtualRow) => {
      const row = rows()[virtualRow.index]
      return (
        <tr
          style={{
            position: 'absolute',
            transform: `translateY(${virtualRow.start}px)`,
            width: '100%',
          }}
        >
          <For each={row.getVisibleCells()}>
            {(cell) => <td><table.FlexRender cell={cell} /></td>}
          </For>
        </tr>
      )
    }}
  </For>
</tbody>
```

### Virtualized Rows

The [virtualized rows examples](../examples/virtualized-rows) show how to render large row counts while keeping the DOM small. The examples are available for React, Solid, Svelte, Vue, Angular, and Lit.

The core idea is that sorting, filtering, grouping, and other row-model work still comes from TanStack Table. The virtualizer reads from the final table row model:

```tsx
const rows = () => table.getRowModel().rows
```

The row virtualizer is configured with a reactive `get count()` getter over `rows().length`, a row height estimate, the scroll container, and an overscan value. The `tbody` is given the full virtual height with `rowVirtualizer.getTotalSize()`, while each rendered row is absolutely positioned with `transform: translateY(...)`.

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

Column virtualization uses a different rendering strategy than row virtualization. Instead of absolutely positioning columns, the examples add fake spacer cells to the left and right:

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

Use `estimateSize` as the virtualizer's initial guess:

```tsx
estimateSize: () => 33
```

Then use `measureElement` to refine the actual row height after rendering:

```tsx
<tr
  data-index={virtualRow.index}
  ref={node => rowVirtualizer.measureElement(node)}
>
```

Set `data-index` on each row so the virtualizer can associate measurements with the correct item. In Solid, pass `measureElement` through a ref callback exactly as shown above; this is what the [Virtualized Rows example](../examples/virtualized-rows) does. The example also skips dynamic measurement in Firefox (passing `measureElement: undefined`) because Firefox measures table border heights differently.

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

Rows are absolutely positioned inside a relatively positioned `tbody`, and cells use flex sizing so they can match `column.getSize()` or `cell.column.getSize()`. This is intentional. Native table layout does not work well with dynamic-height virtual rows that are positioned independently.

### Performance Tips

- Keep virtualizers near the components that render the virtualized items.
- Avoid re-rendering the full table body on every scroll.
- Keep row, column, and data references stable where possible.
- Use `overscan` deliberately. More overscan reduces visible blanking, while less overscan reduces DOM nodes.
- Avoid expensive cell renderers in very large virtualized tables.
- Test production builds. Framework development builds can be slower than production builds; profile production bundles before optimizing.
- Prefer fixed row sizes when the UI allows it.
- For column virtualization, use `column.getSize()`, `header.getSize()`, and `cell.column.getSize()` consistently.
