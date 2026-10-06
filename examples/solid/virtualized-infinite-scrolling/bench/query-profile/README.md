# Query snapshot allocations

This fixture measures Beads issues `table-rt3.2` and `table-rt3.4`.
It uses the installed Solid Query client and `useInfiniteQuery` with the root Table adapter.
A snapshot is a plain data view at one point in time.
A bridge converts Query data into Table data.
A memo caches a reactive computation.
The native Table entry and production WAMN integration remain separate work.

The fixture compares four bridges from Query data to Table data.

- `deep` uses the original expression, `pages.flatMap((page) => deep(page.data))`.
- `page-deep` uses the example helper with one deep snapshot memo for each page position.
- `clone` copies every row with `{ ...row }`, as the former example bridge does.
- `shallow` copies the page arrays and keeps their row proxies.

The shallow mode is a negative control, a comparison that must expose an error.
It must leave one stale cached row after the field edit.
The three snapshot modes must return all expected IDs and cell values.
They must preserve old snapshot values, stable reads, and unchanged cache references.
The fixture also requires the expected counts of changed row identities and new core rows.
After disposal, a cache write must cause no bridge work.

The data uses flat records with `id`, `name`, and `score` fields.
Each page holds up to 1,000 records by default.
Set `BENCH_PAGE_SIZE=50` to match the example's page size.
The workload covers eight states: load, stable read, same reference, equal payload, field edit, page append, page replacement, and page removal.
The replacement keeps the first page length and changes its IDs.
These are deterministic cache writes, not network fetch measurements or rendered scrolling tests.
Existing example browser tests cover the fetch and scrolling behavior.

Structural sharing preserves unchanged cache objects across responses.
The fixture tests both its default enabled state and an explicit disabled state.
The disabled comparison forces equal payloads with distinct object references through the Query projection.
The page helper replaces the bridge in the infinite scrolling example.
It leaves Query configuration and runtime versions unchanged.

Before sampling, both deep bridges pass 33 additional contract states through the actual Query client.
These states cover repeated edits, metadata, prepend, reorder, replacement, row insertion and removal, empty pages, restoration, and query key changes.
They also call `fetchNextPage()` and require zero active page computations after disposal.
Structural replacement contracts use fresh objects, as a transport response does.
The ordinary measured append and removal cases retain cache references.
The eight unit regressions also cover nested edits, detached page writes, and bounded computations through repeated replacement.

An inherited runtime failure remains under Beads issue `table-rt3.5`.
After a field edit, prepending reused page objects can duplicate projected records while the Query cache remains correct.
The original bridge and the page helper both expose that failure on the pinned versions.
A standalone reproduction imports no Table code or page helper.
Fresh response objects pass the same operation.
This optimization does not repair the upstream projection behavior or change application cache writes.

## Run

From the repository root, build the dependencies and install the browser.

```sh
pnpm --filter @tanstack/table-core run build
pnpm --filter @tanstack/solid-table run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers pnpm exec playwright install chromium
```

Change to the infinite scrolling example directory.

```sh
cd examples/solid/virtualized-infinite-scrolling
```

Run the fixture types and lint from that directory.

```sh
pnpm exec tsc --project bench/query-profile/tsconfig.json
pnpm exec eslint src/App.tsx src/createInfiniteQueryRows.ts bench/query-profile/main.ts bench/query-profile/vite.config.ts tests/e2e/smoke.spec.ts
```

Build the source fixture, then run its workload and summarize the report.

```sh
pnpm exec vite build --config bench/query-profile/vite.config.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers BENCH_OUTPUT=/tmp/table-query-profile-source.json node bench/query-profile/run.mjs
node bench/query-profile/summarize.mjs /tmp/table-query-profile-source.json
```

Build the distribution fixture, then run the same workload against the built Table entry.

