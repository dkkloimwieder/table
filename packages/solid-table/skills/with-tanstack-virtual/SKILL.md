---
name: with-tanstack-virtual
description: >
  Virtualize Solid Table row/column models and infinite Query data with createVirtualizer, reactive counts, scroll targets, stable keys, dynamic measurement, transforms, sticky regions, and grid/flex sizing. Load for Solid tracking or layout bugs.
metadata:
  {
    type: composition,
    library: '@tanstack/solid-table',
    library_version: '9.0.0-beta.65',
    framework: solid,
  }
requires: ['@tanstack/table-core#core', getting-started, table-state]
sources:
  - 'TanStack/table:docs/framework/solid/guide/virtualization.md'
  - 'TanStack/table:examples/solid/virtualized-rows'
  - 'TanStack/table:examples/solid/virtualized-columns'
  - 'TanStack/table:examples/solid/virtualized-infinite-scrolling'
---

This skill builds on `@tanstack/table-core#core`, `getting-started`, and `table-state`. Virtualize the final Table model in the renderer; Virtual is not a Table feature.

`@tanstack/solid-virtual` is Solid-1-only; under Solid 2 install `@tanstack/virtual-core` and copy the local `createVirtualizer` wrapper from `src/createVirtualizer.ts` in any of the three virtualized Solid examples (byte-identical in all three). The wrapper exposes the same `Virtualizer` API and reconciles virtual items on `index` exactly as solid-virtual does, so every pattern below is unchanged. Swap the import back once solid-virtual ships Solid 2 support.

## Setup

```tsx
import { createVirtualizer } from './createVirtualizer' // local wrapper over @tanstack/virtual-core

let scrollElement: HTMLDivElement | undefined
const rows = () => table.getRowModel().rows
const virtualizer = createVirtualizer({
  get count() {
    return rows().length
  },
  getScrollElement: () => scrollElement ?? null,
  estimateSize: () => 32, // measure your own rows; see the estimate mistake below
  getItemKey: (index) => rows()[index].id, // optional
  overscan: 5,
})
```

## Core Patterns

### Keep count reactive

```tsx
const virtualizer = createVirtualizer({
  get count() {
    return rows().length
  },
  getScrollElement,
  estimateSize,
})
```

### Apply measurement and geometry together

Geometry belongs to the window, not the row: the scroll range goes on `table`, one transform on `tbody`, and rows flow normally.

```tsx
<table
  style={{
    display: 'grid',
    height: `${virtualizer.getTotalSize()}px`,
    'align-content': 'start',
  }}
>
  <tbody
    style={{
      display: 'grid',
      transform: `translateY(${virtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
    }}
  >
    <Repeat count={virtualizer.getVirtualItems().length}>
      {(slot) => (
        <TableBodyRow virtualRow={() => virtualizer.getVirtualItems()[slot]} />
      )}
    </Repeat>
  </tbody>
</table>
```

Measurement rides an effect keyed on the index, because a slot outlives any single row, and `data-index` must exist before `measureElement` reads it:

```tsx
let el: HTMLTableRowElement | undefined

createEffect(
  () => virtualRow()?.index,
  (index) => {
    if (el === undefined || index === undefined) return
    el.setAttribute('data-index', String(index))
    virtualizer.measureElement(el)
  },
)
```

## Common Mistakes

### HIGH Snapshotting row count

Wrong:

```tsx
createVirtualizer({ count: rows().length, getScrollElement, estimateSize })
```

Correct:

```tsx
createVirtualizer({
  get count() {
    return rows().length
  },
  getScrollElement,
  estimateSize,
})
```

The getter lets the wrapper's render effect re-resolve options and push the new count into the core.

Source: `examples/solid/virtualized-rows`

### HIGH Virtualizing raw data

Wrong:

```tsx
const rows = () => data()
```

Correct:

```tsx
const rows = () => table.getRowModel().rows
```

Raw data excludes Table's current sorting, filtering, grouping, expansion, and pagination.

Source: `docs/framework/solid/guide/virtualization.md`

### HIGH Separating ref lifecycle from virtualizer

Wrong:

```tsx
const scrollElement = document.querySelector('#rows')
const virtualizer = createVirtualizer({
  getScrollElement: () => scrollElement,
  count: 100,
  estimateSize,
})
```

Correct:

```tsx
let scrollElement: HTMLDivElement | undefined
const virtualizer = createVirtualizer({
  getScrollElement: () => scrollElement ?? null,
  get count() {
    return rows().length
  },
  estimateSize,
})
```

Keep the ref and virtualizer in the same owner so observers attach after JSX assigns the element.

Source: `examples/solid/virtualized-rows`

### HIGH Omitting renderer geometry

Wrong:

```tsx
<For each={virtualizer.getVirtualItems()}>
  {(item) => <tr>{rows()[item.index].id}</tr>}
