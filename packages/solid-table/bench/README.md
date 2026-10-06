# Solid-only table benchmarks

The target is a focused Solid-only engine for WAMN.
It reads one caller-owned Solid record store and uses native Solid derivations.
It does not use table-core rows, caches, atoms, or feature factories.
The native implementation now ships through the local `@tanstack/solid-table/native` entry.
The [native guide](../../../docs/framework/solid/guide/native.md) describes its supported API and scope rules.

The browser harness compares five modes:

- `array` uses immutable arrays and the existing core row model under Solid 2.
- `deep` uses a Solid store, a `deep()` memo, and the existing core row model.
- `store` adds reactive row models around table-core with a store array.
- `keyed` adds those same models around table-core with a store of IDs and records.
- `native` uses the new engine, a Solid record store, and a signal for ordered IDs.

The first four modes are comparison baselines.
The store-over-core architecture is rejected for the product.
The [heap analysis](./heap-findings.md) explains its retained objects and duplicate cache structures.
The array baseline measures Solid 2 with the old core algorithm, not the Solid 1 runtime.

The native entry supports explicit accessors, filters, search, facets, sorting, nested groups, and aggregates.
It implements stable sorting, combined filters, and explicit missing-value placement.
The engine also supplies column sizing, pinning, selection, expansion, and a processing pause for application editing locks.
It does not implement production WAMN screens, Form integration, or shared UI wrappers.
Those consumers remain deferred in Beads under `table-gd3`.

## Qualification boundary

The root package entry remains the table-core adapter.
The native entry uses a separate focused contract and imports only Solid at runtime.
Native qualification covers this contract and the [isolated WAMN fixture](./wamn/README.md).
That fixture uses real generated bindings with deterministic transport responses.
Its large synthetic datasets measure Table behavior rather than WAMN server page limits.

The [editing fixture](./editing/README.md) tests non-virtualized text and dropdown editing with application-owned drafts.
It also demonstrates filters, grouping, summaries, resizing, rearrangement, child tables, locks, and named views.
The [popup fixture](./popup/README.md) adds a focused Kobalte Select port with fixed choices.
Their controls and storage callbacks remain application examples.
The native package does not publish them.
Production WAMN, Form, shared UI, DataGrid, and generator integration remain deferred.
Searchable references and undefined row or bulk actions need separate requirements and evidence.

From the repository root, run the automated correctness qualification after installing dependencies and Chromium.

```sh
pnpm test:solid:qualification
```

This command covers source and distribution editing and popup cases, package builds, server rendering, and hydration.
Hydration attaches the client to server-rendered HTML and requires existing cells to survive attachment and respond to edits.
Reports remain under `test-results/solid-qualification`.
The command does not capture heaps or replace the performance workloads below.

