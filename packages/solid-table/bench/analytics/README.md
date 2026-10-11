# Query analytics

This development demo shows query results in a read-only Table. The application supplies the query state, column definitions, and records.
The table supports sorting, column visibility, column order, header renaming, and an application export action.
Drag the handle in a header to reorder columns. Arrow keys, Home, and End also move the focused column.
Click the pencil in a header to rename it. Enter or focus loss saves the name. Escape cancels the rename.
The table has no search or column filters. The application query defines the complete set of rows.

The demo uses the [shared Table presentation](../table/README.md) for headers and rows.
The [read-only demo](../read-only/README.md) uses that presentation with sorting, grouping, and filtering.

## Query results

`Table` accepts a reactive `query` prop with `loading`, `error`, or `ready` status. The optional `retry` callback belongs to the application.
The application owns query transport, authentication, request cancellation, and response validation. The demo application uses two local result sets.
The table does not fetch data or infer business rules.

A ready result contains `key`, `columns`, and `rows`. The application supplies a stable query key and unique column and row IDs.
Each column contains `id` and `label`. Each row contains `id` and `values`, which maps column IDs to strings, numbers, booleans, or null.
Column IDs can contain dots. The table treats them as literal field keys.
The application defines the columns even when no rows exist. Extra record fields stay outside the table.
Convert dates and structured values to these scalar types in the application.

The table reads the original records through an ID index. It does not copy records into an editing store.
Publish a new ready result to replace records. Display choices survive replacement when the query key and ordered column IDs stay the same.
If the query key or schema changes, the table resets its display choices. A schema is the ordered list of column IDs.
Header changes affect display labels only. They do not change field IDs, source values, or sorting.
Reset display restores the supplied labels, column order, visibility, and row order.
Display choices remain in memory until the component closes or the query scope changes.

During loading or an error, the table hides its previous rows and disables display changes and export.
It retains the last result reference for a same-schema retry. Before the first ready result, it shows the query status only.

## Export

The optional `onExport` prop receives a `QueryExportRequest` when the user selects Export.
Without this callback, the table hides the export button. `exportLabel` changes its label, which defaults to Export.
The application can set `exportDisabled` during an export job or when export is unavailable.
The table also blocks export during query loading, errors, or when every column is hidden.

The request contains the query key, visible column IDs and labels in display order, sorting, and ordered row IDs.
These arrays capture the display choices at the click. Later display changes and query refreshes do not change the request.
The request contains no record copies, table methods, or browser download objects.
The application owns the export format, file name, transport, progress, errors, and cancellation.
If a client export runs later, retain the application result reference at the click.
For a server export, use the query key, columns, and sorting to request the complete query result.
The row IDs describe the supplied rows only. They do not limit a server export or fetch additional pages.
The server must resolve the application query key and apply its own authorization rules.

The demo application supplies a client CSV callback that downloads `analytics.csv`. CSV is a text format with comma-separated fields.
The table itself does not generate CSV or download files.
The file includes every supplied query row in the current sort order. It includes visible columns in the current column order and renamed headers.
The export covers the supplied result only. It does not fetch additional server pages.
With no query rows, the file contains headers. With no visible columns, export is disabled.
Null and absent fields produce empty cells. Zero and false remain explicit values.
The file uses UTF-8, a byte order mark, and CRLF row endings. Quotes, commas, and line breaks receive CSV escaping.
Formula-like strings receive an apostrophe prefix so that spreadsheets treat them as text. Numeric negatives remain numbers.
Downloads release their temporary Blob URLs. A Blob URL is a browser reference to generated data.
The client callback builds the complete file in browser memory. Use a server export for large or paged query results.

## Run

From the repository root, start the demo on port 7783:

```sh
pnpm --filter @tanstack/solid-table exec vite --config bench/analytics/vite.config.ts --host 127.0.0.1 --port 7783
```

Open `http://127.0.0.1:7783`. Select Sales or Inventory to show different result schemas.
Run query refreshes the selected result. The application owns the loading state.

From the repository root, build and test the source demo:

```sh
pnpm --filter @tanstack/solid-table exec vite build --config bench/analytics/vite.config.ts
pnpm --filter @tanstack/solid-table exec node bench/analytics/run.mjs
```

Install Playwright Chromium before the browser test. Use `BENCH_DISTRIBUTION=1` for both commands to test built package imports after a package build.
Use `NODE_ENV=development BENCH_DEVELOPMENT=1` for both commands to include runtime diagnostics.
`pnpm test:solid:qualification` includes source and distribution builds, actual CSV downloads, loading/error/empty states, changing schemas, and display controls.
The browser test also covers refreshes, escaped values, keyboard sorting, narrow screens, and disposal.
Tests run in sequence. Host timings remain advisory because other processes share the machine.
