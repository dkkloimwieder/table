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
It does not yet implement the complete WAMN feature contract.
Production feature work remains tracked in Beads under `table-gd3`.

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
