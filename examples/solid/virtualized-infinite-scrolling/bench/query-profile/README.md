# Query snapshot allocations

This fixture measures the remaining work in Beads issue `table-rt3.2`.
It uses the installed Solid Query client and `useInfiniteQuery` with the root Table adapter.
A snapshot is a plain data view at one point in time.
The native Table entry and production WAMN integration remain separate work.

The fixture compares three bridges from Query data to Table data.

- `deep` uses the current example expression, `pages.flatMap((page) => deep(page.data))`.
- `clone` copies every row with `{ ...row }`, as the former example bridge does.
- `shallow` copies the page arrays and keeps their row proxies.

The shallow mode is a negative control, a comparison that must expose an error.
It must leave one stale cached row after the field edit.
Both supported modes must return all expected IDs and cell values.
They must preserve old snapshot values, stable reads, and unchanged cache references.
The fixture also requires the expected counts of changed row identities and new core rows.
After disposal, a cache write must cause no bridge work.

The data uses flat records with `id`, `name`, and `score` fields.
Each page holds up to 1,000 records.
The workload covers eight states: load, stable read, same reference, equal payload, field edit, page append, page replacement, and page removal.
The replacement keeps the first page length and changes its IDs.
These are deterministic cache writes, not network fetch measurements or rendered scrolling tests.
Existing example browser tests cover the fetch and scrolling behavior.

Structural sharing preserves unchanged cache objects across responses.
The fixture tests both its default enabled state and an explicit disabled state.
The disabled comparison forces equal payloads with distinct object references through the Query projection.
No runtime version or example configuration changes as part of this probe.

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
pnpm exec eslint bench/query-profile/main.ts bench/query-profile/vite.config.ts
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
Each build therefore covers 432 measured states and 144 warmup states.
Set `BENCH_SIZES`, `BENCH_REPEATS`, or `BENCH_WARMUPS` to change the workload.
Set `BENCH_ALLOCATIONS=0` to repeat timing measurements without allocation sampling.
If you use an installed Chrome executable, set `BENCH_EXECUTABLE_PATH` to its absolute path.

## Measurements

The runner records Chrome allocation samples at a 32 KiB interval.
It includes sampled objects that minor or major garbage collection removes during the operation.
Garbage collection releases objects that the application no longer uses.
Raw profiles reside beside the report in its `.allocations` directory.
The summary assigns each sampled allocation to its call stack.
It separates stacks under `deepNext`, stacks under `_createCoreRowModel`, and other stacks.
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
