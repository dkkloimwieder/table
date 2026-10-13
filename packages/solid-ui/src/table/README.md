# Table presentation

Import Table presentation from `@table/ui/table`.
These components render an application-owned native Table without creating records, transport, or an editing model.
Editing, read-only, and analytics demos use the same source.

The export contains `Table`, `TableRow`, and `ReadOnlyTable`.
Column controls contain `TableSort`, `TableFilter`, `TableHeaderFilter`, `TableHeaderName`, `TableGrouping`, `TableColumnMove`, and `TableColumnResize`.
`moveColumn` returns column IDs in the requested order and retains hidden IDs.
Types contain `TableEdge`, `TableFilterProps`, and `ColumnDestination`.

## Composition

Import `@table/ui/styles.css` explicitly and apply `uiScope()` to the owning wrapper.
Create the native Table in application code and pass it through the `table` prop.
The native engine remains `@tanstack/solid-table/native`.
The UI package declares this engine as an optional peer because other UI subpaths do not require it.

`Table` accepts header, row, body, formatting, and edge callbacks.
The application can supply editors and action controls through these callbacks.
`ReadOnlyTable` adds sorting, filtering, search, grouping, summaries, visibility, and column ordering.
Its `controls` prop can disable individual features.
Neither component copies the application records.

Column controls receive values, bounds, IDs, and callbacks.
Applications own permissions, requests, validation, save rules, export, and persistence.
Header naming changes the display label through `onRename`.
The component keeps the rename icon hidden while the editor is open.

## Source ownership

The canonical event helper lives in `../utils/nativeEvents.ts`.
It removes native listeners when the Solid owner disposes.
The library imports no example or application source.
The original example helper re-exports this implementation for existing consumers.

Optional virtual presentation is exported through `@table/ui/virtual`.
Paging, caches, memory estimates, and server export remain application code.

## Tests

Run `pnpm --filter @table/ui test:types` from the repository root.
Run `pnpm --filter @table/ui test:eslint` to test source lint.
Run `pnpm --filter @table/ui test:boundaries` to test import ownership.
The standard Solid qualification suite runs these tests and existing fixture browser cases.
The tests cover source and built native-engine modes through the same UI exports.
