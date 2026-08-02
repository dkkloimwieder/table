---
title: Solid 2 Upgrade (Solid) Guide
---

TanStack Table v9's Solid adapter targets **Solid 2**. Its peer dependencies are `solid-js` and `@solidjs/web`, both at `>=2.0.0-beta.29 <3.0.0`, so upgrading to the v9 adapter means upgrading your app to Solid 2 alongside it.

This guide covers the app-side upgrade steps, the adapter's new timing contract, and the current compatibility status of companion TanStack libraries. For the v8 → v9 table API changes themselves (entrypoint rename, the `features` option, and so on), see the [Migrating to V9](./migrating) guide — the two migrations are independent concerns.

## Staying on Solid 1

If you cannot upgrade to Solid 2 yet, install the last Solid-1 adapter release from the `solid1` dist-tag:

```bash
npm install @tanstack/solid-table@solid1
```

The `solid1` line receives no new features; it exists as an escape hatch while you migrate.

## Upgrade Steps

These are the changes the migration of this repo's 35 Solid examples actually required, plus the removed APIs you are most likely to hit even though the examples happened not to use them (`batch`, `createComputed`, `mergeProps`). It is not an exhaustive Solid 2 changelog — consult Solid's own release notes for changes outside the table-adapter surface.

### Dependencies and toolchain

```json
{
  "dependencies": {
    "solid-js": "2.0.0-beta.29",
    "@solidjs/web": "2.0.0-beta.29"
  },
  "devDependencies": {
    "vite-plugin-solid": "3.0.0-next.21"
  }
}
```

Solid 2 splits the DOM renderer into its own package: `solid-js/web` becomes `@solidjs/web`, and JSX types come from there too. Update every import and your `tsconfig.json`:

```tsx
// Solid 1
import { render } from 'solid-js/web'

// Solid 2
import { render } from '@solidjs/web'
```

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@solidjs/web"
  }
}
```

The `solid-js/store` entrypoint is also gone in Solid 2.

### Removed APIs and their replacements

| Solid 1                    | Solid 2                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `batch(fn)`                | Removed — every write auto-batches to a microtask; `flush()` settles synchronously                                                              |
| `createComputed(fn)`       | Removed — use a two-arg `createEffect(compute, effectFn)`, or a writable memo (`createSignal(fn)`) when the goal was pushing into derived state |
| One-arg `createEffect(fn)` | Two-arg `createEffect(compute, effectFn)`                                                                                                       |
| `on(deps, fn, { defer })`  | Removed — deps go in the compute half; pass `{ defer: true }` as the third argument                                                             |
| `onMount(fn)`              | `onSettled(fn)` — `fn` may return a cleanup function                                                                                            |
| `splitProps(props, keys)`  | `omit(props, ...keys)` (variadic keys, returns the rest)                                                                                        |
| `mergeProps(...sources)`   | `merge(...sources)` — **`undefined` values now override**; drop keys instead of passing `undefined`                                             |

The two-arg effect form separates tracking from side effects: the first function is the tracked compute, the second receives its result and runs untracked after the queue flushes.

```tsx
// Solid 1
createEffect(() => {
  ref.indeterminate = !props.checked && props.indeterminate
})

// Solid 2
createEffect(
  () => ({ indeterminate: props.indeterminate, checked: props.checked }),
  ({ indeterminate, checked }) => {
    ref.indeterminate = !checked && indeterminate
  },
)
```

Where you used `on(deps, fn, { defer: true })` to skip the first run, pass `{ defer: true }` as the third argument instead — the effect half then only fires on the next change, not on mount.

The effect half must return either `undefined` or a **cleanup function**. Returning anything else is an error that halts reactivity — so a single-expression arrow body that happens to return a value (a timer id, an assignment result) needs braces.

### JSX attribute casing

`@solidjs/web`'s JSX types only accept the lowercase DOM attribute names `colspan` and `rowspan`. The `colSpan` **property** on table-core's `Header` instances is unchanged — only the JSX attribute renames:

```tsx
// Solid 1
<th colSpan={header.colSpan}>

