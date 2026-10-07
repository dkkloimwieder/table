# Table controls and inline editing

This fixture tests filters, search, grouping, column summaries, resizing, rearrangement, named views, sub-tables, and inline editing with Solid 2 and plain HTML controls.
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
For a compact header-filter preview, add `&filters=headers` to the running demo URL, such as `http://localhost:7777/?size=25&save=all&filters=headers`.
Display options can switch filter placement during the demo.
Both filter presentations share Table state. Hiding or moving controls preserves their values.
External state changes update the controls without another filter store.
The fixture uses CSS for colors, spacing, and drag handles.
The `details` prop supplies sub-table callbacks and content. Its icon-only toggle occupies a narrow first column.
Changed fields stay highlighted. The fixture keeps edit descriptions available to screen readers without visible row status text.
`TableFilter.tsx` accepts a value and change callback, so a parent can compose its own filter panel.

The parent owns named views and storage through the existing controlled Table API.
Records, drafts, and pending requests remain separate from view configuration.

When the caller disables local processing, the controls become unavailable and preserve their configuration.
The table shows the caller-provided order until local processing resumes.
The integration fixture demonstrates the corresponding complete-dataset rule.

Search and filters use committed values. During editing, the table holds its displayed membership and row order.
After the last edit resolves, the table applies current saved values to the existing filters and sort.
If a save removes the focused row from global search, focus returns to that search control.

## Named views

The parent renders `TableViews.tsx` through the Table settings slot.
`createTableViews.ts` owns the saved list and storage requests outside the Table renderer.
The default storage keeps views in memory for one App mount. Reloading the page clears this demo storage.

Enter a name and select Save as new view to save the current configuration.
Choose a saved view to apply its configuration.
Update view overwrites the selected saved configuration with the current configuration.
Rename view changes only its name. Delete view leaves the current table configuration in place.
Reload views reads the storage list without applying a view.
Changing table controls after selecting a view does not automatically update the saved view.

Views include column filters, global search, sorting, grouping, group ordering, aggregates, column order, visibility, pinning, and display controls.
Saved order and pinning describe the manual layout before grouped columns move to the front.
Views exclude records, drafts, revisions, widths, save mode, local-processing policy, row selections, and expansion state.
Applying a view keeps current widths and starts its groups collapsed.
The model applies the configuration in one synchronous sequence without replacing the record store.

`App.viewStorage` accepts application callbacks named `load`, `save`, and `remove`.
Bind these callbacks to the application table identity before passing them to App.
Every callback receives a scope and an abort signal. Save also receives a view, and remove receives its ID.
Load returns the saved list. Save and remove complete without a return value.
Callbacks can complete synchronously or return promises. Reject a promise or throw an error to report a failed operation.
Applications own durable storage and concurrent-write policy. This fixture adds no browser storage, URL persistence, or backend integration.

Zod Mini validates a versioned configuration before it enters the saved list.
Unknown fields, missing columns, duplicate names or IDs, unsupported aggregates, and invalid grouping levels produce an error.
A failed load preserves the previous list. Failed saves and deletes preserve saved views and the current table configuration.
View names must contain text and use at most 80 characters. Name comparisons ignore surrounding whitespace and letter case.

The editing lock guards UI controls and programmatic view operations. Rejected switches are not queued.
Storage requests disable view controls until completion and reject duplicate operations.
A save captures configuration when it starts. A delayed response never applies configuration over newer controls or record edits.
Disposal aborts pending requests and ignores late responses.
Storage actions restore keyboard focus after their controls become available again.
A later pointer action, key press, or focus change cancels that restoration. Disposal removes the temporary listeners.

Each child model owns its view controller, so collapse preserves its list and selected view.
Child storage scopes include the dataset and parent record ID. Parent and sibling lists remain independent.
Changing datasets releases the old child controllers. Returning to a dataset can reload its saved list without automatically applying it.
These scoped lists contain configuration only. They do not retain child records after disposal.

## Stable layout during editing

Open editors, unsaved drafts, and pending saves lock changes to table configuration.
Leaving an unchanged editor releases its draft. Leaving a changed editor keeps the lock until Save or Cancel resolves the draft.
Failed saves keep their drafts and the lock. Other rows remain editable.

The lock covers filters, search, sorting, grouping, aggregates, column layout, save mode, display controls, and dataset changes.
Controlled setters reject changes as well as disabling the visible controls. They do not queue rejected configuration changes.
Child edits also lock parent transitions that can hide or move the child. Sibling tables keep independent editing and saves.

The model passes the reactive `rowProcessingPaused` option to Table.
The table retains existing ID arrays and group structures while cell values continue to read the canonical Solid store.
A partial save can update a cell without moving or hiding its row while other edits remain.
Concurrent revisions remain visible to save validation. A queued removal makes the record unavailable to saves but retains its rendered data until editing ends.

