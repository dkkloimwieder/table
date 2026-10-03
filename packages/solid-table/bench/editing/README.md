# Non-virtualized inline editing

This fixture tests inline text editing with the native Solid Table entry and plain HTML controls.
It renders every matching record. Virtualization is optional elsewhere and is not a dependency here.
The measured editing subsets contain 25, 250, and 999 records. These sizes are not product limits.

## Editing behavior

Activate a name or note button to open a row draft.
Both text fields belong to that draft and share one revision.
Tab and Shift+Tab follow the browser's normal control order without saving.
Clicking another row preserves the first draft. Multiple rows can have drafts.

Save or Enter saves the row. Escape or Cancel discards its draft.
An unchanged save sends no request. A blank name keeps the editor open with an error.
Composition events do not save or cancel an unfinished input method composition.
Pending requests make their inputs read-only and disable Save and Cancel.
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

## Ownership and scope

`model.ts` owns one Solid record store. Table reads records through IDs.
`createEditing.ts` owns temporary editable fields and their base revision outside row components.
Its synchronous request map prevents duplicate submissions before Solid commits a pending-state write.
An accepted save preserves the record's public identity and changes its fields.
The controller does not copy the dataset or replace unaffected rows.
Solid's property tracking can retain an older record value internally. The heap tests measure that cost and its disposal.

The save transport is a deterministic local simulation with refusal, conflict, delay, and failure controls.
It does not connect to WAMN or implement a production persistence protocol.
The module audit rejects table-core, TanStack Store, virtual-core, Form, and the excluded UI libraries.
Dropdown editors, row selection, and bulk-action design remain separate work in `table-gd3.6.7`.
The editing controller is fixture code, not a new public Table API.

The fixture uses the existing native event listener cleanup and rc.13 root-disposal workaround.
Beads `table-gd3.6.4` and `table-gd3.6.5` track those runtime workarounds.

## Run the fixture

These commands require the repository dependencies and an installed Playwright Chromium browser.
Run them from the repository root.

```sh
pnpm --filter @tanstack/solid-table exec vite --config bench/editing/vite.config.ts
```

Open the local URL printed by Vite. Add `?size=250` to change the initial record count.
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

Use the development runtime to detect Solid diagnostics:

```sh
NODE_ENV=development BENCH_DEVELOPMENT=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/editing/vite.config.ts
BENCH_DEVELOPMENT=1 BENCH_SIZES=25 BENCH_OUTPUT=/tmp/table-editing-development.json node packages/solid-table/bench/editing/run.mjs
```

Set `BENCH_EXECUTABLE_PATH` to use a specific installed Chromium binary.
The report records the actual browser version.
The runner starts a temporary local server and closes it and Chromium in its cleanup block.

The runner tests keyboard and pointer flows, draft retention, request races, record identity, and disposal.
Subset workloads require every matching row to render and reject replacement Table views or cells during an edit.
Heap captures classify records and reactive resources before and after disposal.
They also measure 20 further edits to one record and an edit to a second record.
Timings include browser automation and remain advisory on the shared development machine.
They do not establish a latency budget or a universal non-virtualized row limit.

The [heap report](../heap-findings.md#non-virtualized-editing-fixture) records the qualified results and the retained-value diagnosis.
