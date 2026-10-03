# Heap findings

The store-over-core prototype retains too much memory for the target architecture.
It preserves table-core rows and caches, then adds native Solid bookkeeping around them.
The replacement must use Solid directly and restrict display objects to consumer demand.

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
