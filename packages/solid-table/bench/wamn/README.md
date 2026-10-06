# WAMN integration fixture

This browser fixture connects WAMN's actual runtime and generated Widget bindings to the native Solid 2 table.
It uses one Solid record store and vertical virtualization.
It tests the Table integration boundary with plain controls.
Production WAMN grid and Form adoption are deferred in Beads phase 5 and do not block Table qualification.
Focused component vendoring remains a later assessment after Table is stable.

## Inputs

`prepare.mjs` reads a WAMN checkout without changing it.
It compiles `emit.rs` in a temporary Cargo project with WAMN's pinned Rust version and cached dependencies.
The helper uses WAMN's existing platform fixture, `ClientPlan`, and TypeScript emitters.
It writes fresh operation bindings and a small JSON table definition under the ignored `.input` directory.
The definition contains the primary key, columns, labels, page bounds, reference reads, row links, and form mappings.

The helper also emits the current Solid 1 components for provenance. The browser does not import those components.
The fixture adapts the generated definition with plain controls.
Its Form button shows the generated mapping. It does not run TanStack Form or submit the mapped batch operation.
The Open button calls the generated Widget read binding.
Reference cells call the generated maker binding and display the returned names.

Preparation copies `web/runtime/src` without changes and uses WAMN's installed zod package.
`provenance.json` records the WAMN revision, relevant source diff hash, toolchain, zod version, and generated input hashes.
The build emits `modules.json`. The browser runner rejects table-core, TanStack Store, and the excluded companion UI libraries in that graph.

## Record ownership

`createWamnTable.ts` owns the canonical record store.
WAMN's generic page helpers hold IDs instead of a second record collection.
Native Table reads those IDs and the records directly.
Accepted refreshes compare scalar fields and update existing records in place.
The fixture rejects duplicate IDs before it writes any records.
Drafts hold edited values and a base revision separately from committed records.

Load mode sends one request with `limit = min(cap, generated page maximum)`.
A remaining cursor marks the result incomplete. The fixture never starts a paging loop.
Browse mode follows a cursor only when the operator requests the next page.
It preserves server order and keeps local transformations disabled.
The separate synthetic workloads bypass transport and generate 1,000, 10,000, or 50,000 records for Table measurements.
They do not claim that WAMN serves pages above its 100-row maximum.

Scope changes invalidate earlier responses before the new load starts.
The fixture waits for Solid's microtask commit before it reads a changed configuration.
`latest()` does not expose queued synchronous writes in rc.13.
The [Solid cheatsheet](https://github.com/solidjs/solid/blob/next/packages/solid/CHEATSHEET.md) describes the committed-read rule.

## Run

Run these commands from the Table worktree root.
Set `WAMN_ROOT` if the checkout is outside `~/dev/wamn`.
Preparation needs WAMN's installed runtime dependencies and its cached Rust dependencies.

```sh
node packages/solid-table/bench/wamn/prepare.mjs
node packages/solid-table/bench/wamn/check-inputs.mjs --current-source
pnpm --filter @tanstack/solid-table exec tsc --project bench/wamn/tsconfig.json
pnpm --filter @tanstack/solid-table exec vite build --config bench/wamn/vite.config.ts
node packages/solid-table/bench/wamn/run.mjs
```

If Chromium uses a separate Playwright cache, set `PLAYWRIGHT_BROWSERS_PATH` before the runner command.
This machine uses `/tmp/table-cleanup-browsers`.
The runner starts its own local server and closes the server and browser in `finally`.
For manual use, run Vite with the same configuration and stop it after the session.

To test the built native package, build Solid Table first.

```sh
pnpm --filter @tanstack/solid-table run build
BENCH_DISTRIBUTION=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/wamn/vite.config.ts
BENCH_DISTRIBUTION=1 node packages/solid-table/bench/wamn/run.mjs
```

For development diagnostics, use both environment flags during the build.

```sh
NODE_ENV=development BENCH_DEVELOPMENT=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/wamn/vite.config.ts
BENCH_DEVELOPMENT=1 BENCH_SIZES=1000 node packages/solid-table/bench/wamn/run.mjs
```

For readable heap captures, set `BENCH_PROFILE=1` during the build.
Set `BENCH_HEAPS` to an output directory during the runner command.
Set `BENCH_OUTPUT` to retain separate JSON reports.
The runner captures the largest requested workload before and after disposal.
Use `bench/inspect-heap.mjs` to classify each snapshot.

For correctness tests alone, set `BENCH_WORKLOADS=0` during the runner command.
This excludes the synthetic measurements and heap captures.
The input validator compares all generated and copied file hashes and the copied Zod version.
Its optional `--current-source` flag also compares the WAMN revision and relevant source changes.
Without that flag, the validator needs only the prepared `.input` directory.
Set `BENCH_SCREENSHOT` to save a screenshot at the specified file path.

## Evidence and limits

The runner exercises 18 integration scenarios with the real HTTP encoder and decoder over a deterministic fetch replacement.
It covers exact revision strings, stale responses, caps, duplicate IDs, refusals, edits, selection, reference lookups, and generated action mappings.
Synthetic workloads exercise scrolling, filtering, sorting, draft survival, and disposal.
These tests do not exercise a WAMN server, authorization enforcement, production forms, or the shared DataGrid wrapper.

On October 6, 2026, all 18 correctness cases pass against source, distribution, and development builds.
All three runs report zero errors and diagnostics.
The prepared inputs match WAMN revision `1931d925f15e3e33ef2fc4899a8a46e96f0b4125` with no relevant source changes.
The input validator matches all 19 file hashes and the copied Zod version.
The provenance records Rust `1.98.1` and Zod `4.6.5`.
The cases include disposal before the first settlement and disposal during an outstanding load.
Native unit tests separately cover nested edits, reactive getters, controlled state, column changes, and source replacement.
The hydration fixture covers native Table and the root adapter with retained DOM nodes, an edit, and subscription disposal.

The renderer keeps at most 20 DOM rows in each measured settled state.
The separate live-view counter permits overlap while Solid replaces a window.
Saving a visible note must allocate no row views or cells and read exactly the changed note and revision fields.
Disposed heap growth above 5 MiB fails the runner and requires diagnosis.
With heap capture enabled, the runner also requires exactly one record collection while loaded.
The disposed capture must contain no classified records, Solid store targets, owners, computations, row views, cells, or virtualizer.
Timings remain advisory on this shared development host.

The fixture uses native event listeners with owner cleanup, as the existing virtualized example does.
Solid rc.13 also retains disposed computations in an unscheduled pending-node queue in this fixture.
`main.tsx` wraps the render disposer in a generator-based `action()` and calls `flush()` after the action.
This public API workaround schedules the queue drain. It changes no record state or runtime dependency files.
Bead `table-gd3.6.5` tracks a smaller reproducer, a fixed runtime release, and removal of the workaround.

The full sequence also exposed a native column getter retained through a V8 allocation template.
Native Table now creates that live property with `Object.defineProperty`.
The [heap report](../heap-findings.md#wamn-integration-fixture) records both retaining paths and the final captures.