// Solid 2
<th colspan={header.colSpan}>
```

### Writes during component setup

Solid 2's dev runtime throws `REACTIVE_WRITE_IN_OWNED_SCOPE` when a plain signal is written inside an owned scope — a component body, a `createRoot` callback, or a render effect's synchronous initial run. Signals that are _intentionally_ written from such scopes must opt in with `ownedWrite`:

```tsx
const [version, setVersion] = createSignal(0, { ownedWrite: true })
```

All of the adapter's own writable atoms (including those from [`createAtom`](#createatom-external-state-atoms)) already set this — you only need it for your own signals. Plain writes are legal in event handlers and in effect halves; neither is an owned scope. For write-_then-read_ sequences, use an event handler: inside an effect half the queue is already mid-drain, so a read after a write still returns the committed value.

## The Adapter's Timing Contract

Solid 2 defers every write to a microtask, and the adapter leans into that instead of fighting it:

- **Reactive reads need nothing.** Inside JSX, memos, and effect computes, table state reads (`table.getRowModel()`, `atom.get()`, `table.options`) are tracked like ordinary Solid reads. Your UI updates when the queue settles — one render per batch of writes, however many state changes it contained.
- **Imperative reads settle first.** When you read table state _outside_ any reactive scope — an event handler, a test, module-level code — the adapter calls `flush()` before reading, so you get read-your-writes:

```tsx
const onClick = () => {
  table.setPageSize(50)
  console.log(table.atoms.pagination.get().pageSize) // 50 — already settled
}
```

- **The precise rule: the adapter flushes only when the read happens with no tracking observer AND no owner.** The common case of a suppressed flush is component setup: while a component (or `createRoot`) is being constructed, imperative reads do _not_ flush — draining the queue there would run pending effects inside the mounting component's scope. The same applies to any other owned scope, such as an `onSettled` callback or code re-entered through `runWithOwner`. Reads in those scopes return the last committed value; writes made there become visible after the current microtask. Don't rely on write-then-read inside component bodies.
- **`flush()` is available** from `solid-js` when you need to settle explicitly (typically in tests). Never call it from inside `onSettled` or a `createTrackedEffect` callback — the queue is mid-drain there and `flush()` throws. From an ordinary effect callback it does not throw, but it is a silent no-op, so it cannot be used to settle reads there either.

There is no `batch()` anymore and the adapter needs no replacement for it: consecutive writes coalesce automatically, and table-core's internal multi-atom updates commit atomically at the next settle.

## `createAtom` (External State Atoms)

The adapter exports `createAtom` for external table state. It is a Solid signal carrying the TanStack Store `Atom` contract, so it plugs directly into table options that accept atoms — no separate store library needed:

```tsx
import { createAtom, createTable } from '@tanstack/solid-table'
import type { SortingState } from '@tanstack/solid-table'

const sortingAtom = createAtom<SortingState>([])

const table = createTable({
  features,
  columns,
  get data() {
    return data()
  },
  atoms: {
    sorting: sortingAtom,
  },
})

// tracked in JSX / reactive scopes:
const sorting = () => sortingAtom.get()
```

`createAtom(initialValue, options?)` accepts an optional `compare` equality function and a `name` for dev tooling. See the [Table State](./table-state) guide for the full external-state story.

## Server-Side Rendering

The adapter server-renders under Solid 2. A full table — headers, `FlexRender` cells, and footers — renders to HTML through `@solidjs/web`'s server build, both with the adapter bundled by Vite and with it externalized so Node loads the published `dist` and resolves `@solidjs/web` itself. Both paths produce identical markup, hydration markers included. (Hydrating that markup in a browser is the one part of the path not exercised end to end.)

What does not exist yet is a Solid 2 SSR meta-framework. `@solidjs/start` is Solid 1 only — every published version through `2.0.0-rc.9` depends on `solid-js@^1.9.14` and `vite-plugin-solid@^2.11.13` — so SSR under Solid 2 currently means a hand-rolled Vite app.

### Your app must enable SSR codegen

`vite-plugin-solid` compiles for the DOM by default. In an SSR build that means **your own** components emit `template()` calls, which throw `Client-only API called on the server side` at module scope, before any table code runs. It reads like a crash inside the library; it is not one. Turn on the plugin's `ssr` option:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  // `ssr: true` enables the SSR transforms and leaves the entries and the
  // server to you. The object form — even empty, `ssr: {}` — additionally
  // gives a plain Vite app turnkey streaming SSR.
  plugins: [solid({ ssr: true })],
  build: { ssr: true },
})
```