The lock does not copy records or mark them dirty. It derives from the existing draft collection and save state.
Each child reports its own editing state. One parent boolean avoids subscribing a single computation to every child draft.
One DOM effect disables the parent row controls, so individual rows do not subscribe to a shared editing flag.
Paused processing drops subscriptions to scanned fields. Releasing the lock derives the current membership and order once, including after an unchanged session.

## Sub-tables

Each expanded parent record can render another Table with its own records, filters, grouping, summaries, widths, order, and drafts.
The demo starts child tables in Whole table save mode. Each save button saves only its own table.
The same logical row ID can exist in separate collections. Each rendered table uses distinct IDs for accessible messages.

`App.loadChildren` accepts a parent ID, dataset scope, and abort signal. Replace this boundary with the application transport.
The local loader returns five distinct records after a short delay. It never copies parent records.
The browser harness also supplies held, late, empty, refused, and failed responses.

The first expansion loads the child collection. Collapse removes its rendered row views and listeners while preserving its collection and configuration.
Parent filtering, regrouping, and collapse are unavailable while a child has open editors, drafts, or a pending save.
After edits resolve, opening a collapsed child reuses its existing Solid store.
The registry stores lookup functions under parent IDs. Each parent row subscribes only to its own lookup property.
A row and its detail row share one keyed `tbody`. The outer insertion effect does not subscribe to every detail branch.

Dataset changes require all affected edits to resolve first. The programmatic change path enforces the same rule.
Parent removal waits while editing remains active. After editing ends, removal releases the child scope and aborts outstanding loads.
A pending child save keeps its table open and respects later focus changes. Each child still saves only its own records.

Use the built fixture to capture child heaps:

```sh
BENCH_DISTRIBUTION=1 BENCH_PROFILE=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/editing/vite.config.ts
BENCH_DISTRIBUTION=1 BENCH_SCENARIOS=0 BENCH_WORKLOADS=0 BENCH_CHILD_WORKLOAD=1 BENCH_HEAPS=/tmp/table-subtables-heaps node packages/solid-table/bench/editing/run.mjs
```

The workload compares retained resources after 10, 100, and 200 collapse cycles, then after expansion, parent removal, and disposal.
`BENCH_WORKLOADS=0` skips the larger editing and column workloads. `BENCH_CASE_PATTERN` selects browser scenarios by regular expression.

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
Summaries appear in their corresponding columns on each visible group row. They use saved records that pass the active filters.
A second header row shows `group`, the aggregate name, or `-` for each column. Group summary cells show only formatted values.
If a grouped column also has an aggregate, its header shows both labels, for example `group · count`.
Grouped columns lead in grouping order. Clearing grouping restores the previous manual order.
Grouped columns have no move handles. Reorder the grouping levels to change their positions.
The result count distinguishes displayed records from records that match filters.

Grouping uses saved values. The editing lock also prevents background updates from moving parent records between groups.
Grouped records are read-only. They render saved values without edit controls or draft subscriptions.
Clear grouping before editing records. Finish or discard edits before enabling grouping.
Group summary rows have no edit or sub-table subscriptions.
Individual records inside expanded groups can open sub-tables. Those child tables keep their own editing controls.

Display options can hide the grouping controls while preserving their configuration.
The local-processing gate disables grouping and summaries and shows the caller-provided record order.
Restoring local processing restores grouping and expansion.

Group rows use Table group views within their rendered Solid owners.
Collapsed descendants release their row and group views. Active edits prevent collapse.
The source store retains one canonical record per ID. Group membership stores IDs, and summaries iterate over those IDs.
Ordered key comparisons prevent unchanged group lists from notifying subscribers after an edit stays in the same group.
These comparisons do not remove membership scans or summary reads.

## Column resizing

Dragging a header edge resizes its whole column immediately, including body cells.
The table has no width Save or Reset controls. Double-clicking an edge does not reset it.
Widths live only in the current Table state. Remounting the table restores its initial widths.
Column metadata supplies each default, minimum, and maximum width.

The Display options panel offers two resize behaviors.
Grow table changes the total table width and shifts the following columns.
Keep table width transfers space between the column and its next visible resizable neighbor.
Both columns retain their width limits. A limit on either column stops the shared edge.

The Actions column keeps its fixed width, so fixed-width mode has no handle after the last data column.
Switching modes preserves the current widths. Fixed-width drags preserve the total at the start of each drag.

The focused handle accepts Left and Right for 10-pixel changes, or 50 pixels with Shift.
Home and End select the available minimum and maximum widths.
Escape ends a drag at its current width. Lost capture, window blur, a hidden document, and removal of the handle also end it.
Caller changes to the active width or its bounds stop a stale gesture without overwriting the caller.
The handle exposes its label and current pixel width through a vertical ARIA separator.