```sh
BENCH_DISTRIBUTION=1 pnpm exec vite build --config bench/query-profile/vite.config.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers BENCH_DISTRIBUTION=1 BENCH_OUTPUT=/tmp/table-query-profile-distribution.json node bench/query-profile/run.mjs
node bench/query-profile/summarize.mjs /tmp/table-query-profile-distribution.json
```

The default sizes are 1,000, 10,000, and 50,000 records.
Each mode and sharing configuration receives three measured repetitions and one discarded warmup.
The runner rotates mode order and opens a fresh page for each repetition.
Each default build therefore covers 576 measured states and 192 warmup states.
Set `BENCH_SIZES`, `BENCH_REPEATS`, or `BENCH_WARMUPS` to change the workload.
Set `BENCH_ALLOCATIONS=0` to repeat timing measurements without allocation sampling.
If you use an installed Chrome executable, set `BENCH_EXECUTABLE_PATH` to its absolute path.

For the focused original-versus-page comparison, run these commands after both fixture builds.

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers BENCH_MODES=deep,page-deep BENCH_OUTPUT=/tmp/table-query-page-source-final.json node bench/query-profile/run.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers BENCH_DISTRIBUTION=1 BENCH_MODES=deep,page-deep BENCH_OUTPUT=/tmp/table-query-page-distribution-final.json node bench/query-profile/run.mjs
```

Each focused build covers 288 measured states and 96 warmup states, plus the 66 contract states.
For the example's smaller pages, set `BENCH_PAGE_SIZE=50` and `BENCH_SIZES=50000` with distinct report names.
That comparison covers 96 measured states and 32 warmup states per build.

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers BENCH_MODES=deep,page-deep BENCH_PAGE_SIZE=50 BENCH_SIZES=50000 BENCH_OUTPUT=/tmp/table-query-page-small-source.json node bench/query-profile/run.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-query-browsers BENCH_DISTRIBUTION=1 BENCH_MODES=deep,page-deep BENCH_PAGE_SIZE=50 BENCH_SIZES=50000 BENCH_OUTPUT=/tmp/table-query-page-small-distribution.json node bench/query-profile/run.mjs
```

## Measurements

The runner records Chrome allocation samples at a 32 KiB interval.
It includes sampled objects that minor or major garbage collection removes during the operation.
Garbage collection releases objects that the application no longer uses.
Raw profiles reside beside the report in its `.allocations` directory.
The summary assigns each sampled allocation to its call stack.
It separates deep traversal, stacks under `_createCoreRowModel`, and other stacks.
Deep attribution recognizes `deep`, `deepNext`, `walkT`, `snapshotNext`, and `snapshotWalk` because Chrome can omit inlined outer frames.
The profiles and report include bundle hashes and browser and package versions.

Allocation samples estimate bytes, not exact allocation totals.
Changed row identities count final output objects that differ from the previous output for the same ID.
They do not count all temporary objects or prove that each returned object is a new copy.
The initial count includes the first exposed rows.
`newCoreRows` counts new Table row objects relative to the previous model.
`rowVisits` counts only the explicit loops in the clone and shallow modes.
It does not count the internal traversal that `deep()` performs.

Load sampling includes input creation, Query initialization, and Table initialization.
Later sampling excludes payload preparation and correctness comparisons.
It includes the cache write, eager bridge work, and a full model read with both cached column values.
The model read computes a scalar checksum and creates no result array for the comparison.
The `update` timing includes any bridge work that the cache write and `flush()` trigger.
The `bridge` timing measures the following memo read, which often returns an already computed value.

The runner also records browser heap sizes after forced garbage collection.
These values describe retained memory at that moment, not transient allocation volume or classified retaining paths.
The fixture does not capture full heap snapshots.
Timing ranges include sampling overhead and shared host load.
Use the exact identity and correctness results as gates.
Treat timings and sampled bytes as measurements for this workload, without a universal speed or memory claim.

The [dated findings](../../../../../packages/solid-table/bench/heap-findings.md) record the results and the bridge decision.
The [Solid store design](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/04-stores.md) describes projection reconciliation and deep observation.
