# Query analytics

This development demo shows query results in a read-only Table. The application supplies the query state, column definitions, and records.
The table supports server sorting, column visibility, column order, header renaming, and server export.
Drag the handle in a header to reorder columns. Arrow keys, Home, and End also move the focused column.
Click the pencil in a header to rename it. Enter or focus loss saves the name. Escape cancels the rename.
The table has no search or column filters. The application query defines the complete set of rows.

The demo uses the [shared Table presentation](../table/README.md) for headers and rows.
The [read-only demo](../read-only/README.md) uses that presentation with sorting, grouping, and filtering.

## Query results

`Table` accepts a reactive `query` prop with `loading`, `error`, or `ready` status. The optional `retry` callback belongs to the application.
The application owns query transport, authentication, request cancellation, and response validation. The demo server supplies Sales, Inventory, and a 100,005-row result.
The table does not fetch data or infer business rules.

A ready result contains `key`, `columns`, and `rows`. The optional `totalRows` reports the complete query count. The application supplies a stable query key and unique column and row IDs.
Each column contains `id` and `label`. Each row contains `id` and `values`, which maps column IDs to strings, numbers, booleans, or null.
Column IDs can contain dots. The table treats them as literal field keys.
The application defines the columns even when no rows exist. Extra record fields stay outside the table.
Convert dates and structured values to these scalar types in the application.

The table reads the original records through an ID index. It does not copy records into an editing store.
Publish a new ready result to replace records. Display choices survive replacement when the query key and ordered column IDs stay the same.
If the query key or schema changes, the table resets its display choices. A schema is the ordered list of column IDs.
Header changes affect display labels only. They do not change field IDs, source values, or sorting.
Reset display restores the supplied labels, column order, and visibility. It requests the original row order from the application.
Display choices remain in memory until the component closes or the query scope changes.

During loading or an error, the table hides its previous rows and disables display changes and export.
It retains the last result reference for a same-schema retry. Before the first ready result, it shows the query status only.

## Preview and full browsing

The table shows at most 1,000 supplied rows by default. The `previewLimit` prop changes this limit.
The application must also limit the server query response. A display limit does not reduce the data that the browser receives.
The demo requests 1,000 rows and shows the complete query count next to the loaded count.
The table area fills the screen below the query and display controls.
Its height stays the same for small or empty results and when Load all enables paging.
Opening Display columns uses space above the table. Resizing the browser changes the available table height.

Sorting belongs to the application through `sorting` and `onSortingChange`.
The table uses manual sorting, which preserves the order supplied by the server.
A sorting change requests the first preview rows from the complete sorted query. It does not sort just the preview.
Header names, column order, and visibility survive a same-schema sorting response.

The optional `onLoadAll` callback receives the query key and current sorting.
The application decides how to browse the complete query.
In the demo, Load all enables paging as the user scrolls. It does not download every record into browser memory.
The application retains visited pages in a cache, which stores records for later reuse.
The default cache budget is 16 MiB of estimated record storage, with a 100,000-row cap.
The cache removes the least recently used pages when either limit is reached. Cheap rows stay cached longer than large rows.
Returning to a cached range avoids another server request. The application fetches missing pages with at most two concurrent requests.
Sorting, a new query, Run query, and disposal clear the cache. Show preview reuses the first cached rows when available.

`createQueryPageCache` accepts `maxBytes`, `maxRows`, `pageSize`, and `estimateRowBytes`.
The default page size is 1,000. The application can reduce it for larger records.
The default estimator counts strings, scalar values, field names, and estimated object overhead.
A custom `estimateRowBytes(row)` supplies the application's estimate. This budget does not measure the browser's exact heap usage.
The active view, response parsing, framework objects, and temporary arrays need additional memory.
Pages larger than the budget bypass the cache. The active view still receives the rows needed for scrolling.
Set `maxBytes` or `maxRows` to zero to disable retention of inactive pages.

