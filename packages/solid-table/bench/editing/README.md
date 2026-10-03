# Table controls and inline editing

This fixture tests filters, search, grouping, column summaries, resizing, and inline editing with Solid 2 and plain HTML controls.
It renders records in expanded groups, or every matching record when grouping is off.
Virtualization is optional elsewhere and is not a dependency here.
The measured editing subsets contain 25, 250, and 999 records. These sizes are not product limits.

## Column filters and search

Column filters appear above the table by default.
Record, Name, and Note use text matching. Priority uses an exact choice.
Amount matches numeric text. Due date matches its UTC date text.
Text matching ignores case and surrounding whitespace.
All active column filters must match a record.

Global search is a separate, optional control.
It searches saved values in visible, searchable columns and combines with the column filters.
Record, Amount, and Due date are excluded from global search in this example. Their column filters remain available.
An explicit column filter still applies when its column is hidden.

Each control has its own clear button. Escape clears a text filter or global search and keeps focus in that control.
Composition input waits until the composed text is committed. Dropdown keys retain their browser behavior.
Clear all filters resets both column filters and global search.
The result count reports matching and loaded records. An empty result offers a Show all records action.
An empty source instead reports that there are no records yet.

The fixture parent in `App.tsx` supplies display configuration to `Table.tsx`.
Display options can place filters above the table, in headers, in both places, or hide the controls.
Header sorting and global search have separate switches.
Both filter presentations share Table state. Hiding or moving controls preserves their values.
External state changes update the controls without another filter store.
`TableFilter.tsx` accepts a value and change callback, so a parent can compose its own filter panel.

The existing controlled Table API remains the boundary for a later view component.
That parent will own saved configurations and persistence. This fixture adds no persistence layer.
Records, drafts, and pending requests remain separate from view configuration.

When the caller disables local processing, the controls become unavailable and preserve their configuration.
The table shows the caller-provided order until local processing resumes.
The integration fixture demonstrates the corresponding complete-dataset rule.

Search and filters use committed values. An unsaved draft does not change whether a row matches.
Hidden drafts remain available through Show and Cancel. Show clears both filtering layers before reopening the row.
Save all includes hidden drafts. An accepted save can move a row into or out of the current result.
If a save removes the focused row from global search, focus returns to that search control.

## Grouping and summaries

The Group records bar adds, removes, and reorders grouping levels.
The example offers Priority and Name initial. Name initial uses the first character of the trimmed name, in uppercase.
An empty grouping value appears as `(none)`.
Applications define these values through column grouping functions. Date buckets and time zone policy belong to those functions.

New group paths start collapsed. Each group has an expand button and a record count.
The bar can expand or collapse every group, or one nesting level.
Expansion uses raw group paths, so changing labels or restoring the same layout preserves the correct groups.
Reordering levels preserves each column's group ordering preference.
Keyboard activation uses standard buttons and selects. Moving a level returns focus to its order control.

Each level can follow record order, group-value order, or summary order.
Header sorting controls records within each group and leaves group ordering independent.
Each column has a summary selector with choices from its application metadata.
Amount offers sum, minimum, maximum, average, median, range, and span.
Due date offers earliest, latest, range, and span in days. The demo stores dates as UTC timestamps at midnight.
Range shows both endpoints. Span shows their difference. Date spans measure elapsed 24-hour days.
General choices include row count, filled count, empty count, distinct count, first, last, and None.
First and last follow the current table sort and preserve blank endpoint values.
Empty means null, undefined, or a blank string. Distinct excludes empty values and preserves whitespace in nonblank strings.
Numeric statistics ignore missing or invalid numbers. An empty sum is zero. Other empty statistics show a dash.
Amount and Due date are read-only fields in this editing demo.
Their deterministic values include missing entries in larger datasets.