</For>
```

Correct:

```tsx
<table
  style={{
    display: 'grid',
    height: `${virtualizer.getTotalSize()}px`,
    'align-content': 'start',
  }}
>
  <tbody
    style={{
      display: 'grid',
      transform: `translateY(${virtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
    }}
  >
    <Repeat count={virtualizer.getVirtualItems().length}>
      {(slot) => (
        <tr>{rows()[virtualizer.getVirtualItems()[slot].index].id}</tr>
      )}
    </Repeat>
  </tbody>
</table>
```

Virtual computes positions; the renderer must apply the scroll range, the window transform, widths, and sticky CSS.

Source: `examples/solid/virtualized-rows`

### HIGH Transforming every row instead of the window

Wrong:

```tsx
<tbody
  style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
>
  <For each={virtualizer.getVirtualItems()}>
    {(item) => (
      <tr
        style={{
          position: 'absolute',
          transform: `translateY(${item.start}px)`,
        }}
      >
        {rows()[item.index].id}
      </tr>
    )}
  </For>
</tbody>
```

Correct:

```tsx
<tbody
  style={{
    display: 'grid',
    transform: `translateY(${virtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
  }}
>
  <Repeat count={virtualizer.getVirtualItems().length}>
    {(slot) => (
      <TableBodyRow virtualRow={() => virtualizer.getVirtualItems()[slot]} />
    )}
  </Repeat>
</tbody>
```

Chrome restyles an element and its immediate children on any style change, so moving N rows holding C cells restyles N × (1 + C) elements while moving their parent restyles 1 + N. Measured on this example: 1,262 ms of style recalculation over a scripted scroll versus 27 ms. `will-change: transform` and `contain: layout` both measured worse — the cost is child restyling, not compositing.

Source: `examples/solid/virtualized-rows`

### HIGH Copying an estimateSize instead of measuring it

Wrong:

```tsx
createVirtualizer({
  get count() {
    return rows().length
  },
  getScrollElement,
  estimateSize: () => 33,
})
```

Correct:

```tsx
// document.querySelector('tbody tr').getBoundingClientRect().height === 32
createVirtualizer({
  get count() {
    return rows().length
  },
  getScrollElement,
  estimateSize: () => 32,
})
```

`virtual-core` rebuilds its measurement array from the first row whose measured size differs from the estimate all the way to `count`, so a 1px error on 200k rows costs a ~170,000-iteration rebuild per row scrolled into view — measured at 70% of all script time. The correct value depends on font rendering, so read it from the rendered page.

Source: `examples/solid/virtualized-rows`

### HIGH Setting data-index as a dynamic JSX attribute

Wrong:

```tsx
<tr
  data-index={virtualRow().index}
  ref={(node) => virtualizer.measureElement(node)}
/>
```

Correct:

```tsx
createEffect(
  () => virtualRow()?.index,
  (index) => {
    if (el === undefined || index === undefined) return
    el.setAttribute('data-index', String(index))
    virtualizer.measureElement(el)
  },
)
```

Solid compiles a dynamic attribute into an effect that runs _after_ the ref, so `measureElement` sees a node with no `data-index`, warns, and skips the measurement — dynamic row heights then never work. The warning is not dev-gated, so it ships to production. A slot also outlives any single row, so measurement must re-run when the index changes rather than on ref creation.

Source: `examples/solid/virtualized-rows`

## API Discovery

Inspect `node_modules/@tanstack/solid-table/dist/index.d.ts` and installed `node_modules/@tanstack/virtual-core/dist/` (plus the local `createVirtualizer.ts` wrapper); use the maintained row, column, or infinite example for the matching CSS geometry contract.