Display options can hide resize controls independently of header filters and sorting. Hiding controls preserves current widths.
Resizing remains available when local record processing is disabled.
`TableColumnResize.tsx` receives a width, bounds, and a change callback. It owns the gesture listeners.
The Table component updates one width in Grow table mode, or both adjacent widths in one update in Keep table width mode.
Controlled Table state still requires the caller to accept width updates.

The table uses one `colgroup` for header and body widths. Its total width includes the fixed Actions column.
Group spans follow the same table geometry. A narrow viewport scrolls horizontally without horizontal virtualization.
Pointer movement updates widths without reading records or replacing views, cells, or drafts.
The browser recalculates layout as the width changes and can change cell wrapping and row heights.

Chromium tests cover keyboard, mouse, and emulated touch behavior. Other browsers and assistive technologies need separate qualification.

## Column rearrangement

Each movable header has a dotted handle. Drag the handle to show a drop marker, then release to move the column.
Headers, body cells, group summaries, and width definitions follow the same column order.
The browser scrolls the table when a drag reaches the left or right edge of its scroll area.

The focused handle accepts Left and Right to move one visible place. Home and End move to the first and last available places.
Clicking the handle opens four move buttons. Enter or Space opens the same controls, and Escape closes them.
The move controls use a standard browser popover. They add no UI or drag library.
Sorting and resizing have separate controls, so moving a column does not sort it or change its width.

Actions stays last and has no move handle. Caller-pinned columns retain their positions at the configured edges.
Movable columns stay between those pinned groups. A single movable column has a disabled handle.
The move operation retains hidden IDs and the relative order of unaffected columns.
Showing a hidden column restores its position in that order.

The fixture owns `columnOrder` through a controlled Solid signal and accepts Table change callbacks.
Caller changes to that signal update the display without a UI gesture. An empty order restores the definition order.
Display options can hide move controls without discarding the order. Rearrangement remains available when local record processing is disabled.
Order persistence belongs to the future parent view component.

Width, filter, sorting, and aggregate configuration stays attached to each column ID.
Rearrangement preserves cell and row identities. Open editors, drafts, and pending requests disable rearrangement.
Caller changes preserve the active input and its text selection, including when the browser temporarily drops focus during a DOM move.
Focus restoration runs after owned effects and respects later user interactions. It does not write draft state from an effect.
Blocked programmatic rearrangement preserves editor focus and text selection. Leaving a row still closes its editors and preserves drafts.

Escape, pointer cancellation, lost capture, window blur, and a hidden document cancel a drag without changing the order.
Changes to movable columns or removal of a handle also cancel its drag. Cleanup removes the marker, scroll frame, and gesture listeners.
The pointer loop reads header geometry only. A completed move allocates column-ID arrays and moves existing DOM nodes.
Solid also builds ordered cell lists for rendered rows. That list and DOM work scales with the number of rendered rows.
It does not copy records, scan their values, rebuild groups, or replace row views and cells.

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
Table controls cannot hide drafts. Background removal waits until the editing session ends.
Saving a value that moves its row preserves the logical record target for focus.
If the saved row leaves the filter, focus moves to the filter control.
A completed request does not reclaim focus after a later pointer or focus interaction.

Refusals, conflicts, unknown outcomes, and transport failures preserve the draft.
Cancel reveals the current committed values after a conflicting update.
The fixture rejects a response for another record or a revision that changed during a request.
It never recreates a removed record from a late response.

## Optional global save

The Save mode selector switches between Per row and Whole table when no edits remain.
Per row remains the default. The fixture accepts `saveMode="table"` to start in Whole table mode.
The URL parameter `save=all` selects the same initial mode.

In Whole table mode, Save all replaces the row Save buttons.
Enter closes a text editor and preserves its draft. Escape or Cancel discards that row draft.
Native dropdown keys keep their existing behavior.
The button includes every outstanding draft in its table.

Save all captures the draft IDs and applies the application schema to each draft before sending any request.
An invalid value, missing record, or known revision conflict blocks the whole attempt.
Errors remain beside their cells.
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
They also cover pointer entry, option changes, invalid values, concurrent updates, refused saves, and blocked filter changes during editing.
The fixture does not provide a custom popup, searchable choices, remote options, or multiple selection.
Other browsers and operating systems need separate interaction tests.

The [Zaidan and Kobalte review](./select-guidance.md) records WAMN controls and upstream Solid 2 branch status.
The separate [popup fixture](../popup/README.md) supplies a real Kobalte Select through the parent-owned `priorityEditor` component.
It tests keyboard, focus, save behavior, and cleanup against the pinned Table runtime.
The regular fixture keeps its HTML select and excludes Kobalte from its bundle.

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