For the WAMN extension, first prepare the generated inputs with the [WAMN fixture instructions](./wamn/README.md#run).
Then run the extended qualification from the repository root.

```sh
node scripts/run-solid-qualification.mjs --wamn
```

This extension checks prepared input hashes, fixture types, and scoped lint.
It also tests source, distribution, and development builds of the WAMN fixture.
The runner uses `bench/wamn/.input` and does not invoke an external generator.
Default CI does not require a WAMN checkout.

## Handoff evidence on 2026-10-06

The extended qualification passes all 24 stages and 336 browser cases with zero browser errors or Solid diagnostics.
It runs 122 editing cases and 19 popup cases against each source and distribution build.
It also runs 18 WAMN cases against each source, distribution, and development build.
Server rendering and native plus root-adapter hydration pass.
Hydration preserves existing DOM nodes, applies edits, and releases scopes after disposal.
Reports and stage logs reside under `test-results/solid-qualification-native`.

The WAMN fixture passes 18 correctness cases in each source, distribution, and development build.
All 54 cases report zero browser errors and diagnostics.
Reports reside in `/tmp/table-native-wamn-{source,distribution,development}.json`.
Fixture types, scoped lint, and all three builds pass.
The new case disposes the render before its first settlement and rejects late load responses.

The fixture checks all 19 generated input hashes against its provenance record.
Its current-source audit matches WAMN revision `1931d925f15e3e33ef2fc4899a8a46e96f0b4125` with no scoped source differences.
The recorded generator inputs use Rust 1.98.1 and Zod 4.6.5.
These results cover real generated bindings and the HTTP encoder and decoder over deterministic transport responses.
They do not exercise a live WAMN server, authorization enforcement, production Form, DataGrid, or the RecordSelect Combobox.

All eight TypeScript and TSX examples in the native guide compile against the current package types.
The documentation link scan passes across 1,263 Markdown files.
The scoped Solid checks pass 150 unit tests, package types, and source lint.
The package audit passes strict publint and native import checks.
The pending native changeset describes the focused engine, sizing commands, and processing pause.
Production consumer adoption and upstream workaround retirement remain separate tasks.
The [dated heap findings](./heap-findings.md#qualification-measurements-on-2026-10-06) record memory, active feature costs, and lifecycle evidence.
The raw report and command index is `/tmp/table-native-qualification-evidence.json`.
It preserves the environment variables for each fresh workload and capture.

To repeat the matched timing workload, use the built entry with three repetitions and one warmup at each size.
Run these commands from `packages/solid-table` after the package builds described below.

```sh
BENCH_DISTRIBUTION=1 pnpm exec vite build --config bench/vite.config.ts
BENCH_DISTRIBUTION=1 BENCH_MODES=array,deep,native BENCH_SIZES=1000,10000,50000 BENCH_REPEATS=3 BENCH_WARMUPS=1 BENCH_OUTPUT=/tmp/table-native-qualification-matched.json node bench/run.mjs
```

The fresh feature, grouping, and virtualized runs also use the distribution build and three repetitions at those sizes.
Their actual captures use `BENCH_PROFILE=1`, one repetition, and the largest size of 50,000 records.
Matched array and native heaps instead capture all three sizes with the command below.
The lifecycle capture uses the readable distribution build for 12 cycles at 50,000 records.

## Run

From the repository root, build the required table-core dependency if its distribution is absent.

```sh
pnpm --filter @tanstack/table-core run build
```

From `packages/solid-table`, build the production benchmark.

```sh
pnpm exec vite build --config bench/vite.config.ts
```

From that same directory, run the benchmark with an installed Playwright Chromium browser.

```sh
node bench/run.mjs
```

To measure the built native entry, first build the Solid package from this directory.
Then set `BENCH_DISTRIBUTION=1` for both commands.

```sh
pnpm run build
BENCH_DISTRIBUTION=1 pnpm exec vite build --config bench/vite.config.ts
BENCH_DISTRIBUTION=1 BENCH_MODES=native node bench/run.mjs
```

This variant compiles `dist/solid/native.js`, which is the native entry for Solid bundlers.
Its assets use `.bench-package-dist`.
The output records the selected entry and asset filenames.

For repeated disposal measurements, build the readable production bundle and run the lifecycle harness.
Use the same Playwright browser directory as the benchmark.

```sh
BENCH_PROFILE=1 BENCH_DISTRIBUTION=1 pnpm exec vite build --config bench/vite.config.ts
node bench/lifecycle.mjs
```

The harness uses one browser page for twelve mount, mutation, refresh, scroll, and disposal cycles at 50,000 rows.
It captures actual heaps before and after the final disposal.
`BENCH_OUTPUT_DIR`, `BENCH_CYCLES`, and `BENCH_SIZE` override the output directory, cycle count, and dataset size.
The default output directory is `/tmp/table-native-lifecycle`.

For matched captures, build the readable distribution variant first.
Then run the capture command from `packages/solid-table`.

```sh
BENCH_PROFILE=1 BENCH_DISTRIBUTION=1 pnpm exec vite build --config bench/vite.config.ts
BENCH_PROFILE=1 BENCH_DISTRIBUTION=1 BENCH_MODES=array,native BENCH_SIZES=1000,10000,50000 BENCH_HEAP_STAGES=empty,loaded,disposed BENCH_OUTPUT_DIR=/tmp/table-native-qualification-matched-heaps node bench/capture-heaps.mjs
```

Each requested size receives an empty, loaded, and disposed snapshot for each mode.
The capture records its parameters, source hashes, distribution flag, asset hashes, and actual heap summaries.
Parse retaining paths with `bench/inspect-heap.mjs` before comparing classified resources.

The feature harness tests search, facets, visibility, field edits, removal, append, sorting, and manual mode in rendered tables.
Each case compares the complete row sequence, visible cells, and displayed facets with independent calculations.
Run it against the production build from the same directory.

```sh
node bench/features-run.mjs
```

Set `BENCH_DISTRIBUTION=1` to select the built entry assets.
Set `BENCH_PROFILE=1` to select `.heap-dist` after a readable production build.
Set `BENCH_HEAPS` to an output directory to capture open, closed, and disposed facet heaps for the largest dataset.
The feature runner records memory with facets open and closed, plus memory after table disposal.
The default workload uses three repetitions at 1,000, 10,000, and 50,000 rows.

If browsers use a custom directory, set `PLAYWRIGHT_BROWSERS_PATH` to that directory.
The runner starts one local HTTP server and closes it when the run ends.
Avoid concurrent task-owned benchmarks and builds during measurement.
Other development loads on this host remain outside this experiment.
Results go to `.bench-results/latest.json` unless `BENCH_OUTPUT` specifies an absolute path.

## Method

The default run uses seed 1729, eight columns, and 1,000, 10,000, and 50,000 initial records.
Each combination runs two warmups and five measured repetitions in separate browser pages.
Modes rotate order between repetitions.
Each table mounts 40 rows with a fixed height of 28 pixels.
This fixed window isolates data costs before the full virtualizer integration.

Each run appends 100 records, edits one score, changes an unused field, and replaces one record with the same ID.
It then filters scores, sorts them, edits a score while both features are active, and refreshes one percent of records.
Finally, a scripted scroll traverses the result over 60 animation frames.
The runner compares the complete row sequence and visible cell text with an independent calculation after each operation.

Timing includes the update and synchronous Solid flush.
Separate Chrome counters measure scripting, layout, style recalculation, and total task time.
The output also includes frame intervals, row and cell construction, DOM mounts, accessor calls, ID reads, filter calls, and comparator calls.
Heap measurements run after forced garbage collection, before mounting, after the workload, and after disposal.
Disposal measurements include an immediate sample and a second sample after two animation frames and another garbage collection.
Heap size measures retained memory, not total transient allocation.
Row and cell counters provide exact construction counts, not complete JavaScript allocation counts.

Five repetitions give a coarse p95 estimate: the largest measured sample.
These results describe this machine and workload, not every browser or application.
The raw output includes the browser, CPU, operating system, runtime, parameters, and host load averages.
The user reports other development loads on this machine. Expect high timing variance.
Use allocation counts and correctness as strict gates. Treat timing budgets as advisory until a controlled host reproduces the comparison.

Historical reports below establish earlier feature decisions.
They do not prove that the current checkout passes.
The [heap findings](./heap-findings.md) record dated measurements and the remaining costs for the current qualification handoff.

## Computed accessor profiling

The focused fixture compares native filtering and its opt-in value reuse with three experimental alternatives.
An accessor computes a column value from a record.
The fixture uses one caller-owned record store, a computed column, and a color column.
It measures cheap accessors and accessors with 64 extra calculation steps at 1,000, 10,000, and 50,000 records.
Sorting, grouping, DOM rendering, and application-specific computed values remain outside this comparison.

The `separate` mode uses independent scans for rows and each open facet.
The `native-reuse` mode enables the native column option `enableFilterValueReuse` for its deterministic computed accessor.
The `matcher-cache` mode reuses a computed value inside one predicate call and preserves those separate scans.
The `fused` mode combines active outputs in one scan and shares their reactive dependencies.
The `separate`, `matcher-cache`, and `fused` modes are experiments.
They do not define package features.
The `native` and `native-reuse` modes exercise the package implementation.
`BENCH_MODES` selects named modes. Its default includes all five modes.
The [native reuse findings](./heap-findings.md#native-matcher-reuse-on-2026-10-06) describe the measured costs and the opt-in contract.
The earlier experiment remains in the same report.

From the repository root, build the Solid package before the distribution fixture.
Then build and run the fixture with an installed Playwright Chromium browser.
If browsers use a custom directory, set `PLAYWRIGHT_BROWSERS_PATH` to that directory.

```sh
pnpm --filter @tanstack/solid-table run build
BENCH_DISTRIBUTION=1 pnpm exec vite build --config packages/solid-table/bench/accessor-profile/vite.config.ts
BENCH_DISTRIBUTION=1 BENCH_MODES=native,native-reuse,separate,matcher-cache BENCH_SIZES=1000,10000,50000 BENCH_REPEATS=3 BENCH_WARMUPS=1 BENCH_ITERATIONS=0,64 BENCH_OUTPUT=/tmp/table-native-filter-reuse-distribution.json node packages/solid-table/bench/accessor-profile/run.mjs
```

For a source comparison, omit `BENCH_DISTRIBUTION=1` from both fixture commands and choose a separate output path.
Avoid concurrent task-owned builds and benchmarks during measurement.
Other host activity remains outside this experiment, so timings remain advisory.
Each repetition uses a fresh browser page.
Discarded warmup runs do not warm the measured page's JavaScript execution.
The fixture captures no heaps and makes no retained-memory comparison.

## Native contract

The application owns the record store and all writes.
The source supplies `ids()` for ordered membership and `get(id)` for the current record.
IDs are unique, nonempty strings. They identify records independently of position.
A caller can encode record-map keys when IDs include reserved property names.

The benchmark uses one Solid store for records and one signal for ordered IDs.
The ID signal contains no record copies.
An append updates both before the next Solid flush.
A field edit uses the store setter directly.
A refresh can use native `reconcile` without a table snapshot or dirty-row command.

```ts
const [records, setRecords] = createStore<Record<string, { score: number }>>({
  a: { score: 20 },
})
const [ids, setIds] = createSignal(['a'])
const table = createNativeTable({
  source: { ids, get: (id) => records[id] },
  columns: [{ id: 'score', accessorFn: (record) => record.score }],
})

setRecords((draft) => {
  draft.a!.score = 25
})
```

The source interface also accepts a store-backed ID array.
The unit tests exercise this form.
That form tracks each array position and uses more memory in the initial browser comparison.
Neither form creates another writable record dataset.

`getRowIds()` derives the displayed ID sequence.
The renderer applies its virtual range before it creates row views or cells.
Solid keyed rendering preserves a visible scope while its ID remains visible.
Scrolling can dispose that scope. Selection and edit drafts therefore belong outside it.

`getRow(id)` creates a lightweight view when a consumer requests one.
Its `original` getter reads the current record.
Its `getValue(columnId)` method reads the current column and record in the consuming scope.
Nested property reads participate in native Solid tracking.
There is no permanent value cache or memo for each field.

Logical record identity survives edits, replacement, and reorder.
Object identity is guaranteed only by the owning consumer, such as the keyed visible scope.
The engine does not retain a collection-wide registry of row objects.
After record removal, a retained view returns `undefined` instead of reading a previous record.
A listed ID with no record is an error.

Filters scan the source IDs and read only their configured fields.
Sorting reads each sort key once per record in that derivation, then sorts temporary values.
Direct cell reads, filtering, and sorting can evaluate the same accessor separately.
This avoids persistent per-field memos but requires measurement for expensive computed columns.
An active filter or sort still processes its full input when a relevant field changes.

The engine uses a small native Solid store for internal view state.
It contains view state only.
It does not contain records or mirror an external state engine.
Controlled fields read their external getters and notify their callbacks once per command.
Supported commands cover filters, sorting, selection, expansion, visibility, order, pinning, and sizing.
Source and display index maps are lazy. Consumers allocate them only when they read an index.
The renderer owns record-detail content and its height.
`getRowSections()` partitions pins from the scrollable center sequence.
Group expansion determines the displayed hierarchy through `getDisplayKeys()`.

## Native virtualized renderer

The native example resides at `examples/solid/virtualized-rows/native.html`.
It imports the native Table entry and uses virtual-core only for geometry.
The shared binding reads display keys, preserves applicable measurements, and publishes the visible range.
Records and feature state remain outside the virtualizer.

After building this benchmark, run its browser workload from `packages/solid-table`.

```sh
node bench/virtualized-run.mjs
```

The runner tests 1,000, 10,000, and 50,000 records, with three repetitions per size.
Each case covers 43 data and geometry states, browser interaction scenarios, and a 90-frame scroll sequence.
An independent calculation supplies every expected display key and cell value.
Geometry assertions cover measured row heights, gaps, header alignment, sticky headers, and current measurement indexes.
The runner also tests pinning, groups, resizing, selection, replacement, removal, and empty or busy states.
Scroll-position assertions cover deletion, reordering, column layout, and expansion above the viewport.
Browser input events exercise drafts, refused saves, concurrent edits, removal, and keyboard navigation across virtual windows.

Mounted views must stay within the viewport, overscan, and explicit pinned rows.
A visible name edit must evaluate each affected accessor once without creating rows or cells.
An unused field edit must cause no table or display work.
Scrolling with active filtering and sorting must read only newly mounted cells.
All mounted scopes must dispose, and measurement observers must release detached elements.
The runner records host load, browser version, asset hashes, memory, frame intervals, and browser performance counters.
Step durations include browser communication and four settlement frames. They are not isolated handler times.
The default example has five columns.
Set `BENCH_EXTRA_COLUMNS=3` to measure eight columns with three additional name accessors.
This matches the current WAMN fixture count but does not reproduce its form, reference, or action renderers.

To exercise Solid diagnostics, build and run the development variant from the same directory.

```sh
NODE_ENV=development BENCH_DEVELOPMENT=1 pnpm exec vite build --config bench/vite.config.ts
BENCH_DEVELOPMENT=1 BENCH_SIZES=1000 BENCH_REPEATS=1 node bench/virtualized-run.mjs
```

The runner records `HUGE_FAN_IN` warnings from complete sort, filter, and group scans.
It rejects diagnostics from other operations and all other diagnostic codes.
Bead `table-gd3.1.5` tracks this dependency breadth and related costs.

For the built entry, set `BENCH_DISTRIBUTION=1` during both the benchmark build and the run.
For readable heap snapshots, use the following commands.

```sh
BENCH_PROFILE=1 pnpm exec vite build --config bench/vite.config.ts
BENCH_PROFILE=1 BENCH_SIZES=50000 BENCH_REPEATS=1 BENCH_HEAPS=/tmp/table-native-virtual-heaps node bench/virtualized-run.mjs
```

## Grouping workload

From `packages/solid-table`, build the production benchmark before running this workload.
Use the same distribution and browser environment variables as the commands above.

```sh
node bench/grouping-run.mjs
```

The runner uses 1,000, 10,000, and 50,000 records, with three repetitions per size.
Each case compares eighteen states with an independent grouping calculation and visible cell values.
The states cover nested expansion, aggregate edits, group moves, filters, replacement, append, removal, sorting, manual mode, and scrolling.
An amount edit must read no grouping fields. An unused edit must perform no table or display work.
Only the visible range creates row or group views and cells.

The runner measures nested groups, one group per record, grouping disabled, and full disposal.
For actual snapshots, build with `BENCH_PROFILE=1` and supply `BENCH_HEAPS` to the runner.

```sh
BENCH_PROFILE=1 pnpm exec vite build --config bench/vite.config.ts
BENCH_PROFILE=1 BENCH_SIZES=50000 BENCH_REPEATS=1 BENCH_HEAPS=/tmp/table-native-group-heaps node bench/grouping-run.mjs
```

Group membership contains keys, paths, counts, and leaf IDs. It does not contain copied records.
Group cells memoize aggregates only in their visible scopes.
Group sorting and visible aggregate cells can read the same values separately.
Many distinct groups allocate more membership metadata, even when the viewport remains bounded.

## Acceptance gates

Correctness and allocation counts are strict gates.
Timings remain advisory on this shared development host.
The old limit of twice the deep-bridge heap is retired.

1. A visible field edit creates zero display rows, cells, or DOM mounts and evaluates one affected accessor.
2. An unused field edit evaluates zero accessors, filters, or comparators in the measured workload.
3. An offscreen append creates zero display objects and retains existing visible DOM nodes.
4. Same-ID replacement retains visible identity and updates every affected value.
5. Filter, sort, refresh, and scrolling match independent results after every operation.
6. Explain loaded memory through actual snapshots, duplicate-storage analysis, and scaling with active features.
   Native tracking can use more memory than the array-based table.
7. After disposal, heap growth stays below the larger of 5 MiB or five percent of loaded growth.
8. Actual snapshots must show no table-core row/cache machinery in the native path and bounded visible resources.

The initial latency targets remain 5 ms for an unfiltered edit and 20 ms for scroll-frame p95.
A controlled host must qualify these timing targets before a product performance claim.
An unexplained memory increase requires a diagnosis before adoption.
The user clarified that native tracking overhead is expected. Exact parity with the array-based table is not a product requirement.

## WAMN constraints

The reviewed WAMN runtime owns immutable page arrays and does not use Solid Query in the generated table path.
Its runtime remains framework independent. The UI integration owns the Solid store at that boundary.
Generated tables need their primary keys as logical IDs instead of the current default index identity.
Server filtering and sorting remain authoritative until the complete result is loaded.

The installed companion libraries still use removed Solid 1 APIs.
Form uses `onMount` and `createComputed`. Kobalte uses `solid-js/web` and one-argument effects.
Sonner uses `solid-js/store`. Lucide uses `solid-js/web` and `splitProps`.
Production WAMN integration needs compatible releases, ports, or replacements for those companions.
The user approved an [isolated integration fixture](./wamn/README.md) with plain controls.
It exercises the real runtime, freshly generated bindings, and metadata from the actual client plan.
It leaves production Form and DataGrid migration in phase 5.

## Sources

The [Solid 2 cheatsheet](https://github.com/solidjs/solid/blob/next/packages/solid/CHEATSHEET.md) documents draft setters, owners, and lazy memos.
The [store documentation](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/04-stores.md) describes reconciliation and snapshots.
The native renderer uses keyed `For` over visible IDs. It does not map every loaded row into a scope.