The application owns the selected aggregate identifiers in a small Solid configuration store.
Column getters expose the selected functions without a second record store.
Column definitions and metadata use fresh dictionary objects before their getters are installed.
The heap captures found that V8 template descriptors otherwise retained an earlier fixture through a getter closure.
A later parent view can persist these identifiers with the other table configuration.
Caller changes update the selectors. Invalid choices for a column are ignored.
Selecting None suspends summary ordering and preserves its configuration.
A level can sort by its grouping value or another column summary. Ranges compare the minimum, then the maximum.
Summaries appear on each visible group, including collapsed groups, and use records that pass the active filters.
The result count distinguishes displayed records from records that match filters.

Grouping uses saved values. Editing a draft does not move its record until a save succeeds.
A saved grouping field can move a record into a collapsed group. Focus then moves to that group's visible expand control.
Collapsed groups preserve drafts, validation errors, and pending requests.
Show clears filters and expands only the path to the selected draft. It preserves grouping and unrelated collapsed groups.
Save all includes drafts inside collapsed groups. A completed request respects later focus movement and does not reopen a group.

Display options can hide the grouping controls while preserving their configuration.
The local-processing gate disables grouping and summaries and shows the caller-provided record order.
Restoring local processing restores grouping and expansion.

Group rows use Table group views within their rendered Solid owners.
Collapsed descendants release their row and group views. Drafts remain in the editing controller.
The source store retains one canonical record per ID. Group membership stores IDs, and summaries iterate over those IDs.
Ordered key comparisons prevent unchanged group lists from notifying subscribers after an edit stays in the same group.
These comparisons do not remove membership scans or summary reads.

## Column resizing

Each resizable column has a handle on its right header edge and a reset button.
Dragging with a mouse or touch shows a width preview. Releasing the handle commits that width once.
The table keeps its current layout during the preview.
Column metadata supplies the default, minimum, and maximum widths.

Double-clicking the handle or activating its reset button restores that column default.
Reset column widths clears all width overrides.

The focused handle accepts Left and Right for 10-pixel changes, or 50 pixels with Shift.
Home and End select the minimum and maximum widths.
Escape cancels a drag. Lost pointer capture, window blur, a hidden document, and removal of the handle also cancel it.
Caller changes to the active width or its bounds cancel a stale preview.

The handle exposes its label and current pixel width through a vertical ARIA separator.
Chromium tests cover keyboard, mouse, and emulated touch behavior. Other browsers and assistive technologies need separate qualification.

Display options can hide resize controls independently of header filters and sorting. Hiding controls preserves saved widths.
Resizing remains available when local record processing is disabled.

`TableColumnResize.tsx` receives a width, bounds, and callbacks. It owns only the temporary preview and gesture listeners.
The parent supplies callbacks that update Table `columnSizing` state.
Controlled Table state still requires the caller to accept width updates.

The table uses one `colgroup` for header and body widths. Its total width includes the fixed Actions column.
Group spans follow the same table geometry. A narrow viewport scrolls horizontally without horizontal virtualization.

Pointer movement updates the preview without reading records or changing Table state.
A committed width updates its column and the total width. Browser layout can then change cell wrapping and row heights.
The internal sizing store preserves its container, so unrelated width subscribers remain unchanged.
The change does not replace records, views, cells, drafts, or summaries.

## Editing behavior

Activate a name, note, or priority button to open a row draft.
All three fields belong to that draft and share one revision.
Tab and Shift+Tab follow the browser's normal control order without saving.

Moving between controls in the same row keeps its editors open.
Leaving the row closes its editors and preserves its draft.
Collapsed cells show draft values with an Edited marker on each changed field.
Clicking a cell resumes that row draft. Multiple rows can have drafts, but only the active row shows inputs.
An unchanged visit or a reverted edit leaves no draft when the row closes.
In Per row mode, Save and Cancel appear while the row is open.
Errors and pending status remain visible after it closes.

In Per row mode, Save saves the row. Cancel discards its draft.
In that mode, Enter saves a text input and Escape cancels its row draft.
An unchanged save sends no request. A blank name keeps the editor open with an error.
Composition events do not save or cancel an unfinished input method composition.
Pending requests make text inputs read-only and disable the dropdown, Save, and Cancel.
Other rows remain editable while a request is pending.

