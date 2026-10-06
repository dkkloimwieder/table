# Heap findings

The store-over-core prototype retains too much memory for the target architecture.
It preserves table-core rows and caches, then adds native Solid bookkeeping around them.
The replacement must use Solid directly and restrict display objects to consumer demand.

## Native matcher reuse on 2026-10-06

The native column option `enableFilterValueReuse` enables deterministic value reuse within one record match.
It defaults to false and retains independent row and facet computations.
All matcher callbacks must preserve the opted-in accessor inputs and returned values during that match.
Cell reads, facet extraction, sorting, and aggregates remain independent.

The implementation stores one reusable value in local variables.
If multiple column definitions qualify, it creates a temporary Map only when it reads a reusable value.
Presence tracking preserves `undefined` and `null` without another accessor call.
Values do not survive a matcher call or move between records.

The source and distribution smoke runs each pass eight samples across four modes and both accessor costs.
The full distribution comparison passes 72 measured samples and 1,008 state comparisons at 1,000, 10,000, and 50,000 rows.
It also passes 24 discarded warmup runs with 336 state comparisons.
Default native counters match the separate-scan reference across all 14 states.
Opted-in native counters match the temporary matcher reference across those same states.
All full row sequences and facet counts match independent calculations.

At 50,000 rows, combined filtering and search reduce computed accessor calls from 62,500 to 50,000.
An active color edit reduces calls from 62,499 to 50,000.
An own-filter change reduces calls from 125,002 to 100,000.
Record visits, predicate counts, predicate order, and short-circuit behavior stay unchanged.
Unrelated and closed-color edits perform no measured work.
Source updates after disposal perform no accessor work.

The first implementation creates a temporary Map even when only one column qualifies.
Its cheap-accessor search takes 46.3–59.4 ms at 50,000 rows, compared with 39.8–45.4 ms for default native matching.
The refined local-value path takes 43.5–45.3 ms, compared with 43.9–49.1 ms for its matched default run.
These runs use different host loads, so they do not establish a reliable speedup ratio.

With 64 accessor calculation steps, refined matching takes 46.5–60.4 ms for search at 50,000 rows.
Default matching takes 52.8–69.6 ms.
At 10,000 rows, the same ranges are 15.4–21.8 ms and 15.2–17.0 ms respectively.
The smaller workloads do not establish a consistent latency improvement.
The refined run records one-minute host load from 1.17 to 3.35 with Chromium 153.0.8010.12.
Timings remain advisory. Exact accessor counts provide the stable acceptance evidence.
This fixture captures no heaps and makes no retained-memory claim.

Current reports reside in `/tmp/table-native-filter-reuse-distribution.json` and `/tmp/table-native-filter-reuse-summary.json`.
Smoke reports use `/tmp/table-native-filter-reuse-{source,distribution}-smoke.json`.
The original implementation reports remain under the `-map-only` suffix.
The benchmark README records the modes and commands.
The final package checks pass 167 unit tests, types, source lint, strict publint, and the native import audit.
The new contract tests cover missing values, property getters, callback replacement, controlled state, and independent consumers.
The extended qualification passes 24 stages and 336 browser cases, plus server rendering and hydration.
Reports remain in `test-results/solid-qualification-filter-reuse`.
The profiling fixture passes types and lint, and all documentation links pass.

## Computed accessor profiling on 2026-10-06

This section records the original experiment before the native opt-in implementation above.

