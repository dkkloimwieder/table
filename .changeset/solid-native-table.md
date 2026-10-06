---
'@tanstack/solid-table': minor
---

Add the focused Solid 2 engine at `@tanstack/solid-table/native`.
It reads a caller-owned record store through ordered IDs and record readers.
Its runtime uses Solid without table-core or TanStack Store.

The entry provides direct reactive cell values, scoped row views, column commands, and controlled or internal view state.
Basic flat filtering and sorting support explicit functions and server-owned processing.
Global search uses eligible visible columns and accepts a custom matcher.
Lazy facets exclude their own column filter and release unused dependencies.
Sorting supports stable ties and explicit placement for missing values.
Native groups support nested paths, independent expansion, aggregate ordering, and iterator-based totals.
Group identity stays separate from record identity, and only visible groups create cell scopes.
One manual-processing flag disables local data features while retaining view state.
Applications can supply authoritative external totals and facets for partial results.
Native row sections separate top pins, the scrollable sequence, and bottom pins without duplicating displayed records.
Column sizing commands clamp widths and update view state without reading records.
The processing pause holds evaluated row structure while cell values remain live.
Applications guard configuration changes and retain displayed records while that pause remains active.
The native virtualized example uses logical keys for measured geometry and creates views only for its rendered window.
It preserves scroll position through layout changes and keeps edit drafts outside disposable row scopes.
Browser coverage includes refused saves, concurrent edits, and keyboard navigation across virtual windows.
Row views follow rendering lifetime, and source indexes are lazy.
Live column definitions avoid retaining disposed tables through V8 object templates.

This entry does not yet provide the complete WAMN grid feature set.