Filtering and sorting use committed values.
A hidden draft appears in a separate notice with Show and Cancel controls.
Saving a value that moves its row preserves the logical record target for focus.
If the saved row leaves the filter, focus moves to the filter control.
A completed request does not reclaim focus after a later pointer or focus interaction.

Refusals, conflicts, unknown outcomes, and transport failures preserve the draft.
Cancel reveals the current committed values after a conflicting update.
The fixture rejects a response for another record or a revision that changed during a request.
It never recreates a removed record from a late response.

## Optional global save

The Save mode selector switches between Per row and Whole table without discarding drafts.
Per row remains the default. The fixture accepts `saveMode="table"` to start in Whole table mode.
The URL parameter `save=all` selects the same initial mode.

In Whole table mode, Save all replaces the row Save buttons.
Enter closes a text editor and preserves its draft. Escape or Cancel discards that row draft.
Native dropdown keys keep their existing behavior.
The button includes every outstanding draft, including drafts outside the current filter.

Save all captures the draft IDs and applies the application schema to each draft before sending any request.
An invalid value, missing record, or known revision conflict blocks the whole attempt.
Errors remain beside visible cells or in the hidden-draft notice.
Correcting the affected drafts allows another attempt.

After all drafts pass, the controller sends each changed row with its exact expected revision.
It sends at most four requests at a time and reexamines each queued revision before sending.
Rows in that save remain locked until their request finishes. Other rows remain editable.
New drafts wait for the next Save all. A repeated click or same-turn call does not start duplicate requests.

The transport saves each row separately, so server refusals or later conflicts can produce partial success.
The result reports saved, failed, and unchanged row counts. Failed rows retain their drafts and errors.
Retry sends the remaining drafts. It does not resend successful rows unless the user edits them again.
Unchanged drafts send no request. Closing the table aborts active requests and prevents queued requests from starting.

This policy belongs to the fixture controller. It adds no batch endpoint or transaction guarantee to the published Table API.
The controller stores prepared changes only for the captured drafts, without copying the record collection.
The running save does not reclaim focus after a later user interaction.

## Dropdown behavior

Priority uses a native select input with Low, Normal, and High as example choices.
The dropdown uses the same row draft, validation callback, and save lifecycle as text inputs.
Choosing an option changes only the draft.
Save and Cancel return focus to the last edited field when no later interaction takes focus elsewhere.
Each draft remembers its own focus target, including when several rows have drafts.

The dropdown retains its [native select behavior](https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element).
The fixture attaches no Enter or Escape handler to the select.
Those keys control the dropdown without saving or discarding the row.
In Per row mode, Tab moves to Save and Shift+Tab moves to Note.
In Whole table mode, Tab moves to Cancel. Save all saves the dropdown draft.

Tests cover native keyboard selection and menu dismissal in Chromium on Linux.
They also cover pointer entry, option changes, invalid values, concurrent updates, refused saves, and drafts hidden by filters.
The fixture does not provide a custom popup, searchable choices, remote options, or multiple selection.
Other browsers and operating systems need separate interaction tests.

The [Zaidan and Kobalte review](./select-guidance.md) records WAMN controls and upstream Solid 2 branch status.
Popup integration needs additional keyboard, focus, and lifecycle tests against the pinned Table runtime.

## Ownership and scope

`model.ts` owns one Solid record store. Table reads records through IDs.
`createEditing.ts` owns temporary editable fields and their base revision outside row components.
Its synchronous request map prevents duplicate submissions before Solid commits a pending-state write.
An accepted save preserves the record's public identity and changes its fields.
The controller does not copy the dataset or replace unaffected rows.