The focused fixture measures repeated computed values across filtering, search, and two open facets.
It compares the native implementation with independent scans, temporary matcher reuse, and a combined scan.
All modes read one caller-owned record store.
None creates a second writable record dataset or a permanent memo for each record.
The [benchmark instructions](./README.md#computed-accessor-profiling) give the source and distribution commands.

The temporary matcher candidate reuses a value only inside one predicate call.
It leaves row and facet scans independent.
The combined candidate shares a scan and reactive dependencies across its active outputs.
Both candidates assume pure deterministic accessors, which return the same value for unchanged inputs.
This fixture does not prove that every application callback meets that condition.
Neither candidate changes the published native implementation.

Each facet excludes its own column filter and retains the search and other column filters.
An own-filter change must preserve that facet's counts without another scan in the native implementation.
An edit to a closed facet's field must perform no accessor work.
A field edit outside observed columns must perform no accessor work.
The fixture compares complete row IDs and facet counts with independent calculations after every state change.
It also tests same-ID replacement and requires zero accessor work from source updates after disposal.

The distribution run passes 72 measured samples across four modes, three sizes, and two accessor costs.
Each combination uses three repetitions and one discarded warmup, for 1,008 measured state comparisons and 336 warmup comparisons.
All 14 states match independent row and facet results, with zero browser errors.
Native and independent scans match every measured work counter.
The source smoke passes eight samples at 1,000 records across both accessor costs.
Both reports use Chromium 153.0.8010.12.

At 50,000 records, filter plus search reads the computed accessor 62,500 times in native and independent modes.
Temporary matcher reuse reduces that count to 50,000 without changing source visits, predicates, or facet counts.
Opening both facets reads 123,611 computed values in native mode, compared with 111,111 for matcher reuse.
A relevant record edit reads 186,109 values in native mode and 161,111 with matcher reuse.
An own-filter change reads 125,002 values in native mode and 100,000 with matcher reuse.
The native own-filter change visits 100,000 records across rows and the other facet, without rescanning its own facet.

The combined candidate reads 50,000 computed values in each of those states.
Its shared dependencies also repeat row work when only the active color facet changes.
That color edit runs 50,000 search predicates in the combined mode, compared with 12,499 in native and matcher modes.
The native color edit visits 50,000 records for the color facet alone.
Unrelated edits and closed-color edits perform zero measured work in all four modes.
Source updates after disposal also perform zero accessor work.

With 64 calculation steps, native search takes 54.5–56.8 ms at 50,000 records.
Matcher reuse takes 44.9–51.2 ms in that state.
Native facet opening takes 130.2–134.2 ms, compared with 122.6–133.7 ms for matcher reuse and 50.7–57.2 ms for the combined mode.
The recorded one-minute host load ranges from 0.93 to 2.02.
These timings remain advisory and establish no production latency budget.
The fixture captures no heaps, so these counts establish no retained-memory improvement.

The package retains independent lazy scans.
They preserve the measured own-filter and field dependency boundaries.
The native matcher follow-up above records the contract review and implementation under `table-gd3.1.6`.
Combined scans remain an experiment because they couple outputs and add work for some edits.
The reports reside in `/tmp/table-accessor-profile-distribution.json` and `/tmp/table-accessor-profile-source-smoke.json`.
Their asset hashes identify the measured bundles.
The final scoped regression passes all 15 stages and 282 editing and popup cases, plus server rendering and hydration.
The profiling fixture passes types, lint, syntax, and formatting.
The documentation link scan passes across 1,263 Markdown files.

Sorting and grouping remain outside this fixture.
Native sorting already reads each key once per surviving record in an ordering pass.
Generic aggregate reuse needs a separate contract for custom functions, median, distinct values, and ordered summaries.
Floating-point addition order also affects numerical results.
A count aggregate reads no accessor values.
These differences prevent a general claim that combined scans improve every feature.

## Qualification measurements on 2026-10-06

The matched timing comparison uses the built package with Chromium 153.0.8010.12.
The matched comparison uses array, deep-bridge, and native modes at 1,000, 10,000, and 50,000 records.
Each combination uses one warmup and three measured repetitions, for 27 measured samples.
The host runs other development work.
Its recorded one-minute load ranges from 1.04 to 1.75 during this comparison.
Timings describe this workload and remain advisory.

At 50,000 records, loaded heap ranges are 36.833–36.835 MiB for array and 105.238–105.241 MiB for deep-bridge.
Native retains 39.260–39.262 MiB, approximately 6.59 percent above the array baseline.
The array baseline includes the table-core row and cache machinery.
It does not represent raw record storage alone.
Exact parity with this baseline remains outside the acceptance requirements.

Native append, visible edit, unused edit, and same-ID replacement create no rows, cells, or DOM mounts in this fixed-window workload.
Their accessor counts are zero, one, zero, and eight respectively.
All measured correctness, construction, and disposal gates pass.
The report is `/tmp/table-native-qualification-matched.json`.

At 50,000 records, native visible edits take 0.4–0.5 ms, compared with 24.5–24.8 ms for array.
The deep-bridge edit range is 159.7–180.3 ms.
Native filtering takes 59.2–72.2 ms, compared with 19.2–25.6 ms for array.
Sparse refresh takes 109.1–111.5 ms for native and 82.7–87.3 ms for array.
These comparisons show the remaining full-input cost of active features.
They do not establish a controlled-host latency pass or a production regression.

Search and facets pass nine samples, with three repetitions at each dataset size.
The feature and grouping reports use Chromium 153.0.8010.12.
Each sample compares 17 states with independent results, for 153 state comparisons.
Grouping passes nine samples with 18 states each, for 162 state comparisons.
The reports are `/tmp/table-native-qualification-features.json` and `/tmp/table-native-qualification-grouping.json`.

At 50,000 records, the facet workload retains 78.140 MiB with its controls open.
Closing those controls leaves 37.367–37.368 MiB.
Disposal leaves 3.860–3.861 MiB.
The first opening performs 100,000 accessor reads and 50,000 unique-value reads without replacing display resources.
An active score filter with three facets performs 150,000 predicate reads.
The search workload reaches 486,299 accessor reads.
Closed-facet edits and unrelated updates perform no measured work.
These counts distinguish lazy closed controls from active full-input scans.
The [computed accessor profile](#computed-accessor-profiling-on-2026-10-06) measures repeated filtering and search work.
Sharing aggregate work remains outside that fixture.

At 50,000 records, nested grouping retains 49.355–49.356 MiB.
One group per record retains 56.332 MiB, compared with 24.563 MiB after grouping is disabled.
An amount edit reads 2,751 amounts for two aggregates without reading grouping fields or creating rows or cells.
The group-sort workload reads 72,291 amounts for 164 aggregates and 315 comparisons.
Visible summaries and aggregate ordering still perform separate work.

The virtualized workload passes nine samples with 43 states each, for 387 independent state comparisons.
This report uses Chromium 153.0.8010.12.
Each sample also traverses the result for 90 animation frames.
At 50,000 records, the peak remains 22 mounted rows.
Scrolling creates 1,777 newly visible views and 8,885 cells.
It reads exactly 8,885 cell values without repeating filtering or sorting.
Loaded heap ranges from 28.701 to 28.702 MiB.
Disposed heap ranges from 5.294 to 5.296 MiB, including the page baseline.
The report is `/tmp/table-native-qualification-virtualized.json`.

The WAMN workload passes its 18 integration cases and synthetic 1,000, 10,000, and 50,000-record workloads.
Its report is `/tmp/table-native-qualification-wamn.json`.
The actual loaded and disposed snapshots reside under `/tmp/table-native-qualification-wamn-heaps`.
The runner requires zero classified records, stores, owners, computations, views, cells, and virtualizers after disposal.
All those disposal assertions pass.

Actual matched heaps use Chromium 153.0.8010.12 and include empty, loaded, and disposed captures at all three dataset sizes.
Compressed snapshots and parsed summaries reside under `/tmp/table-native-qualification-matched-heaps`.
Each `.summary.json` file preserves the classified counts and retaining paths for its snapshot.
Native retains 40 row views, 320 cells, 525 computations, and 771 owners at every size in this fixed-window workload.
It retains no classified table-core rows.
All classified application categories reach zero after disposal in both native and array captures.

At 50,000 records, native retains 53,103 store targets and 151,463 links.
The parser counts 50,603 physical record objects, compared with 50,600 for array.
Retaining paths include fixture history, Solid previous-property values, and parent metadata for nested stores.
Two extra objects belong to row-zero metadata and one to an appended record's previous value.
The focused row-zero probe records these paths in `/tmp/table-native-row-zero-paths.json`.
Those objects do not constitute a second writable record dataset.
The array capture retains 50,100 table-core rows and 19,520 cached cells.
These counts explain the different runtime structures rather than imposing equal heap sizes.

The actual facet captures retain 50,000 records, 40 views, and 160 cells while controls remain open.
Closing the controls reduces tracked links from 400,784 to 758.
Computations fall from 318 to 315, while 447 owned scopes remain stable.
The disposed capture contains zero classified application resources.

Nested groups retain 222 membership nodes, 21 group views, and 84 cells in the captured workload.
One group per record creates 50,000 membership nodes but only 40 visible group views and 160 cells.
Disabling grouping releases all membership nodes and retains 40 visible record views.
The virtualized capture retains 15 views, 75 cells, and one virtualizer.
It also retains 1,808 geometry entries for previously visited offsets.
Those entries describe measurements rather than mounted display objects.
The WAMN capture retains 19 views, 114 cells, one virtualizer, and 46 geometry entries at 50,000 records.

The full capture set contains 31 actual snapshots with parsed retaining paths.
The evidence index is `/tmp/table-native-qualification-evidence.json`.
Compressed snapshots reside in `/tmp/table-native-qualification-{matched,features,grouping,virtualized,wamn}-heaps` and `/tmp/table-native-qualification-lifecycle`.
All disposed or cleaned captures contain zero classified application records, Table resources, Solid graphs, groups, and virtualizers.
The lifecycle report is `/tmp/table-native-qualification-lifecycle/lifecycle.json`.
Its 12 cycles each load 50,000 records and dispose 2,499 created views.
Each cleaned page retains 31 baseline DOM nodes.
Cleaned heap moves from 3.53 to 3.81 MiB across the cycles without classified application resources.

These results qualify the measured ownership and disposal boundaries.
The [computed accessor profile](#computed-accessor-profiling-on-2026-10-06) records the later comparison of temporary reuse and combined scans.
Query page and deep-bridge allocation probes remain separate work under `table-rt3.2`.
The current native source contract does not require an implicit Query bridge.

## Native virtualized grid

The virtualized example reads one Solid record store and passes display keys to TanStack virtual-core.
Virtual-core owns geometry, not records, row models, or table feature state.
Only the rendered window and explicit pinned rows create row and cell views.
Columns use ordinary horizontal scrolling. The user excludes horizontal virtualization.

The workload uses five columns at 1,000, 10,000, and 50,000 initial records.
It exercises 43 data and geometry states, browser editing and keyboard input, and 90 scripted scroll frames.
The Node runner computes expected records separately, so its oracle does not allocate browser store metadata.
Its correctness gates include complete displayed sequences, every visible cell, measured heights, sticky alignment, and scroll-position preservation.

The first implementation estimated every record at 48 pixels.
The rendered description wrapped and produced a common height of 53 pixels.
Each mismatch forced virtual-core to update later row positions.
Hidden sample rows now measure the common record and group heights for the current column widths and font.
Visible rows still receive individual measurements, including expanded details.
Before calibration, source runs spent 5.4–7.2 seconds in script during the 50,000-row scroll.
One calibrated source run spent 399 milliseconds in the same 34-state workload.
Host load differed, so this comparison identifies a correction cost without establishing a reliable speedup ratio.
The final workload adds editing and anchor scenarios and requires separate results.

Scroll-position tests also exposed two defects in the first binding.
A previous backward scroll suppressed compensation when a detail row above the viewport collapsed.
Column resizing could restore the position before the browser received the new scroll extent.
The binding now compensates measured rows above the unobscured viewport and restores surviving keys after the new layout commits.

The final code passes three source cases and nine built-entry repetitions across the three dataset sizes.
A development case and two readable heap runs also pass the complete workload.
The unit suite passes 107 tests, including explicit listener cleanup with a retained DOM element.
Package types, example types, lint, builds, export imports, and SSR rendering pass separately.

The built-entry runs measured these heaps after garbage collection:

| Initial records | Loaded grid     | Grid disposed |
| --------------- | --------------- | ------------- |
| 1,000           | 4.74–4.76 MiB   | 3.25–3.27 MiB |
| 10,000          | 8.80–8.83 MiB   | 3.51–3.52 MiB |
| 50,000          | 27.78–27.79 MiB | 5.27 MiB      |

The empty page measured 1.19–1.21 MiB.
At 50,000 records, disposal leaves about 4.08 MiB above that baseline, within the existing 5 MiB gate.
These totals include browser interaction tooling, source metadata, and the complete example.
They do not measure raw records and are not comparable with the earlier eight-column array workload.
Unlike the initial 34-state run, the final editing sequence activates full scans after record replacement.
Those scans create source store metadata for every loaded record.

Both readable snapshots show the same bounded display graph:

| Object category                | 10,000 initial records | 50,000 initial records |
| ------------------------------ | ---------------------- | ---------------------- |
| Data records                   | 9,997                  | 49,997                 |
| Store targets                  | 10,007                 | 50,007                 |
| Record views                   | 15                     | 15                     |
| Record cells                   | 75                     | 75                     |
| Solid computations and effects | 1,286                  | 1,286                  |
| Solid owner scopes             | 217                    | 217                    |
| Solid dependency links         | 2,277                  | 2,277                  |
| Solid property signals         | 155                    | 155                    |
| Virtualizer instances          | 1                      | 1                      |
| Virtual geometry items         | 1,809                  | 1,808                  |

There is one record collection and no table-core row machinery.
The source retains metadata for previously read fields while its records remain live.
Virtual geometry contains keys, indexes, positions, and sizes, not copied records.
Full disposal releases every classified data record, view, cell, store target, virtualizer, and Solid graph node in both snapshots.

Across all cases, the largest mounted window contains 22 row views.
An unused-field edit performs zero accessor reads or display allocations.
A visible name edit performs one accessor read and creates no row or cell views.
Scrolling with active filtering and sorting reads only newly mounted cells.
The 50,000-row scroll creates 1,777 row views and 8,885 cells over time, with exactly 8,885 accessor reads.
Those are cumulative constructions across 90 frames, not simultaneously retained objects.

At 50,000 records, scroll script time ranges from 334 to 709 milliseconds across the three final built-entry runs.
The pooled frame p95 is 20.8 milliseconds. The 1,000-row and 10,000-row values are 19.5 and 20.5 milliseconds.
Host load ranges from 3.33 to 6.57 during those runs.
An earlier run during higher host load produced much larger timings with the same allocation counts.
Timing targets remain advisory until qualification on a controlled host.

Development diagnostics contain three `HUGE_FAN_IN` warnings from full sort, filter, and group scans.
There are no lifecycle, forbidden-scope, or untracked-read diagnostics in the final run.
Issue `table-gd3.1.5` retains profiling of complete scans and their dependencies.

Final matrix results reside in `/tmp/table-native-virtualized-final-source.json` and `/tmp/table-native-virtualized-final-distribution.json`.
Development results reside in `/tmp/table-native-virtualized-final-development.json`.
The 50,000-row snapshots and parsed summaries reside in `/tmp/table-native-virtual-final-heaps/`.
Their run metadata resides in `/tmp/table-native-virtualized-final-heaps.json`.

### Event retention

Real editing input exposed a separate retention problem in Chromium 153.0.8010.12 with Solid rc.13.
At 10,000 initial records, the disposed heap remained at 8.32 MiB, compared with a 1.21 MiB empty page.
The snapshot still contained 9,997 records, 16 row views, 80 cells, and one virtualizer.
Those counts include one appended record and four removals.

Strong retaining paths passed through V8's `fast_template_instantiations_cache`, event accessor descriptors, and Solid's delegated `currentTarget` getter context.
The retained InputEvent and MouseEvent objects reached detached elements, their handlers, and the source store.
This diagnosis describes the observed browser and prerelease combination. It does not establish behavior in other engines.

The example now attaches native listeners through ref callbacks and removes them through `onSettled` cleanup.
The matched disposed heap fell to 3.54 MiB.
Its actual snapshot contains no data records, row views, cells, virtualizer, store targets, or classified Solid graph nodes.
The remaining classified objects are JavaScript Maps and V8 allocation templates.
The fix changes only the example. It does not patch dependencies or alter the native table package.

The original capture resides in `/tmp/table-native-virtual-diagnostic-heaps/`.
The final matching capture after cleanup resides in `/tmp/table-native-virtual-owned-events-heaps/`.
Its run metadata resides in `/tmp/table-native-virtualized-owned-events.json`.
Issue `table-gd3.6.4` tracks an isolated reproduction and removal of the workaround after an upstream resolution.

## Native grouping

The grouping workload uses four columns and at most 40 displayed rows or groups.
It exercises nested groups, expansion, aggregates, sorting, edits, refreshes, manual processing, and scrolling.
Nine source cases and nine built-entry cases each passed eighteen independently evaluated states.
The cases cover 1,000, 10,000, and 50,000 records, with three repetitions at each size.

The built-entry runs measured these heaps after garbage collection:

| Initial records | Nested groups   | One group per record | Grouping disabled | Table disposed |
| --------------- | --------------- | -------------------- | ----------------- | -------------- |
| 1,000           | 3.10–3.11 MiB   | 3.34–3.35 MiB        | 2.71–2.72 MiB     | 1.91 MiB       |
| 10,000          | 10.92 MiB       | 12.57 MiB            | 6.40 MiB          | 2.02 MiB       |
| 50,000          | 47.07–47.08 MiB | 55.36–55.37 MiB      | 23.63 MiB         | 2.90 MiB       |

The empty page measured 1.18 MiB.
These totals include the source store, rendering, feature history, and correctness harness.
This workload differs from the earlier eight-column baseline and the three-facet workload.
It does not measure raw input data alone.

Actual snapshots at 50,000 records explain the different states:

| Object category                | Nested groups | One group per record | Grouping disabled |
| ------------------------------ | ------------- | -------------------- | ----------------- |
| Data records                   | 50,000        | 50,000               | 50,000            |
| Group membership nodes         | 222           | 50,000               | 0                 |
| Group views                    | 21            | 40                   | 0                 |
| Group cells                    | 84            | 160                  | 0                 |
| Record views                   | 0             | 0                    | 40                |
| Record cells                   | 0             | 0                    | 160               |
| Solid property signals         | 200,043       | 150,061              | 219               |
| Solid dependency links         | 250,420       | 150,801              | 637               |
| Solid computations and effects | 261           | 470                  | 310               |
| Solid owner scopes             | 238           | 447                  | 447               |

The nested snapshot includes one null group created during the edit sequence.
Its 21 visible root groups aggregate all loaded records.
The distinct-group snapshot reads IDs for membership and amounts for only 40 visible groups.
It therefore retains fewer active value dependencies despite its larger membership graph.
The heap difference between these states is not a standalone cost per group.

Membership nodes contain paths, counts, child keys, and leaf IDs.
They create no Solid owners and contain no copied records or table-core rows.
The 50,000 nodes themselves occupy 1.53 MiB before their strings, arrays, and lookup storage.
This figure is direct object size, not exclusive retained size.
Visible group cells own lazy aggregate memos. Their count follows the viewport rather than the number of groups.

Disabling grouping releases every membership node and almost all active property signals and dependency links.
The live source retains its records, proxies, store targets, and metadata for previously visited fields.
Full table disposal leaves no data records, group nodes, row views, cells, store targets, or classified Solid nodes.
The remaining categories contain 18 JavaScript Maps and V8 allocation templates from loaded code.

At 50,000 records, the measured amount edit reads no grouping fields and creates no views or cells.
It reads 2,751 amounts across the affected visible record and two visible ancestor aggregates.
Unused-field edits perform zero table or display work.
Hidden group levels do not read aggregate sort values until a consumer requests those child groups.
Active grouping still scans grouping keys after a membership-field edit.
Group sorting and visible aggregates can repeat reads of the same amounts.
Issue `table-gd3.1.5` retains profiling of these scans and shared-work alternatives.
The shared host does not establish a reliable latency budget.

Results reside in `/tmp/table-native-grouping-source.json` and `/tmp/table-native-grouping-distribution.json`.
Actual snapshots and parsed summaries reside in `/tmp/table-native-group-heaps/`.
The snapshot run metadata resides in `/tmp/table-native-group-heaps.json`.

The final composition adds one `manualProcessing` flag and authoritative external totals.
The package passes 95 tests, including a WAMN-shaped load fixture with completeness, busy state, caps, and generation rejection.
Nine further source cases and nine built-entry cases pass the same grouping workload through this unified flag.
Six built-entry cases also pass the original native allocation and update gates.
Results reside in `/tmp/table-native-processing-source.json`, `/tmp/table-native-processing-distribution.json`, and `/tmp/table-native-grouping-regression.json`.

## Native search and facets

The next implementation adds visible-column search, lazy facets, and explicit placement for missing sort values.
Its feature workload differs from the earlier eight-column comparison.
It uses four columns, 40 visible rows, and three facet controls over color, score, and a list of tags.
The controls display color counts, numeric bounds, and distinct tag counts.

Nine source-browser cases and nine built-entry cases each passed seventeen feature states.
The states include search, visibility changes, edits, removal, append, sorting, and local/manual switches.
The harness compares complete row order, rendered cells, and facet output with independent calculations.
Unused-field edits and offscreen facet-field edits with closed controls perform zero accessor, filter, comparator, or display work.
The package passes 75 tests, including fourteen new tests for these features.

The built-entry runs measured these JavaScript heaps after garbage collection:

| Initial rows | Facets open     | Facets closed | Table disposed |
| ------------ | --------------- | ------------- | -------------- |
| 1,000        | 3.70 MiB        | 2.91 MiB      | 1.85 MiB       |
| 10,000       | 17.02–17.03 MiB | 8.99–9.00 MiB | 2.07 MiB       |
| 50,000       | 78.10–78.11 MiB | 37.33 MiB     | 3.83 MiB       |

The empty page measured 1.18 MiB.
These measurements include the source store, feature history, rendering, and the correctness harness.
They do not measure raw arrays alone and do not replace the earlier eight-column comparison.

Actual 50,000-row snapshots explain the open-to-closed difference.
With facets open, the graph contains 300,098 store property signals and 400,783 dependency links.
After closing the controls, those counts fall to 337 signals and 757 links.
The open signals occupy 24.04 MiB, and their links occupy 15.29 MiB before related storage.
Both states contain exactly 50,000 data records, 40 row views, and 160 cells.
Neither state contains table-core rows or a second dataset.

Closing facets releases their active tracking graph, but the caller's live store keeps metadata for previously visited records and arrays.
The closed snapshot includes 50,004 store targets, about 100,000 proxies, and their property and element storage.
The proxies represent records and nested tag arrays.
Object property tables occupy 9.23 MiB, store targets occupy 5.15 MiB, and V8 property arrays occupy 4.97 MiB.
These category sizes are direct object storage, not exclusive retained trees.

After table disposal, the snapshot contains no data records, row views, cells, store targets, property signals, or dependency links.
Browser code, runtime structures, and allocation templates remain.
The readable diagnostic bundle reports 78.12 MiB open, 37.35 MiB closed, and 3.84 MiB disposed.

The implementation retains full scans for active filters and facets, plus full sorting for relevant sort edits.
It adds no owner or memo for each loaded record.
Opening all three facets performs three scans of the source.
Changing a facet's own filter preserves its counts without another scan.
Sort-state changes preserve the filtered sequence, and closed controls release their dependencies through lazy memos.

At 50,000 rows, the source runs measured first facet activation between 274 and 426 ms on this shared host.
These times remain advisory.
Issue `table-gd3.1.5` retains profiling of activation, sparse refresh, shared accessor work, and alternatives to repeated full scans.
Correctness and dependency counts support this implementation, but these runs do not establish an interaction latency budget.

Raw results reside in `/tmp/table-native-features-source.json` and `/tmp/table-native-features-distribution.json`.
The open, closed, and disposed snapshots reside in `/tmp/table-native-facet-heaps/`.
Their metadata resides in `/tmp/table-native-facet-heaps.json`.

## Native package foundation

The native engine now resides in `src/native-table.ts` and exports through `@tanstack/solid-table/native`.
Its built browser, server, Solid, and declaration entries import only Solid.
It adds visible cell contexts, native view state, controlled callbacks, and lazy source and display indexes.
The following results describe this foundation, after the earlier prototype measurements below.

The source comparison passed 45 measured browser cases and 18 warmups.
At 50,000 initial rows, loaded heaps were 36.82–36.84 MiB for `array`, 105.22–105.23 MiB for `deep`, and 39.09–39.10 MiB for `native`.
The array baseline includes the complete table-core table. It is not raw input data alone.
The native result adds about 0.15 MiB over the earlier 38.94 MiB prototype.
Its additional visible objects and state computations explain the small increase in object counts.

Six further browser cases exercised the final built Solid entry after a column-removal fix.
The native heap measured 3.47 MiB at 1,000 rows, 10.36 MiB at 10,000 rows, and 39.09 MiB at 50,000 rows.
Every size initially mounted 40 row views and 320 cells.
A visible field edit evaluated one accessor and created zero rows, cells, or DOM mounts.
An unused field edit and an offscreen append caused no accessor work or display allocation.
Same-ID replacement evaluated eight visible accessors and preserved their existing objects and DOM nodes.

The same-page lifecycle run completed twelve mount, edit, refresh, scroll, and disposal cycles at 50,000 rows.
Each cycle created and disposed 2,499 visible row scopes over the scripted scroll.
Only 40 row scopes remained mounted at once.
The last loaded heap measured 40.08 MiB after repeated execution in that page.
The final snapshot contained:

- 40 native row views and 320 cells.
- Zero table-core rows and 34 JavaScript Maps.
- 771 Solid owner scopes and 495 computations or effects.
- 100,546 signals for tracked store properties and 151,460 dependency links.
- 50,603 data records, which matches one current dataset plus the harness's previous record references.

The owner count follows the visible rows and cells, not the 50,100 loaded records.
The added scoped cell mapping accounts for more owners than the earlier prototype.
Active filtering and sorting account for collection-wide field dependencies.
The unused source and display index maps remain lazy.

After final disposal, the snapshot contained zero data records, native row views, cells, or Solid tracking nodes in those categories.
The cleaned heap measured 3.73 MiB, versus 3.49 MiB after the first cycle and 1.24 MiB before the run.
The browser retained 29 DOM nodes after every cleanup, including the static page.
No rendered row elements remained. Browser errors and warnings were empty.

The remaining heap includes browser code, runtime structures, and Playwright's injected selector helpers.
The lifecycle harness uses those helpers to count remaining row elements.
The ordinary benchmark does not inject that selector helper and reports about 1.69 MiB of cleanup growth.
Snapshot totals also include native backing storage, so they differ from Chrome's JavaScript heap counter.

The parser now separates V8 allocation templates from live instances.
An allocation template is an internal object that describes new allocations.
The cleaned snapshot initially appeared to contain one cell and several Solid nodes.
The cell and node-shaped objects led through `AllocationSite` and `transition_info` in V8 code metadata.
The parser also excludes the `TargetShape` constructor metadata from store instance counts.
The corrected categories contain 91 templates and no live table or Solid objects.
Historical category counts below include a few such templates, which do not change the earlier architecture diagnosis.

Source results reside in `/tmp/table-native-foundation-comparison.json`.
Built-entry results reside in `/tmp/table-native-foundation-distribution.json` and include asset hashes.
Lifecycle results and actual loaded and cleaned snapshots reside in `/tmp/table-native-foundation-lifecycle/`.
The package passes 61 unit tests, source and benchmark types, ESLint, package builds, export audits, and server rendering.

Timing remains advisory because this host runs other development loads.
First filter activation and sparse refresh remain slower than the array baseline in this workload.
Beads issue `table-gd3.1.5` tracks that performance work.
The native foundation meets its ownership and correctness gates. It does not yet implement the complete WAMN grid.

## Captured workload

The capture uses Chromium 153.0.8010.12 and Solid 2.0.0-rc.13.
It uses a production bundle with readable function names and source maps.
Each mode starts with 50,000 records, eight columns, and a window of 40 rows.
The workload appends 100 records, edits fields, replaces one record, filters, sorts, refreshes, and scrolls.
The capture settles pending work and forces garbage collection twice.

Chrome reports 36.84 MiB for `array`, 105.22 MiB for `deep`, and 150.44 MiB for `keyed`.
The `keyed` mode still uses table-core. It is a rejected architecture baseline.
The `array` mode runs under Solid 2. It does not measure the Solid 1 runtime.
Earlier timing runs used an extra memo per record. Their 161–166 MiB measurements describe that earlier implementation.

Raw captures and metadata reside in `/tmp/table-solid-heaps/`.
Each `.heapsnapshot.summary.json` file contains object categories and sample paths from roots.
The snapshot files are large diagnostic artifacts and remain outside Git.

## Measured allocations

The array and keyed captures both contain 50,100 table-core rows.
The keyed capture contains 50,603 objects with the complete raw-record shape, versus 50,601 in the array capture.
These counts exclude Solid metadata objects that happen to share some property names.
The results do not show a second complete dataset copy.
The harness retains a small number of previous records through its initial data reference and update history.

The keyed capture contains these additional structures:

- 100,224 JavaScript Maps, versus 24 in the array capture.
- 200,684 Solid signals for tracked store properties.
- 402,583 Solid dependency links, versus 54 in the array capture.
- 68,033 Solid computations and effects, versus 456 in the array capture.
- 50,504 Solid owner scopes, versus 403 in the array capture.
- 50,103 ordinary Solid signals, mostly indexes from the full collection mapping.

The prototype creates two Maps per row for values and unique values.
Its core rows still contain `_valuesCache` and `_uniqueValuesCache` objects.
Thus, the implementation duplicates cache structures even when one layer remains unused.

Table row objects and their direct property storage occupy 20.45 MiB in the keyed capture, versus 3.44 MiB in the array capture.
The prototype adds getters and methods to each core row, which changes its storage shape.
Maps and their direct backing tables occupy 8.93 MiB in the keyed capture.
Store property signals occupy 16.08 MiB. Dependency links occupy 15.36 MiB.
Computations and effects occupy 8.32 MiB. Owner scopes occupy 3.28 MiB.
These figures omit related closures, contexts, and other reachable objects.

These category sizes sum object sizes and direct storage only.
They are not retained sizes for complete ownership trees.
The parser identifies runtime structures from the installed Solid rc.13 shapes.
It excludes weak references and conditional WeakMap edges from its displayed paths.
Some objects consequently lack a displayed root path.

## Why the objects remain

The model retains its row array, which retains every core row.
Each row retains its `getValue` closure and the two Maps in that closure.
The values Map retains memo accessors and their Solid computations.
Each row also retains its reactive index accessor.
These paths remain valid after the renderer removes that row from the viewport.

Core cell caches retain cells for previously visited rows.
The keyed capture contains 19,968 cells, although only 320 cells are visible.
Virtualizing the DOM alone does not bound these caches.

Store proxies retain metadata for accessed properties.
Active filtering and sorting read scores across the collection, so they need collection-wide dependencies.
The prototype adds per-row value memos between those properties and the feature computations.
The new design can remove that extra layer for direct field access.

The harness also exposes its inspection API through `window.benchmark`.
The original capture script retains a DevTools handle to this same API.
That handle provides a shorter displayed root path, but the window already owns the API and live table.
The capture script now releases the extra handle before subsequent measurements.
Loaded snapshots do not establish a disposal leak.

## Architecture constraints

The native prototype must read one caller-owned Solid store.
Filters and sorting derive ordered IDs through Solid computations.
Direct cell access reads the store in the consuming Solid scope.
Computed columns can use measured, explicitly owned memos when sharing their results reduces work.

The native path must avoid these structures:

- table-core row, state, and cache machinery.
- An owner and index signal for every loaded row.
- Permanent cell objects for every row visited during scrolling.
- Dirty-row flags or manual cache invalidation.
- Mandatory deep snapshots or a second writable dataset.

The initial parity target was an agent assumption.
The user clarified that native tracking can require more memory than ordinary arrays.
The product gate requires explained overhead, no duplicate dataset, bounded display resources, and correct disposal.
Use the array-based table as a measured reference rather than an absolute ceiling.
The earlier limit of twice the deep-bridge heap is retired because it permits the rejected overhead.
Timing results remain advisory on this shared development host.

## Native prototype result

The replacement module, `native-table.ts`, imports only Solid.
It derives IDs and reads records directly without constructing table-core rows.
The first version kept IDs in a store array and used 49.17 MiB in one browser sample.
Moving ordered IDs to a signal reduced the loaded heap to 38.94 MiB.
The record data remains in one Solid store.

The native snapshot resides at `/tmp/table-native-heaps/native.heapsnapshot`.
Chrome reports 38.95 MiB for that readable production capture.
It contains no objects with the core Row shape.
It contains 40 native row views, 403 owner scopes, 451 computations and effects, and 21 Maps.
The owner and computation counts now follow the visible window rather than the complete collection.

The remaining collection-wide reactive structures include 100,531 property signals and 151,360 dependency links.
Their object sizes total 8.05 MiB and 5.77 MiB respectively.
Store targets occupy another 5.47 MiB.
Filtering tracks record lookup and score reads across the dataset.
Sorting tracks those same inputs for the filtered result in a separate computation.
These dependencies preserve field updates without dirty flags or manual invalidation.

The repeated production run contains 45 measured samples after 18 warmups.
It compares array, deep, and native modes at 1,000, 10,000, and 50,000 initial records.
Raw results reside at `/tmp/table-native-comparison.json`.
All complete row sequences, visible cell values, and native allocation assertions pass.
At 50,000 records, loaded heap ranges are 36.82–36.83 MiB for array, 105.22–105.23 MiB for deep, and 38.94 MiB for native.
Native cleanup leaves 1.67–1.68 MiB above the empty-page measurement, within the initial disposal budget.

The native renderer initially creates 40 row views and 320 cells at every tested dataset size.
A visible score edit evaluates one accessor and creates no rows, cells, or DOM mounts.
An unused-field edit evaluates no accessors, filters, or comparators.
An offscreen append creates no display objects.
Same-ID replacement reevaluates the eight visible accessors and retains the DOM nodes.

At 50,000 records, median update times are:

- Field edit: array 28.6 ms, deep 202.2 ms, native 0.5 ms.
- Append: array 72.5 ms, deep 254.7 ms, native 40.4 ms.
- First filter activation: array 23.9 ms, deep 39.0 ms, native 68.8 ms.
- Sort activation: array 44.9 ms, deep 50.9 ms, native 25.1 ms.
- Edit with active filter and sort: array 98.9 ms, deep 233.6 ms, native 32.9 ms.
- Sparse refresh: array 94.1 ms, deep 392.9 ms, native 120.9 ms.

Native filter activation ranges from 57.6 to 80.2 ms. Native active-feature edits range from 31.6 to 62.2 ms.
The host runs other development loads, so these timings remain advisory.
The first filter activation also creates dependencies that subsequent updates reuse.
The native design improves several operations, but its initial filter and sparse refresh remain slower than the array baseline in this run.

The native prototype removes about 74 percent of the rejected design's loaded heap.
It still exceeds the matched array baseline by about 2.12 MiB, or 5.8 percent.
That difference is expected native bookkeeping and does not block the architecture.
Bead `table-gd3.1.5` covers filter activation, refresh costs, and memory scaling with active features.
The measured prototype supports further production work. The remaining WAMN features still require implementation and qualification.

## Reproduction

From `packages/solid-table`, build the readable production bundle.

```sh
BENCH_PROFILE=1 pnpm exec vite build --config bench/vite.config.ts
```

With Playwright Chromium installed, capture the loaded heaps.

```sh
node bench/capture-heaps.mjs
```

Parse each capture from the same directory.

```sh
node --max-old-space-size=4096 bench/inspect-heap.mjs /tmp/table-solid-heaps/array.heapsnapshot
node --max-old-space-size=4096 bench/inspect-heap.mjs /tmp/table-solid-heaps/deep.heapsnapshot
node --max-old-space-size=4096 bench/inspect-heap.mjs /tmp/table-solid-heaps/keyed.heapsnapshot
```

Chrome distinguishes object size, retained size, and paths from roots in its [heap snapshot documentation](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots).
The [Solid store documentation](https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/04-stores.md) explains property tracking and reconciliation.

## WAMN integration fixture

The [fixture](./wamn/README.md) uses WAMN revision `1931d925f15e3e33ef2fc4899a8a46e96f0b4125`.
Its relevant source diff is empty.
Preparation regenerates Widget bindings and reads column metadata from WAMN's actual client plan.
The browser uses the unchanged page helpers, request encoder, response classifier, refusal messages, and cell formatter.
One Solid store owns the records. Page state holds IDs.

The final source, built-package, and development runs each pass 17 integration scenarios.
Source and built runs also pass synthetic workloads at 1,000, 10,000, and 50,000 records.
Development runs use 1,000 records and report only the two expected broad filter/sort dependency diagnostics.
The runner records each diagnostic through both the console and Solid capture, which yields four entries for two warnings.
Package validation passes 107 unit tests, types, lint, build, native import audits, and SSR.

A browser note edit reads exactly two fields: the changed note and the returned revision.
It allocates no row views or cells and preserves record identity.
The revision remains the exact decimal string above JavaScript's safe integer range.
Refresh preserves existing record identity through scalar field updates.
No deep snapshot or dirty marker connects WAMN to Table.

The final built-package measurements follow.
The exercised column includes scrolling, filtering, sorting, and draft survival.
All heap figures in this table come from `Performance.getMetrics` after garbage collection.

| Records | Before mount, MiB | After load, MiB | After exercise, MiB | After disposal, MiB |
| ------- | ----------------: | --------------: | ------------------: | ------------------: |
| 1,000   |             3.678 |           4.429 |               4.946 |               3.745 |
| 10,000  |             3.833 |           6.598 |               9.151 |               3.978 |
| 50,000  |             3.981 |          16.300 |              28.054 |               4.869 |

The growth after exercise includes reactive metadata created when filters and sorts read the whole source.
It does not represent another record collection.
The 50,000-record snapshot contains exactly 50,000 records, 50,010 store targets, 19 row views, 114 cells, and one virtualizer.
The corresponding disposed snapshot contains no classified records, store targets, owners, computations, dependency links, row views, cells, or virtualizer.
The remaining classified objects are 32 JavaScript Maps and 266 V8 allocation templates.
These counts come from actual snapshots, separate from the sampled heap measurements above.

Settled DOM states contain at most 20 rows at every tested size.
The live-view counter peaks at 36 during replacement, when Solid briefly holds the old and new windows.
Script time for the scripted exercise ranges from 24.2–25.8 ms in source and 43.6–49.9 ms in the readable package build.
These single-run timings are advisory. The readable build, compilation state, and shared host prevent a speed comparison.
The measurements do not establish a continuous-scroll frame budget.

Actual heaps exposed two retention paths that functional browser assertions missed.
The first path runs through Solid rc.13's unscheduled pending-node queue and a disposed computation.
A plain render disposer followed by `flush()` leaves that queue reachable in this fixture.
The fixture wraps the disposer in a generator-based `action()` and flushes after the action.
This schedules the drain without a record write or a dependency patch.
Bead `table-gd3.6.5` keeps the smaller reproducer and upstream removal work open.

The second path runs through a V8 allocation template, its property descriptors, and the native column's `columnDef` getter.
That getter retains an earlier table's source and reactive scopes.
The full sequence retained three earlier records and one virtualizer after the first fix.
Native Table now defines the live getter with `Object.defineProperty`, outside the object literal template.
The final snapshots show that both the earlier table and the 50,000-record workload release their records and scopes.
Bead `table-gd3.6.6` records this package fix.

Final evidence is available at these paths.

- `/tmp/table-wamn-qualified-source.json`
- `/tmp/table-wamn-qualified-distribution.json`
- `/tmp/table-wamn-qualified-development.json`
- `/tmp/table-wamn-qualified-heaps/loaded.heapsnapshot`
- `/tmp/table-wamn-qualified-heaps/disposed.heapsnapshot`
- `/tmp/table-wamn-fixture.png`

Each snapshot has a `.summary.json` sibling with classifications and retaining paths.
The runner automatically asserts one loaded record collection and zero classified table resources after disposal when heap capture is enabled.
The original queue-retention captures remain under `/tmp/table-wamn-heaps`.
The intermediate column-getter captures remain under `/tmp/table-wamn-final-heaps`.
The initial non-generator action probe produced rejected promises and is not qualification evidence.

The production WAMN DataGrid, Form behavior, generator integration, and companion dependencies remain in phase 5.
The fixture changes no WAMN checkout files and introduces no server streaming or horizontal virtualization.

## Non-virtualized editing fixture

The fixture in `bench/editing` uses plain controls and renders every matching record.
It imports neither virtual-core nor Form/UI components.
Non-virtualized editing is a supported use case. The measured subset sizes are not automatic virtualization thresholds.

The initial qualification passes twenty browser scenarios against the source entry, built package, and development runtime.
They cover keyboard entry, Tab navigation, save/cancel, draft preservation, focus races, IME composition, revision conflicts, and late responses.
The development pass reports no Solid diagnostics or browser errors.
The test browser is Chromium `151.0.7922.34`, selected through `BENCH_EXECUTABLE_PATH` from the installed cache.
This browser differs from the earlier WAMN qualification browser, so the timings are not a comparison between fixtures.

The source and built-package runs each render 25, 250, and 999 records.
Each measured note edit reads two Table cell values and creates no replacement Table row views or cells.
The record proxy keeps its identity. Editor DOM creation still allocates normal input elements and their reactive bindings.

The built-package capture uses 13.996 MiB after loading 999 records and 14.127 MiB after one edit.
The premount heap is 3.219 MiB. The disposed heap is 3.248 MiB after the additional version-retention probes.
Smaller loaded heaps are 3.389 MiB at 25 records and 5.898 MiB at 250 records.
These values include the rendered table, Solid, and the browser test tools.

The first loaded snapshot contains 1,000 record-shaped objects for 999 logical records.
The extra object contains the old values of `R0001`.
Its retaining path runs through the canonical store's `TargetShape.n.R0001.ce` property node.
The current record appears under `TargetShape.v.R0001`.
The pinned runtime's `getNode` and `slotNodeEquals` implementation explains this cached property value.
It is Solid tracking metadata, not another application-owned record collection or a Table cache.

Twenty further changes to `R0001` leave the record-object count at 1,000.
Changing `R0002` increases it to 1,001.
The harness asserts both counts rather than ignoring extra objects or assuming one physical object per logical record.

All three loaded captures contain 999 native row views, 2,997 cells, and zero virtualizers.
They contain 21,027 computations, 8,997 owners, 23,025 dependency links, and 1,005 store targets.
These display resources scale with rendered rows because this fixture does not virtualize.
After disposal, all classified records, views, cells, store targets, owners, computations, and dependency links are gone.
The remaining classified objects are 30 JavaScript Maps and 163 V8 allocation templates.

Single-run browser script work for the measured edit ranges from 1.38 to 3.06 ms in the built-package run.
The corresponding source samples range from 2.18 to 4.44 ms.
The machine runs other development loads. These samples are advisory and do not establish a response-time budget.

Raw results are `/tmp/table-editing-qualified-{source,distribution,development}.json`.
Actual snapshots and summaries are under `/tmp/table-editing-qualified-heaps`.
The snapshot names are `loaded`, `repeated-edit`, `second-record-edit`, and `disposed`.
The [fixture guide](./editing/README.md) provides reproduction commands and states the current scope.

### Zod Mini validation

The follow-up fixture uses Zod 4.6.5 through `zod/mini` for application-owned edit rules.
Twenty-one browser scenarios pass against the source entry, built package, and development runtime.
Four unit tests cover field errors, rules involving multiple fields, row errors, and parsed values in save requests.
The development run reports no browser errors or Solid diagnostics.
Module audits require Mini and reject the regular Zod implementation, Form, and the excluded UI dependencies.

The source and built-package workloads render 25, 250, and 999 records.
Mounting performs zero validations. Each measured save validates one row and reads two Table cell values.
The edit preserves the record proxy and creates no replacement Table views or cells.
After an attempted save, corrections validate only that draft again.
Zod allocates parsed values and validation errors for the edited row. It does not parse or copy the collection.

The source fixture JavaScript grows from 91,455 to 106,540 bytes.
With Node's default `gzipSync`, it grows from 32,351 to 37,199 bytes, an increase of 4,848 bytes.
These figures include Zod, validation handling, and the field-error UI. They are not an isolated Zod bundle measurement.
Zod remains a fixture development dependency and adds no import to the published Table runtime.

The built-package heap contains 14.146 MiB after loading 999 rows and 14.268 MiB after an edit.
The premount heap contains 3.375 MiB and the disposed heap contains 3.384 MiB.
The captured record counts remain 1,000 after one edit, 1,000 after repeated edits, and 1,001 after editing a second record.
Loaded captures contain 999 views, 2,997 cells, 21,027 computations, 8,997 owners, 23,025 links, and 1,007 store targets.
All classified records, views, cells, store targets, owners, computations, and links disappear after disposal.
Thirty Maps and 182 V8 allocation templates remain. Shared-host timing results remain advisory.

Raw reports are `/tmp/table-editing-zod-{source,distribution,development}.json`.
Actual snapshots and summaries are under `/tmp/table-editing-zod-heaps` with the same four snapshot names.

### Native dropdown editing

The fixture adds a Priority column with a native select editor and Zod enum validation.
Twenty-seven browser scenarios pass against source, built, and development entries in Chromium `151.0.7922.34` on Linux.
Five unit tests cover the validation adapter and controller.
The dropdown keeps native keyboard behavior, and Save or Cancel finishes the row explicitly.
Browser tests cover initial focus, keyboard selection, menu dismissal, pending saves, invalid choices, conflicts, filtering, sorting, and record identity.

The source and built-package runs render 25, 250, and 999 records.
Each workload saves a text edit and then a dropdown edit to the same record.
Each save validates one row and reads three Table cell values as the row returns from editors to display controls.
Those three reads cover the three editable fields, regardless of record count.
Neither save replaces Table row views or cells, and the canonical record proxy retains its identity.

The table now renders four data columns instead of three. The additional column increases display and reactive resources for every rendered record.
The built-package heap uses 16.914 MiB after loading 999 records and 17.082 MiB after both edits.
The premount heap uses 3.449 MiB and the disposed heap uses 3.501 MiB.
This workload includes an extra column and an extra save, so these values do not isolate the cost of a select control.

The loaded snapshot contains 999 views, 3,996 cells, 27,024 computations, 10,996 owners, 30,019 dependency links, and 1,007 store targets.
Record-object counts remain 1,000 after both saves and after 20 further changes to the same record.
Editing a second record increases the count to 1,001, consistent with the existing bounded cached-value diagnosis.
Disposal removes all classified records, views, cells, store targets, computations, owners, and dependency links.
Thirty Maps and 192 V8 allocation templates remain. There are no virtualizer instances.

Raw reports are `/tmp/table-editing-select-{source,distribution,development}.json`.
Actual snapshots and summaries are under `/tmp/table-editing-select-heaps` with the same four snapshot names.
The browser reports record host load. Timings remain advisory on this shared machine.

### Collapsed row drafts

Leaving a row now closes its editors and preserves changed draft values with cell markers.
Thirty-one browser scenarios pass against source, built, and development entries in Chromium `151.0.7922.34` on Linux.
The runs report no browser errors or Solid diagnostics. The five validation unit tests also pass.
Focus movement during row cleanup defers the draft update until that cleanup ends.

The source and built runs render 25, 250, and 999 records. The development run renders 25 records.
Each text or dropdown save reads three cell values and applies the schema to one row.
Closing a changed draft reads six cell values at each size, with no schema application or save request.
These operations replace no Table row views or cells.
The harness measures closing and reopening after the existing record snapshots to preserve the earlier workload for comparison.

The built heap uses 23.636 MiB after loading 999 records and 23.827 MiB after both saves.
The premount heap uses 3.558 MiB. The disposed heap uses 3.593 MiB after the additional draft exercise.
The loaded heap exceeds the previous native dropdown result by 6.722 MiB.
The extra bindings for draft values, markers, disabled controls, and persistent errors increase reactive display resources across the rendered table.
This cost belongs to the fixture UI. The Table engine and record store implementation do not change.

The snapshot contains 47,004 computations and 53,995 dependency links, compared with 27,024 and 30,019 in the earlier fixture.
It retains 999 row views, 3,996 cells, 10,996 owners, and 1,006 store targets.
The record counts remain 1,000 after both saves and after 20 further updates, then reach 1,001 after another record changes.
Disposal removes all classified records, views, cells, store targets, computations, owners, and dependency links.
Thirty Maps and 196 V8 allocation templates remain.

Raw reports are `/tmp/table-editing-collapse-{source,distribution,development}.json`.
Actual snapshots and summaries are under `/tmp/table-editing-collapse-heaps` with the same four snapshot names.
The served preview also passes a browser smoke test for two collapsed drafts with separate cell markers.
Timings remain advisory on this shared machine.

### Optional global save

The fixture now offers Per row and Whole table save modes.
Thirty-eight browser scenarios pass against source, built, and development entries in Chromium `151.0.7922.34` on Linux.
All runs report zero browser errors and Solid diagnostics. Ten controller and validation unit tests pass.
The tests cover filtered drafts, validation before any request, partial failures, retries, concurrency, queued revisions, new drafts, and disposal.

The source and built runs render 25, 250, and 999 records. The development run renders 25 records.
Saving three collapsed drafts applies the schema three times, sends three requests, and reads 18 Table cell values at every size.
This includes the displayed draft values and markers. The earlier open-editor save workload still reads three values per row.
Record identity remains stable, with no replacement row views or cells.
The batch prepares changes only for captured drafts and limits concurrent requests to four.

The built fixture uses 23.708 MiB after loading 999 records and 23.893 MiB after both per-row saves.
The premount heap uses 3.591 MiB. After the global save and disposal, the heap uses 3.670 MiB.
The existing snapshot sequence precedes the new global workload to preserve the earlier record-retention comparison.
The harness then saves three collapsed drafts through Save all before disposal.

The loaded snapshot contains 47,015 computations, 54,007 dependency links, 10,996 owners, and 1,006 store targets.
It retains 999 row views and 3,996 cells.
Record counts remain 1,000 after both per-row saves and repeated updates, then reach 1,001 after another record changes.
Disposal after the global workload removes all classified records, views, cells, store targets, computations, owners, and dependency links.
Thirty Maps and 208 V8 allocation templates remain.

Raw reports are `/tmp/table-editing-global-{source,distribution,development}.json`.
Actual snapshots and summaries are under `/tmp/table-editing-global-heaps` with the same four snapshot names.
The served preview also passes a two-row Save all smoke test. Timings remain advisory on this shared machine.

### Configurable column filters and search

The Table fixture defaults to external column filters and offers optional header filters and global search.
The parent controls filter placement, header sorting, and global search independently.
Both filter presentations read the same Table state. Hiding a control preserves its value.

Fifty-one browser scenarios pass against source, built-package, development, and live Vite entries in Chromium `151.0.7922.34` on Linux.
The source and built runs render 25, 250, and 999 records. The development and live runs render 25 records.
The scenarios cover combined filters, external changes, composition input, empty results, hidden columns, disabled local processing, drafts, and global save.
A pointer regression test makes sure that closing an editor does not move the next row before its click arrives.
All 120 package unit tests pass, including filter and sort identity, composed state updates, and unchanged result IDs.

At these three sizes, five Name filter changes read 125, 1,250, and 4,995 cell values.
Five global-search changes with that filter active read 250, 2,500, and 9,990 values.
Each combined pass reads Name for its column filter and again for global search.
Every record matches these queries. The changes create no replacement row views or cells and run no validation or save request.
The existing text, dropdown, collapse, and three-row Save all workloads retain their counts of 3, 3, 6, and 18 reads.

The filter still scans candidate records and allocates a result ID array.
An ordered ID comparison prevents unchanged results from notifying row-list subscribers. It does not copy records or remove the scan.
Updating one column filter preserves the filter array and unaffected entries in the Solid store.
Filter values retain replacement semantics, including opaque application objects.
Multi-column sorting also preserves its array and unaffected entries when a sort changes.

The live run records known broad-dependency diagnostics from filtering and sorting. It records timing diagnostics separately as advisory.
The runner permits broad-dependency diagnostics only from those two memos and rejects other non-timing diagnostics.
It reports no browser errors, unstable memo results, or store replacement warnings.
Bead `table-gd3.1.5` retains the filter profiling work. Timings remain advisory on this shared machine.

The built fixture uses 24.024 MiB after loading 999 records and 24.207 MiB after both per-row saves.
The premount heap uses 3.844 MiB. After the editing and filtering workloads, disposal reduces the heap to 3.898 MiB.
These figures include the controls and the editing UI. They do not isolate the cost of filtering.
The record snapshots precede the filter workload to preserve the earlier retention comparison.

The loaded snapshot contains 47,143 computations, 54,150 dependency links, 11,010 owners, and 1,006 store targets.
It retains 999 row views and 3,996 cells.
Record counts remain 1,000 after both per-row saves and repeated updates, then reach 1,001 after another record changes.
Disposal removes all classified records, views, cells, store targets, computations, owners, and dependency links.
Thirty Maps and 273 V8 allocation templates remain.

Raw reports are `/tmp/table-filters-{source,distribution,development,live}.json`.
Actual snapshots and summaries are under `/tmp/table-filters-heaps` with the same four snapshot names.

### Grouping controls and summaries

The Table fixture adds ordered grouping levels, independent group ordering, per-level expansion, and whole-table expansion controls.
Priority and Name initial demonstrate application-defined grouping values. Filled and distinct note counts demonstrate configurable summaries.
Group counts and summaries follow the active filters. Drafts use saved values for membership and remain available inside collapsed groups.
Show expands only the draft's ancestor path. A save that enters a collapsed group moves focus to its visible expand control.
Later focus movement takes precedence over a completed save.

All 122 package unit tests pass.
Sixty Chromium scenarios pass against source, built-package, development, and live Vite entries on Chromium `151.0.7922.34` for Linux.
They cover nested grouping, reordering, keyboard expansion, summaries, group ordering, filters, empty groups, hidden columns, pending saves, validation, and global save.
The source and built workloads render 25, 250, and 999 records. Development and live workloads render 25 records.

Initial two-level grouping reads 50, 500, and 1,998 grouping values at those sizes.
Repeated expansion and collapse read no grouping values. They release hidden descendant views and recreate views when those descendants become visible again.
Removing and restoring an expanded layout retains surviving record views and creates group views for the restored groups.
Each membership rebuild reads two grouping values per record.

Changing one note reads 49, 499, and 1,997 note values.
Each ancestor summary scans the Normal group, which contains `size - 1` records, including the changed record.
The displayed row reads its note once. The separate one-record High group does not change.
The edit reads no grouping values and creates no replacement row views, group views, or cells.
The unchanged text, dropdown, collapse, and three-row Save all workloads retain their counts of 3, 3, 6, and 18 reads.
Timings remain advisory because the host runs other development workloads.

Grouping and expansion update existing Solid store containers.
Group sorting captures its scalar configuration fields before updating store entries, so reordered entries cannot overwrite later input values.
An ordered key comparison suppresses repeated equivalent root and display lists after edits within the same group.
Membership still rebuilds when a grouping field changes. Group and summary calculations still scan their relevant record IDs.
The live runner records broad-dependency diagnostics only for the identified filter, sort, grouping, group-order, and summary computations.
It reports no browser errors, store replacement warnings, or unstable memo output. Bead `table-gd3.1.5` retains the scan profiling work.

At 999 records, the built fixture uses 24.308 MiB loaded and 24.499 MiB after the earlier per-row saves.
It uses 24.715 MiB with both grouping levels expanded and 24.696 MiB after repeated layout changes and the summary edit.
Disposal reduces the heap to 4.114 MiB, compared with 4.087 MiB before mounting.
These figures include the complete fixture and its controls. They do not isolate one grouping operation.

Both grouped snapshots contain 999 row views, 3,996 cells, four group views, 16 group cells, and four membership nodes.
They contain 47,331 computations, 11,062 owners, 1,006 store targets, and 1,002 classified records.
The older-value counts match the earlier diagnosis after three records change through the global-save workload.
Dependency links change from 61,421 to 61,416. The grouped controls and summaries add dependencies without increasing the live record-view count.
Disposal removes all classified records, views, cells, membership nodes, store targets, owners, computations, and dependency links.
Thirty Maps and 334 V8 allocation templates remain.

Raw reports are `/tmp/table-grouping-{source,distribution,development,live}.json`.
Snapshots and summaries are under `/tmp/table-grouping-heaps`.
They include `loaded`, `repeated-edit`, `second-record-edit`, `grouped`, `regrouped`, and `disposed` captures.

## Per-column summaries

The Table fixture adds Amount and Due date, plus one controlled summary choice for each column.
Amount supports sum, min, max, average, median, range, and span.
Date summaries use UTC timestamps and show date endpoints or elapsed days.
General summaries include counts, first, and last. Summary changes preserve the source records and editing drafts.

All 131 unit tests and 68 Chromium scenarios pass.
The browser cases pass in source, built-package, development, and live Vite runs.
Source and built workloads cover 25, 250, and 999 records. Development and live workloads cover 25 records.
Types, scoped lint, formatting, builds, package imports, publint, and server rendering pass.
Live Vite records 96 expected scan-breadth entries and 12 advisory timing entries, with no unexpected diagnostics.
Console and structured capture can record the same diagnostic separately.

The two-level workload observes four groups. Sum, range, span, and median read 50, 500, and 1,998 amounts at the three sizes.
Median places 46, 456, and 1,818 valid numbers into temporary arrays across those groups.
Missing amounts account for the difference between accessor reads and valid numbers.
Median sorts numbers without copying records. Range allocates a pair of numbers for each result.
First and last each read four endpoint values. They scan member IDs and share the existing table order index.
Row count reads no amounts. Repeated choices allocate no replacement row views, cells, group views, or group membership.
They also leave note and date accessor counts unchanged.
Text save, dropdown save, editor collapse, and three-row global save retain their previous read counts: 3, 3, 6, and 18.

At 999 records, the final built heap measures 4.229 MiB before mounting and 26.255 MiB after loading.
It measures 27.104 MiB with groups expanded, 27.142 MiB after regrouping, and 27.151 MiB after repeated summary changes.
Disposal returns it to 4.253 MiB.
The fixture now renders six cells per record, compared with four in the preceding grouping workload.
This added rendering work contributes to the higher loaded baseline. These figures do not isolate the cost of an aggregate function.

Grouped, regrouped, and summary captures each contain 999 row views, 5,994 cells, four group views, 24 group cells, and four membership nodes.
Each capture contains 49,673 computations, 15,162 owners, 1,007 store targets, and 1,002 classified data records.
The three additional record objects match the existing bounded retention of prior values for three edited records.
Repeated aggregate changes add no retained data records or reactive owners.
After disposal, every classified record, Table view, group node, store target, computation, owner, and dependency link is absent.
The remaining categories contain 348 V8 allocation templates and 30 JavaScript Maps.

The first heap run found eight records from the initial fixture instance after disposal.
Their retaining path passed through a V8 allocation template, a shared descriptor array, and a column accessor closure.
Replacing literal getters with `Object.defineProperty` alone did not remove the shared descriptor path.
The final model creates fresh dictionary objects for column definitions and metadata, then installs their getters.
A focused disposal probe and the full seven-snapshot workload show that this change removes the retained instance.
This fix changes column configuration objects. It does not copy records or introduce a second dataset.

Final reports are `/tmp/table-aggregate-final-{source,distribution,development,live}.json`.
The seven snapshots and their classification reports are under `/tmp/table-aggregate-final-heaps`.
The initial evidence remains under `/tmp/table-aggregate-heaps` and `/tmp/table-aggregate-qualified-heaps`.
Desktop and 390px mobile layouts were inspected. The mobile page has no horizontal overflow outside the table scroll area.
The host runs other development workloads. Absolute timings remain advisory.

## Column resizing with a preview

This report describes commit `0338235e15`. The live resizing section below supersedes its preview and reset controls.

The Table fixture adds mouse, touch, and keyboard resizing with bounds, reset, and cancellation.
Pointer movement changes a temporary preview. Release commits one width through the existing Table state.
The internal sizing store preserves its container and updates individual width properties.
A shared `colgroup` keeps headers, cells, and group spans aligned.

All 133 unit tests and 78 Chromium scenarios pass.
The browser cases pass against source, built-package, development, and live Vite entries on Chromium `151.0.7922.34` for Linux.
Source and built workloads cover 25, 250, and 999 records. Development and live workloads cover 25 records.
Types, scoped lint, formatting, builds, publint, package imports, and server rendering pass.
Live Vite records 98 expected scan-breadth entries and 10 advisory timing entries, with no unexpected diagnostics.

At each subset size, the resize workload performs six drags, two keyboard changes, and a reset.
Thirty pointer moves commit no width state. The completed drags commit six updates, keyboard controls commit two, and reset clears the override.
These operations read no record accessors, rebuild no views or cells, and recalculate no groups or summaries.
They run no validation or save requests and preserve record identity.
Browser listener counts return to their initial value after garbage collection removes temporary automation listeners.

Each drag allocates a small gesture object. Width commands create small column configuration objects.
The counters cover record reads and Table resources. Browser layout still responds to committed widths and can change wrapping and row heights.
Text save, dropdown save, editor collapse, and three-row Save all retain their previous read counts of 3, 3, 6, and 18.
Timings include automation and remain advisory on this shared host.

In the full built suite, the 999-record heap measures 4.390 MiB before mounting and 26.456 MiB loaded.
It measures 27.363 MiB after summary changes, 27.629 MiB after resizing, and 4.426 MiB after disposal.
These totals include the complete fixture and browser automation. They do not isolate the cost of a handle.

The separate heap workload captures nine actual snapshots at 999 records.
Summary, resize, and repeated-resize captures retain 999 row views, 5,994 cells, four group views, 24 group cells, and four membership nodes.
Each capture contains 49,772 computations, 15,169 owners, 1,008 store targets, 7,037 store property signals, and 1,002 data records.
The three additional record objects match the bounded prior values from the earlier editing workloads.
Resizing adds no records, views, cells, computations, owners, or store targets.

Dependency links connect reactive values to their readers.
Their count changes from 75,876 after summaries to 75,892 after six drags, then 75,890 after 60 drags.
The initial 16 links occupy 640 direct bytes.
Their retaining paths reach the existing table-width memo, resize configuration memo, and header binding.
The repeated-use test rejects continued growth after the first resize workload.
Disposal removes every classified record, Table view, group node, store target, computation, owner, signal, and dependency link.

The heap-only run starts without the preceding interaction suite, so its cold baseline differs from the full-suite measurements.
Its disposed categories contain 30 JavaScript Maps and 174 V8 allocation templates.
An initial eight-record probe also tested 60 drags and found no classified Table or Solid resources after disposal.
Desktop and 390px mobile inspection show no page overflow outside the table scroll area.

Interaction reports are `/tmp/table-resize-final-{source,distribution,development,live}.json`.
The complete heap report is `/tmp/table-resize-final-heaps.json`, with snapshots and classifications under `/tmp/table-resize-complete-heaps`.
The initial dependency evidence remains under `/tmp/table-resize-final-heaps` and `/tmp/table-resize-repeat-*.heapsnapshot`.
The combined interaction and heap process ended with SIGTERM before its last capture. Separate runs completed both sets of gates.

## Live column resizing

The Table fixture now resizes headers and body cells together during pointer movement.
Grow table changes the total width. Keep table width transfers space between adjacent visible columns within both width limits.
The Actions column remains fixed. Fixed-width mode omits the handle after the last data column.
The fixture removes the preview, reset buttons, and double-click reset behavior.
Widths remain in current Table state and do not persist after remounting. The future view plan also excludes width persistence.

All 80 browser scenarios pass against source, built-package, development, and live Vite entries.
Source and built workloads cover 25, 250, and 999 rows. Development and live workloads cover 25 rows.
The cases cover mouse and touch, live header/body alignment, both width modes, bounds, hidden columns, mode changes, caller updates, drafts, and cleanup.
Fixture TypeScript, scoped lint, formatting, and all three fixture builds pass.
The published package source and its exports remain unchanged.

Each mode performs six drags with 30 pointer moves and two keyboard changes.
All 32 changes update the layout immediately. Fixed mode updates both widths in one Table state command.
At every subset size, these operations read no record accessors and replace no row views or cells.
They recalculate no groups or summaries and run no validation or save requests.
Gesture listener counts return to their baseline after collection.
Live Vite reports no unexpected diagnostics, with 98 expected scan-breadth entries and six advisory timing entries.

The full built suite measures 4.373 MiB before mounting 999 rows and 26.449 MiB loaded.
It measures 27.349 MiB after summaries, 27.656 MiB after both resize modes, and 4.400 MiB after disposal.
Pointer movement now performs browser layout work and allocates small width configuration objects on each change.
It does not copy records. Shared-host timings include automation and remain advisory.

The separate 999-row heap run captures ten snapshots and performs 240 drags across both modes.
Summary, resize, and later captures retain 999 row views, 5,994 cells, four group views, 24 group cells, and four membership nodes.
Each capture contains 49,784 computations, 15,169 owners, 1,008 store targets, 7,037 property signals, and 1,002 data records.
The three additional record objects match the prior edited values diagnosed earlier.
Resizing adds no records, views, cells, computations, owners, or store targets.

Dependency links number 75,906 before resizing, 75,935 after 12 drags, and 75,936 after both 120 and 240 drags.
Snapshot IDs trace the final extra link to the existing `columnSizing` property and `tableWidth` memo.
That source-reader pair has five links in the first resize capture and six in later captures, corresponding to the six column reads.
The test compares the two longer workloads to distinguish initial linking from continued growth.
A separate eight-row probe shows the same stable count between 120 and 240 drags.

Disposal removes all classified records, Table views, group nodes, Solid stores, computations, owners, signals, and dependency links.
Thirty JavaScript Maps and 178 V8 allocation templates remain in the final capture.
Desktop and 390px mobile inspection show aligned live resizing and no page overflow outside the table scroll area.
Reports are `/tmp/table-live-resize-{source,distribution,development,live}.json` and `/tmp/table-live-resize-final-heaps.json`.
Final snapshots and classifications are under `/tmp/table-live-resize-final-heaps`.
The initial link evidence remains under `/tmp/table-live-resize-heaps`, with the smaller probe at `/tmp/table-live-resize-repeat-*.heapsnapshot`.

## Column rearrangement

The Table fixture provides pointer dragging, keyboard moves, and a browser popover with move buttons.
Dragging marks a destination and commits the order on release. The pointer loop reads header geometry without visiting records.
Actions and caller-pinned columns stay fixed. Hidden columns remain in the controlled order.
Column IDs retain their widths, filters, sorting, and summaries. Caller changes preserve editor focus and text selection.

All 93 browser scenarios pass against source, built-package, development, and live Vite entries.
Source and built workloads cover 25, 250, and 999 rows. Development and live workloads cover 25 rows.
The 13 new scenarios include touch, keyboard limits, hidden columns, pinned boundaries, caller updates, pending saves, both resize modes, interruption, and scrolling.
Desktop and 390-pixel mobile inspection show that move controls fit without page overflow.

The live tests exposed `IMMUTABLE_UPDATE_IN_STORE` when several columns became hidden.
The visibility setter now updates individual properties and removes absent overrides while preserving its store container.
A regression test covers unrelated subscribers, consecutive updates before a flush, reserved IDs, and removal of overrides.
All 134 package tests pass, along with package and fixture types, lint, builds, import audits, export audits, and server rendering.
The final live run contains no unexpected diagnostics, 106 expected scan-breadth entries, and 24 advisory timing entries.

Each subset workload performs six drags and nine keyboard moves, for 15 order changes.
Those changes read no record accessors and create no replacement row views, cells, group views, or group cells.
They perform no summary calculations, edit validations, or save requests. Gesture listener counts return to their baseline.
Reordering still allocates column-ID arrays and ordered cell lists for rendered rows. DOM moves and layout work scale with those rows.

The final built suite measures 4.517 MiB before mounting 999 rows and 26.672 MiB loaded.
It measures 27.858 MiB after resizing, 28.017 MiB after rearrangement, and 4.547 MiB after disposal.
Across source and built runs, the 999-row reorder workload records 236–291 ms of browser script and 908–1,078 ms of layout work.
These totals cover all 15 moves. They include automation and remain advisory on the shared host.
They do not establish a latency budget or a regression against an earlier rearrangement control.

Interaction reports are `/tmp/table-reorder-{source,distribution,development,live}.json`.
Desktop and mobile screenshots are `/tmp/table-reorder-desktop.png`, `/tmp/table-reorder-menu.png`, and `/tmp/table-reorder-mobile.png`.

The separate 999-row run captures 13 actual heaps through editing, grouping, summaries, 240 resize drags, 300 column moves, and disposal.
It uses Chromium 151.0.7922.34. Captures after 15, 150, and 300 moves contain identical Table, Solid, and record resource counts.
Each contains 999 row views, 5,994 cells, four group views, 24 group cells, and four membership nodes.
They retain 49,899 computations, 15,169 owners, 1,008 store targets, 7,035 property signals, and 11 plain signals.
The 1,002 record objects include the three older edited values identified in the earlier heap diagnosis.
The first 15 moves add 46 dependency links, from 76,048 to 76,094. The count stays at 76,094 after 150 and 300 moves.

Disposal removes all classified Table, Solid, and record resources. The remaining classified categories contain 30 JavaScript Maps and 205 V8 allocation templates.
The separate run starts with a cold baseline, so its absolute heap size differs from the complete interaction suite.
Its report is `/tmp/table-reorder-heaps.json`, with snapshots and classifications under `/tmp/table-reorder-heaps`.

## Sub-tables and read-only grouped records

The editing fixture now composes independent child Tables under individual parent records.
Each child loads on first expansion and owns one Solid record store. Parent records are not copied into that store.
Collapse removes the child DOM, row views, and listeners. The child collection, configuration, drafts, and pending saves remain owned by its dataset scope.
Parent removal or a dataset change ends that scope. Late load responses cannot recreate it.
Each table saves only its own drafts.

Grouped records now render saved values without edit controls or draft subscriptions.
Individual records inside expanded groups can open child tables. Group summary rows have no child controls or subscriptions.
Aggregate values occupy their corresponding columns. Grouped columns lead in grouping order, ahead of other pinned columns.
Clearing grouping restores the manual order. Moves of other columns do not accidentally persist the temporary grouping order.

The first sub-table implementation used one entries signal for every row lookup.
Opening a child notified 401 subscribers in the reported case. The implementation now uses a Solid store with a property per parent ID.
The lookup properties contain functions that return child controllers. They do not wrap or duplicate child record stores.
A keyed `tbody` contains each parent row and its detail row. This removes the shared insertion effect that subscribed to 100 detail branches.

The grouping CPU profile also identified substantial overhead from automatic detailed timeline recording.
The original development profile measured 0.9–2.6 seconds for a 500-record expansion on the loaded host.
The largest sampled costs were timeline measurements, descriptions, and span construction.
Ordinary review now keeps development checks enabled without automatic timeline recording. `BENCH_TRACE=1` enables recording explicitly.
The separate `BENCH_ATTRIBUTION=1` scenario enables attribution without timeline painting and inspects actual subscriptions.
These changes do not remove the candidate scans used by filters, sorting, group membership, and aggregates.

The attribution scenario observes 16,017 creation and rerun records when expanding 500 grouped records.
None reads the draft store. Loading a child while its parent group remains collapsed causes no group-summary or grouping computation to rerun.
The live report contains no unexpected diagnostics. It records two known scan-breadth entries and two advisory timing entries.
Machine load varies, so timing observations do not establish a latency budget.
The final script is `editing/grouping-profile.mjs`. The evidence is `/tmp/table-subtables-live-final.json` and `/tmp/table-subtables-live-regressions.json`.

All 134 package tests pass. Package types, fixture types, scoped lint, import audits, export audits, and server rendering pass.
The initial 103 browser scenarios pass against source, built-package, development, and live entries.
Source and built workloads cover 25, 250, and 999 records. Development and live workloads cover 25 records.
The final 104-scenario suite also covers nested mobile containment and passes against the built package and live server.
A final focused live run covers the manual-order repair and grouped parent-removal notice.
Built module audits still exclude table-core, TanStack Store, virtual-core, Solid Form, Kobalte, Sonner, and Lucide.
These changes affect the development fixture and require no published-package changeset.

Six actual heap snapshots measure 100 parent records and one five-record child collection.
The collapsed captures after 10, 100, and 200 cycles have identical classified Table, Solid, and record counts.
Each retains 105 records, 100 row views, 600 cells, 118 store targets, 827 property signals, and 24 plain signals.
Each also retains 7,500 computations, 1,551 owners, and 7,955 dependency links.
Opening the child raises the row-view count to 105 and the cell count to 630. The record count stays at 105.
Removing its parent leaves 99 records, 99 row views, and 594 cells. The five child records are released.
Disposal leaves no classified Table, Solid, or record resources. The remaining categories contain 18 JavaScript Maps and 167 V8 allocation templates.
The template count grows from 164 to 167 during warmup, but it retains no classified application resources after disposal.

The cold run measures 5.804 MiB after 10 closed cycles, 6.082 MiB after 100, and 6.113 MiB after 200.
It measures 6.457 MiB with the child open, 5.962 MiB after parent removal, and 2.450 MiB after disposal.
These are whole-page heap measurements. The classified resource counts establish the bounded child lifetime.
The report is `/tmp/table-subtables-heaps.json`. Snapshots and classifications are under `/tmp/table-subtables-heaps`.

Interaction reports are `/tmp/table-subtables-{source,distribution,development,live}.json`.
The final reports are `/tmp/table-subtables-distribution-final.json` and `/tmp/table-subtables-live-final.json`.
Screenshots are `/tmp/table-subtables-grouped.png`, `/tmp/table-subtables-desktop.png`, and `/tmp/table-subtables-mobile.png`.
The 390-pixel layout keeps child controls inside the parent viewport and table content inside its own scroll area.

## Stable table structure during editing

Open editors, drafts, and pending saves now lock table configuration and row structure.
The model guards controlled setters as well as disabling controls. Child edits prevent parent transitions that can hide the child.
Collapse and dataset changes wait for affected edits to resolve. Each table retains its own save scope.

The published `rowProcessingPaused` option retains evaluated ID arrays, group membership, and group order while cell values remain live.
It does not create a second record store or copy record fields. Source removal waits until editing ends.
The save controller rejects a stale response for a record awaiting removal.
The sorted-ID memo compares IDs before notifying its consumers, so an unchanged result retains the rendered rows.

All 138 package tests pass. Types, scoped lint, builds, package audits, and server rendering pass.
All 111 browser scenarios pass against source, built-package, development, and live entries.
Source and built workloads pass at 25, 250, and 999 records. The live workload passes at 25 records.
Text and dropdown saves each read three cells. Closing an edited row reads six cells.
Saving three collapsed drafts reads 18 cells. These operations create no replacement row views or cells.
The existing filtering, grouping, resizing, and rearrangement count assertions also pass.

The live attribution capture records 16,018 creation and rerun events while expanding 500 grouped records.
No grouped record subscribes to drafts. A hidden child load causes no group or summary reruns.
The report records two known scan-breadth entries, four advisory timing entries, and no unexpected diagnostics.
Timings remain advisory because the host runs other development loads.

Four focused heap captures cover 250 records after 10, 100, and 200 edit/cancel cycles, then disposal.
All three settled captures retain exactly 250 records, 250 row views, 1,500 cells, and 263 store targets.
They also retain 17,826 computations, 3,792 owners, and 20,048 dependency links.
Disposal leaves no classified Table, Solid, or record resources.
Whole-page heap totals are 10.234, 10.466, and 10.551 MiB during the cycles, then 2.470 MiB after disposal.
The stable resource counts do not imply that the entire browser heap stays at a fixed size.

The workload keeps a name filter and name sort active. Releasing each lock runs both scans once, even after Cancel.
The 190 cycles after warmup read 95,190 names, 190 notes, and 190 priorities, with no new row views, cells, or requests.
The name count includes 500 scan reads and one displayed-cell read per cycle.
The lock drops scan subscriptions while active and processes current values when it releases.

An initial broad heap run reached the filesystem quota during a 999-row capture.
Its temporary raw snapshots were removed. The focused four-capture run completed successfully.
The final reports are `/tmp/table-editing-lock-{source,development,live-final,distribution-final,memory}.json`.
The focused snapshots and classifications are under `/tmp/table-editing-lock-heaps`.

## Parent-owned named views

The editing fixture now keeps named configurations in parent-owned view controllers.
Saved payloads contain filters, search, sorting, grouping, aggregates, column layout, and display controls.
They exclude records, drafts, revisions, widths, and transient row state.
Each collection still owns one canonical Solid record store.
The demo uses memory storage for one App mount. Application callbacks supply durable storage later.

The focused workload retains 100 parent records and five records in a collapsed child table.
Two parent views alternate ascending and descending name sorting. The child keeps one saved view.
Snapshots follow 10, 100, and 200 pairs of switches, then disposal.
All three active snapshots contain 105 records, 100 rendered row views, 600 cells, and 123 store targets.
They also contain 7,541 computations, 1,554 owner scopes, 8,323 dependency links, and two view controllers.
The three snapshots contain seven saved-view objects and seven configuration objects.
These represent three storage entries, three controller entries, and the last saved request in the harness.
Every classified record, Table, Solid, saved-view, configuration, and controller resource disappears after disposal.

The 190 pairs after warmup read 38,000 names for sorting. They create no replacement row views or cells and send no storage requests.
Storage-only operations read no record fields and create no row views or cells in the browser scenarios.
Heap snapshot totals are 11.470, 11.642, and 11.744 MiB while active, then 4.875 MiB after disposal.
These totals sum object self sizes across the page, including browser automation resources.
Stable resource counts do not imply a fixed whole-page heap size. Timing measurements remain advisory on the shared host.

The first classifier counted Zod schema shapes as saved views because their property names matched.
Strong retaining paths led to the module-level Zod definitions, not application view data.
The classifier now requires a string ID for saved views and a numeric version for configuration objects.
Reanalysis and the final captures show no saved-view instances after disposal.

A later capture reached the temporary-file quota. Only superseded raw snapshots from this named-view task were removed.
Their summaries were kept. Final captures remain under `/tmp/table-views-final-heaps`.
The four raw snapshots use gzip compression to release temporary filesystem space. Their JSON summaries remain uncompressed.
Chromium runs with `TMPDIR=/dev/shm` completed after browser crashes with temporary files on the quota-limited filesystem.
The successful workload report is `/tmp/table-views-memory-final.json`.

All 138 package tests pass. Source types, fixture types, scoped lint, and source, distribution, and development fixture builds pass.
The final distribution suite passes all 122 browser scenarios without errors or diagnostics.
The final 11 named-view scenarios also pass against source, development, and live entries.
Earlier complete 121-scenario runs pass in all four modes. Source and distribution workloads pass at 25, 250, and 999 records.
The final added scenario tests keyboard focus after storage actions and prevents delayed focus restoration from interrupting later navigation.
Desktop and 390-pixel layouts show no page overflow.

The final live attribution capture records 16,018 creation and rerun events without grouped-row draft subscriptions.

## Kobalte popup editing

The [popup fixture](./popup/README.md) qualifies real Kobalte Select with Solid rc.13 and focused source repairs.
The immutable Kobalte revision is `e9d426d438b7c9ea0cc81bd1133831a20cd5fcae`.
The application still owns one record store, row drafts, validation, and save requests.
The popup wrapper exchanges scalar field values and callbacks with Table.

All 19 popup scenarios pass against source, the package build, development diagnostics, and the live preview.
The existing HTML-control fixture also passes all 122 browser scenarios after the optional editor interface changes.
The package unit suite passes 138 tests.
The final popup runs contain no browser errors, warnings, or timing diagnostics.
Chromium reports version `153.0.8010.12` for the final runs.
Desktop and 390-pixel viewport screenshots show the popup within the viewport and aligned with its trigger.

The repeated workload mounts 100 records and performs 200 edit, open, choose, and cancel cycles.
Each cycle reads the three editable fields once to create its draft.
The workload creates no additional Table rows or cells and sends no save requests.
Record identity remains stable.
After garbage collection, all three captures contain 4,749 DOM nodes and 597 event listeners, including browser automation resources.

Snapshots after 10, 100, and 200 cycles contain identical classified application resources.
Each contains 100 records, 100 row views, 600 cells, 111 store targets, and 829 property signals.
Each also contains 7,568 computations, 1,548 owners, 8,041 dependency links, 49 plain signals, and one view controller.
These counts describe the complete editing fixture, not the dropdown alone.

The browser heap metric rises from 8.046 MiB to 8.631 MiB and 8.941 MiB during warmup.
Snapshot self-size totals rise from 13.532 MiB to 14.320 MiB and 14.637 MiB.
These measures differ because the snapshot also includes browser-native objects.
The largest increase is 878,248 bytes of compiled code.
Other increases include browser layout-shift records, rectangles, selector queries, and weak-array storage.
The classified Table and Solid resource counts remain unchanged.
V8 allocation templates rise from 280 to 382 during warmup and then remain stable.

Disposal leaves no classified records, rows, cells, store targets, property signals, computations, owners, dependency links, or view controllers.
One plain signal remains in the window-wide scroll registry.
The assertion requires exactly one signal and a retaining path through `@solid-primitives/scroll:prevent-scroll`.
That signal has no component owner after the repair.
The disposed browser heap metric is 4.987 MiB. Its snapshot self-size total is 7.365 MiB.
The separate capture after all interaction scenarios has the same application cleanup result.

### Retention diagnosis

The first repaired interaction prototype still retained records after disposal.
Strong paths led through V8 event caches, detached popup nodes, event callbacks, and Table properties.
The global scroll signal also retained its first component owner.
These paths required additional repairs beyond successful keyboard and pointer tests.

The local port attaches owned DOM listeners at Kobalte element boundaries and removes them during cleanup.
This follows the existing Table event workaround tracked by `table-gd3.6.4`.
Kobalte renders its dismissable layer directly, so that element also needs the listener boundary.
The port creates the global scroll signal with `runWithOwner(null, ...)`.
The final disposal snapshots demonstrate that these paths no longer retain the Table model.

The final minified source fixture contains 289.63 kB of JavaScript, or 94.85 kB with gzip.
The regular editing fixture contains 199.41 kB, or 65.82 kB with gzip.
The popup therefore adds about 90.22 kB, or 29.03 kB with gzip, to this complete demonstration.
This comparison includes the wrapper and standalone demonstration. It does not measure a standalone library export.

Final reports use `/tmp/table-popup-qualified-{source,distribution,development,live}.json`.
Compressed snapshots and parsed retaining paths reside in `/tmp/table-popup-qualified-heaps/`.
Earlier disposal evidence remains in `/tmp/table-popup-heaps/` and `/tmp/table-popup-final-heaps/`.
The shared host runs other development loads. These results do not establish a latency budget.
This qualification covers fixed choices in Chromium. Searchable references, touch gestures, other browsers, and production WAMN UI remain separate work.
A hidden child load causes no group or summary reruns.
It records two known scan-breadth entries, six advisory timing entries, and no unexpected diagnostics.
Final reports are `/tmp/table-views-{source,distribution,development,memory}-final.json` and `/tmp/table-views-focus-live.json`.
The attribution report is `/tmp/table-views-live.json`.
These changes affect the development fixture and require no published-package changeset.