```tsx
// src/entry-server.tsx
import { renderToString } from '@solidjs/web'
import { App } from './App'

const html = renderToString(() => <App />)
```

That option governs how _your_ source is compiled. The plugin only transforms `.jsx`/`.tsx`, so a precompiled dependency's codegen never varies per environment; the adapter is safe on the server because it renders only components and control flow, never DOM elements of its own.

### The server runtime is write-once

A server render has no update cycle, and Solid 2's server build reflects that: `flush()` is a no-op, `createMemo` computes once and never invalidates, and the function form of `createSignal` returns a setter that does nothing. This is upstream Solid behaviour rather than something the adapter adds — a bare `createMemo` behaves the same way there.

So supply server-rendered table state at construction time:

| Supplying state                                          | Server render           |
| -------------------------------------------------------- | ----------------------- |
| `initialState`                                           | Applied                 |
| Controlled `state` getters                               | Applied                 |
| `data` getters                                           | Applied                 |
| `createAtom` initial values                              | Applied                 |
| `table.setColumnOrder(...)` and other imperative setters | No effect on the output |
| `atom.set(...)` after construction                       | No effect on the output |

The `on[State]Change` handlers still fire for those imperative writes, so a change handler that logs or forwards state is not evidence that the render saw it. Interactivity resumes on the client after hydration, where the [timing contract](#the-adapters-timing-contract) applies in full. On the server that contract is vacuous: `flush()` does nothing there, so settle-on-read has nothing to settle.

## Companion Library Compatibility

Solid 2 support across the TanStack ecosystem is still rolling out. Status at the time of writing:

| Package                                                       | Solid 2 status             | What to do                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@tanstack/solid-query`                                       | ✅ Ready (`6.0.0-beta.6+`) | Works as-is                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@tanstack/solid-router`                                      | ✅ Ready (`2.0.0-beta.29`) | Works, but keep a single `@solidjs/web` copy: the router declares `@solidjs/web` as a peer _and_ pins it as a regular dependency (`2.0.0-beta.29`), so an app on any other `@solidjs/web` version resolves a second copy — two template caches and two event-delegation roots. Add a package-manager override (pnpm `overrides` / npm `overrides` / yarn `resolutions`) pointing at your app's version; keep it even when the pinned version already matches, as a guard against drift |
| `@tanstack/solid-virtual`                                     | ❌ Solid 1 only            | Use `@tanstack/virtual-core` with a small local wrapper — see the [Virtualization](./virtualization) guide                                                                                                                                                                                                                                                                                                                                                                             |
| `@tanstack/solid-pacer`                                       | ❌ Solid 1 only            | Use the framework-agnostic `@tanstack/pacer` classes (`Debouncer`, etc.) directly                                                                                                                                                                                                                                                                                                                                                                                                      |
| `@tanstack/solid-store`                                       | ❌ Solid 1 only            | Use the adapter's own [`createAtom`](#createatom-external-state-atoms)                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `@tanstack/solid-form`                                        | ❌ Solid 1 only            | No replacement yet — the `with-tanstack-form` example is parked until solid-form ships Solid 2 support                                                                                                                                                                                                                                                                                                                                                                                 |
| `@tanstack/solid-hotkeys`                                     | ❌ Solid 1 only            | Plain `keydown` handlers                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@tanstack/solid-devtools` / `@tanstack/solid-table-devtools` | ❌ Solid 1 only            | See below                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Devtools

The TanStack Devtools stack (the devtools shell and the table devtools panel) currently supports Solid 1 only, and its packages resolve the host app's `solid-js` copy — they cannot load inside a Solid 2 app. Nesting a private Solid 1 copy under the devtools packages (an "island") was investigated and does not work: it fails at the package-manager, bundler, and runtime layers, because the devtools packages peer-depend on the app's Solid and import the old `solid-js/web` entrypoint that no longer exists in a Solid 2 dependency graph.

Until the devtools packages ship Solid 2 support:

- Devtools wiring has been removed from the Solid examples.
- The `key` table option (which names your table instance for devtools) is harmless to keep — leave it in place so devtools light back up when support returns.

## Feature Support

Everything else is unchanged: all table-core features, the `createTable` / `createTableHook` APIs, `FlexRender`, and the column helper work identically under Solid 2. The adapter's unit suite and all 35 Solid examples (including their Playwright e2e suites) run against Solid 2.