Each draft records whether its editors are open. Cell markers compare draft values with saved values through Solid property tracking.
The markers do not add dirty flags to Table or a second record store.
Draft ID memos compare IDs in order before notifying subscribers.
Adding a visible draft leaves the hidden-draft notice unchanged when its IDs remain the same.
The comparison reads only IDs. It does not inspect or copy record fields.
Document listeners close the active row after an outside click or keyboard focus movement.
Pointer focus does not collapse a row before the click reaches its target, because collapse can move the next row.
Disabling a focused Save button during a request does not count as user navigation.
Solid's property tracking can retain an older record value internally. The heap tests measure that cost and its disposal.

The save transport is a deterministic local simulation with refusal, conflict, delay, and failure controls.
It does not connect to WAMN or implement a production persistence protocol.
The module audit rejects table-core, TanStack Store, virtual-core, Form, and the excluded UI libraries.
Dropdown editing is qualified under `table-gd3.6.7.3`. Action use cases remain under `table-gd3.6.7`.
The user's select request means a dropdown input. It does not add row selection or selection-based actions to this fixture.
The editing controller is fixture code, not a new public Table API.

## Application validation

`validation.ts` uses [Zod Mini](https://zod.dev/packages/mini) through `zod/mini` from Zod 4.6.5.
Zod is a development dependency of this fixture. The published Table runtime does not import it.
The application supplies a synchronous `validate` callback to the editing controller.
The callback returns parsed values or field and row errors.
Tests also cover schemas with rules that involve multiple fields and transformations such as trimming.

The fixture requires a nonblank name with at most 80 characters and a note with at most 240 characters.
Priority must be one of the three available choices. Unknown values retain an error until the user selects a valid option.
These rules demonstrate application policy. Table does not impose these limits.
The default schema preserves whitespace in valid names.
An application can replace the schema without changing Table.

A row save applies the schema only to that row's name, note, and priority.
An invalid result preserves the draft, marks each affected input, and focuses the first invalid field for a per-row save.
Save all reports the errors without moving focus into a row.
Each input refers to its error text through `aria-describedby` and exposes `aria-invalid` when invalid.
After the first validation attempt, a field change validates that row again to update errors involving related fields.
Rendering, sorting, and filtering do not run validation.

Zod parses a small values object for the edited row. It does not receive or copy the record collection.
The controller builds the save request from parsed values, so schema transformations reach the commit callback.
Only an accepted save updates the canonical Solid record store.
The callback supports synchronous rules. Async validation and production server validation remain outside this fixture.
The simulated server refusal path continues to preserve drafts.

The fixture uses the existing native event listener cleanup and rc.13 root-disposal workaround.
Beads `table-gd3.6.4` and `table-gd3.6.5` track those runtime workarounds.

## Run the fixture

These commands require the repository dependencies and an installed Playwright Chromium browser.
Run them from the repository root.

```sh
pnpm --filter @tanstack/solid-table exec vite --config bench/editing/vite.config.ts
```

Open the local URL printed by Vite. Add `?size=250` to change the initial record count.
Add `?size=25&save=all` to start with global save enabled.
Stop the server after review.

## Browser qualification

Build and test the source entry:

```sh
pnpm --filter @tanstack/solid-table exec vite build --config bench/editing/vite.config.ts
BENCH_OUTPUT=/tmp/table-editing-source.json node packages/solid-table/bench/editing/run.mjs
```

Build the package before testing its distribution entry:

```sh
pnpm --filter @tanstack/solid-table run build
BENCH_DISTRIBUTION=1 BENCH_PROFILE=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/editing/vite.config.ts
BENCH_DISTRIBUTION=1 BENCH_HEAPS=/tmp/table-editing-heaps BENCH_OUTPUT=/tmp/table-editing-distribution.json node packages/solid-table/bench/editing/run.mjs
```

Build with the development runtime to detect its available Solid diagnostics:

```sh
NODE_ENV=development BENCH_DEVELOPMENT=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/editing/vite.config.ts
BENCH_DEVELOPMENT=1 BENCH_SIZES=25 BENCH_OUTPUT=/tmp/table-editing-development.json node packages/solid-table/bench/editing/run.mjs
```

The live Vite server also enables performance diagnostics that this development build does not include.
These diagnostics include `UNSTABLE_MEMO_OUTPUT`, which reports repeated equivalent memo results with new references.
Start the fixture server before running the same suite against its URL:

```sh
BENCH_URL=http://127.0.0.1:7777/ BENCH_SIZES=25 BENCH_OUTPUT=/tmp/table-editing-live.json node packages/solid-table/bench/editing/run.mjs
```

The repeated-draft case creates eight drafts, changes filters, and saves the visible and hidden drafts together.
The runner rejects page errors and unexpected console warnings or Solid diagnostics.
It records known broad-dependency diagnostics from filters, sorting, group membership, group ordering, and visible summaries separately.
Those diagnostics describe the existing algorithms, which read candidate records on each relevant change.
It also records `HOT_SCOPE_TIME` as advisory because this machine runs other development loads.
Store replacement warnings and unstable memo results remain failures.
The live-server report omits the built-module audit. The separate built runs still require it.

Set `BENCH_EXECUTABLE_PATH` to use a specific installed Chromium binary.
The report records the actual browser version.
`BENCH_SCENARIOS=0` runs only the subset workloads. Use it for separate heap captures after the full interaction suite passes.
`BENCH_SIZES=999` limits that heap run to the largest measured subset.
For built assets, the runner starts a temporary local server and closes it and Chromium in its cleanup block.
With `BENCH_URL`, it closes Chromium and leaves the supplied server running.

The runner tests keyboard and pointer flows, draft retention, request races, record identity, and disposal.
Subset workloads require every matching row to render and reject replacement Table views or cells during an edit.
Five column-filter changes require five reads per record in the measured workload.
Five global-search changes with that filter active require ten reads per record.
All records match these measured queries, so surviving views and cells must remain unchanged.
Search and filter interactions must send no save request and run no edit validation.
Filtering still allocates a result ID array per pass.
The equality comparison checks ordered IDs and prevents unchanged results from updating row-list subscribers.
It does not copy records or eliminate the filter scan.
Heap captures classify records and reactive resources before and after disposal.
They also measure 20 further edits to one record and an edit to a second record.
Each row now has six cells. The added read-only cells account for additional baseline resources.
The grouping workload adds two levels and repeats collapse, expansion, removal, and restoration.
Initial grouping reads two grouping values per record. Expansion does not rescan grouping values.
A note edit recalculates its two visible ancestor summaries and reads its displayed note, for `2 * (size - 1) + 1` reads.
It does not rebuild membership or replace row or group views.
The `grouped` and `regrouped` snapshots measure live group resources before and after repeated layout changes.
The aggregate workload switches Amount through median, range, span, first, last, count, and sum, then repeats summary changes.
With two grouping levels, scanning aggregates read two amount values per record across the observed groups.
Median allocates one temporary number array per observed group. The workload counts the numbers placed into those arrays.
First and last each read four endpoint values across four groups. Count reads none.
These changes must retain existing views, cells, membership, note reads, and date reads.
The additional `summaries` snapshot measures retained resources after these changes.
The resize workload repeats six drags, two keyboard changes, and a reset at each measured subset size.
Each completed drag commits once. Pointer movement must leave Table width state unchanged.
Record reads, grouping reads, summaries, views, cells, validation calls, and save requests must remain unchanged throughout this workload.
Browser listener counts return to their initial value after garbage collection removes temporary automation listeners.
The additional `resized` snapshot must retain the same records, views, cells, stores, computations, and owners as `summaries`.
The first width writes can change the links between existing computations and their dependencies.
The `resized-repeat` snapshot measures another nine workload cycles. Its retained dependency count must not exceed the first resize snapshot.
The disposed snapshot must contain no classified group views, group cells, or membership nodes.
Timings include browser automation and remain advisory on the shared development machine.
They do not establish a latency budget or a universal non-virtualized row limit.

The [heap report](../heap-findings.md#non-virtualized-editing-fixture) records the qualified results and the retained-value diagnosis.
