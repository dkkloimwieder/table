---
title: Solid 2
---

The Solid adapter requires `solid-js` and `@solidjs/web` version `2.0.0-rc.13` or newer in the Solid 2 line. Use Node 22.12 or newer. Solid 1 applications must keep the earlier adapter.

Install matching versions of `solid-js` and `@solidjs/web`. Use `@solidjs/vite-plugin` version `3.0.0-next.47` with these runtime versions. Set `jsxImportSource` to `@solidjs/web` in your TypeScript configuration.

The [official Solid 2 cheatsheet](https://github.com/solidjs/solid/blob/next/packages/solid/CHEATSHEET.md) describes the runtime changes. The [migration guide](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/MIGRATION.md) provides more detail.

Create your table inside a Solid component or `createRoot`. Pass reactive data, columns, and controlled state through getters. Read table state in JSX, a memo, or the compute function of an effect.

```tsx
const [data, setData] = createSignal([{ name: 'Ada' }])
const table = createTable({
  features: tableFeatures({}),
  columns: [{ accessorKey: 'name' }],
  get data() {
    return data()
  },
})
```

Solid 2 applies signal writes in a microtask. If imperative code needs the committed value immediately, call `flush()` after the write. User interfaces normally wait for the automatic update.

```tsx
table.setPageSize(20)
flush()
console.log(table.atoms.pagination.get().pageSize)
```

Effects take separate compute and apply functions. The compute function reads reactive values. The apply function performs side effects and returns any cleanup function.

```tsx
createEffect(
  () => table.atoms.pagination.get().pageIndex,
  (pageIndex) => console.log(pageIndex),
)
```

The default `<For>` callback receives the item value and an index accessor. With `keyed={false}`, the callback receives an item accessor and a numeric index. Read accessors inside JSX or a reactive computation.

Use `<Context value={...}>` instead of `<Context.Provider>`. Import DOM functions and JSX types from `@solidjs/web`. Use `onSettled` with a returned cleanup function for component setup and disposal.

Solid bundlers select the package's `solid` export and compile its JSX for the target environment. Node selects the server build. The `import` export supplies compiled browser JavaScript.

The migrated examples exclude devtools. Their Store, Virtual, Pacer, and keyboard bindings use the corresponding core libraries. These example helpers do not provide compatibility for other Solid adapters.

The `with-tanstack-form` example retains its Solid 1 source and is excluded from the workspace.
Form integration is deferred and does not block Table qualification.

The [native entry](./native.md) reads a Solid store directly and requires no snapshot bridge.
The following guidance applies to the existing table-core adapter at the package root.

Solid Query 6 reconciles results into a stable store. The table-core adapter caches its row model by data array identity. Use Solid's `deep()` inside a memo to track nested changes and expose plain data. Solid preserves references where its snapshot machinery can reuse them. `snapshot()` alone does not subscribe to changes.

```tsx
import { createMemo, deep } from 'solid-js'

const rows = createMemo(() => deep(query.data?.rows) ?? [])
// Pass rows() through the table's data getter.
```