The live server keeps Solid development checks enabled. It does not record a timeline during ordinary review.
Set `BENCH_TRACE=1` when starting Vite to enable timeline recording with a one-millisecond span threshold.
Detailed recording adds measurable work to large render operations.
Set `BENCH_ATTRIBUTION=1` on the browser runner to capture subscriptions and rerun causes for the grouping scenario.
This capture proves that grouped records do not read drafts. It also tests that hidden child loads do not rerun group summaries.
Start the fixture server before running the same suite against its URL:

```sh
BENCH_URL=http://127.0.0.1:7777/ BENCH_SIZES=25 BENCH_OUTPUT=/tmp/table-editing-live.json node packages/solid-table/bench/editing/run.mjs
```

The repeated-draft case creates eight drafts, rejects filter changes, and saves the drafts together before filtering resumes.
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
Switching between grouped and ungrouped modes replaces read-only and editable row owners. Live owner counts remain bounded.
The aggregate workload switches Amount through median, range, span, first, last, count, and sum, then repeats summary changes.
With two grouping levels, scanning aggregates read two amount values per record across the observed groups.
Median allocates one temporary number array per observed group. The workload counts the numbers placed into those arrays.
First and last each read four endpoint values across four groups. Count reads none.
These changes must retain existing views, cells, membership, note reads, and date reads.
The additional `summaries` snapshot measures retained resources after these changes.
The resize workload repeats six drags and two keyboard changes in both width modes at each measured subset size.
Thirty pointer moves update widths before release. Two keyboard changes bring the total to 32 sizing updates per mode.
Record reads, grouping reads, summaries, views, cells, validation calls, and save requests must remain unchanged throughout this workload.
Browser listener counts return to their initial value after garbage collection removes temporary automation listeners.
The additional `resized` snapshot must retain the same records, views, cells, stores, computations, and owners as `summaries`.
The first width writes can change the links between existing computations and their dependencies.
The `resized-repeat` snapshot measures another nine cycles of both modes. The `resized-settled` snapshot follows ten further cycles.
The later snapshot must not exceed the earlier one in retained Table or Solid resources, including dependency links.
The disposed snapshot must contain no classified group views, group cells, or membership nodes.
The rearrangement workload performs six drags and nine keyboard moves at each measured subset size.
Those 15 order changes must preserve widths and produce no record reads, replacement views or cells, summary calculations, validations, or requests.
The `reordered` snapshot measures retained resources after those moves.
The `reordered-repeat` and `reordered-settled` snapshots compare 150 and 300 moves for retained resource growth.
Gesture listeners must return to their baseline. The disposed snapshot must contain no classified Table or Solid resources.
Timings include browser automation and remain advisory on the shared development machine.
They do not establish a latency budget or a universal non-virtualized row limit.

The [heap report](../heap-findings.md#non-virtualized-editing-fixture) records the qualified results and the retained-value diagnosis.

To capture the editing lock lifetime separately from the larger workloads:

```sh
BENCH_DISTRIBUTION=1 BENCH_SCENARIOS=0 BENCH_WORKLOADS=0 BENCH_LOCK_WORKLOAD=1 BENCH_HEAPS=/tmp/table-editing-lock-heaps node packages/solid-table/bench/editing/run.mjs
```

This workload captures 250 records after 10, 100, and 200 edit/cancel cycles, then disposal.
It compares retained resource counts and reports the field reads caused by releasing the lock.
The host runs other development loads, so timing measurements remain advisory.

To measure named-view switching, first build the distribution fixture with `BENCH_DISTRIBUTION=1 BENCH_PROFILE=1`.
Then run its focused workload:

```sh
BENCH_DISTRIBUTION=1 BENCH_SCENARIOS=0 BENCH_WORKLOADS=0 BENCH_VIEW_WORKLOAD=1 BENCH_HEAPS=/tmp/table-views-heaps node packages/solid-table/bench/editing/run.mjs
```

The workload alternates two sort views over 100 parent records. It also retains a collapsed child with five records and its own view.
Four snapshots cover 10, 100, and 200 pairs of switches, then disposal.
The harness compares record, Table, Solid, saved-view, and configuration counts between snapshots.
Separate browser scenarios cover storage failures, stale configurations, editing locks, and independent child lists.
Saving, renaming, reloading, and deleting views perform no record reads or row recreation.
Switching sort views runs the required sort scan and preserves record and rendered-row identity.

The shared host reached its temporary-file quota during qualification.
On this host, `TMPDIR=/dev/shm` moves Chromium scratch files into the available shared-memory filesystem.
Heap artifacts still use `BENCH_HEAPS`. Keep this host workaround outside application code.