The active Table source normally holds two pages. It can hold more pages when the viewport needs more rows.
Cached records outside this window do not receive table bindings. The application owns cache configuration and transport.
The demo fixture accepts this configuration through `startServer(cacheConfiguration)`.

Both preview and full browsing use the shared `VirtualRows` renderer with fixed-height geometry.
It renders visible rows plus a small buffer and calculates their positions directly.
`QueryRows` maps query offsets to loaded record IDs and requests missing pages through the application callback.
The shared Table renderer still supplies the headers and record cells.
Rows use a fixed height in this view. Text stays on one line.
Geometry work uses only the visible range. It does not allocate position keys or measurements for the complete query count.

The optional `window` prop supplies the loaded offset, complete count, loading state, and `onRangeChange(offset, end)` callback. The optional end index follows the last requested row. These indices describe the range needed by the viewport.
Show preview calls `onShowPreview` and returns to the first 1,000 rows with the current sorting and header choices.

The application cancels replaced query requests and ignores late responses after a query change or disposal.
Page failures retain the query and provide Retry rows. Query failures use the existing Retry query action.

## Export

The optional `onExport` prop receives a `QueryExportRequest` when the user selects Export.
Without this callback, the table hides the export button. `exportLabel` changes its label, which defaults to Export.
The application can set `exportDisabled` during an export job or when export is unavailable.
The table also blocks export during query loading, errors, or when every column is hidden.

The request contains the query key, visible column IDs and labels in display order, and sorting.
These arrays capture the display choices at the click. Later display changes and query refreshes do not change the request.
The request contains no row IDs, records, preview limit, table methods, or browser download objects.

The server exports the complete query independently of the preview or loaded window.
The application owns the export format, file name, transport, progress, errors, and cancellation.
The server must resolve the application query key and apply its own authorization rules.
Use a query identity that refers to the intended result version when results can change between requests.

The demo application requests a download URL from the demo server. The browser then downloads `analytics.csv` directly from that URL.
CSV is a text format with comma-separated fields. The server writes each CSV row as it sends the file.
The browser does not build a CSV string or Blob. A Blob is a browser object that holds generated data.
The server includes every query row, visible columns in the current column order, and renamed headers.
With no query rows, the file contains headers. With no visible columns, export is disabled.
Null and absent fields produce empty cells. Zero and false remain explicit values.
The file uses UTF-8, a byte order mark, and CRLF row endings. Quotes, commas, and line breaks receive CSV escaping.
Formula-like strings receive an apostrophe prefix so that spreadsheets treat them as text. Numeric negatives remain numbers.

`demo-server.mjs` provides query, export, and download routes for Vite and the browser test server.
It stores fixed mock records in server memory. A cache holds up to four sorted results and clears them when test records change. The test-only registration route supplies records for the existing browser cases.
This server demonstrates the component contract. Applications supply their own query and export services.

## Run

From the repository root, start the demo on port 7783:

```sh
pnpm --filter @tanstack/solid-table exec vite --config bench/analytics/vite.config.ts --host 127.0.0.1 --port 7783
```

Open `http://127.0.0.1:7783`. Select Sales, Inventory, or Large result to show different result schemas.
Run query refreshes the selected result. The application owns the loading state.

From the repository root, build and test the source demo:

```sh
pnpm --filter @tanstack/solid-table exec vite build --config bench/analytics/vite.config.ts
pnpm --filter @tanstack/solid-table exec node bench/analytics/run.mjs
```

Install Playwright Chromium before the browser test. Use `BENCH_DISTRIBUTION=1` for both commands to test built package imports after a package build.
Use `NODE_ENV=development BENCH_DEVELOPMENT=1` for both commands to include runtime diagnostics.
`pnpm test:solid:qualification` includes source and distribution builds, actual CSV downloads, loading/error/empty states, changing schemas, and display controls.
The browser test also covers refreshes, escaped values, keyboard sorting, narrow screens, disposal, full server exports, and distant scroll ranges.
Use `BENCH_CASE="Load all"` to run only the full-browsing case.
Tests run in sequence. Host timings remain advisory because other processes share the machine.
