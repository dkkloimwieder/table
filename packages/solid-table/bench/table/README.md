# Shared Table presentation

The private `@table/ui/table` components render an application-owned native Table. They do not create an editing model or a record store.
`Table.tsx` owns the table structure, headers, read-only cells, and grouped rows.
It accepts callbacks for custom headers, row content, formatting, and extra columns.
The editing adapter supplies editors, save controls, sub-tables, and edit locks through these callbacks.
The analytics adapter supplies query status, header names, server sorting, and a server export action.
The optional `renderBody` callback supports virtual rows while preserving the shared headers and cells.

`ReadOnlyTable.tsx` adds sorting, column filters, search, grouping, visibility, and column ordering to the shared presentation.
It accepts a native Table from the application. The application supplies its source, columns, comparison functions, and filter functions.
The component keeps no separate copy of the records or Table state.
Applications can disable individual controls through the `controls` prop.

Grouping controls accept Table operations and optional summary callbacks. They do not depend on an editing model.
Column movement, resizing, filters, sorting buttons, and header renaming live in the same UI package.
The editing and analytics adapters use these shared controls.
Analytics keeps search and filtering disabled. Its server export includes the complete query, independent of the preview or loaded window.

Applications explicitly import `@table/ui/styles.css` and apply `uiScope()` to their owning wrapper.
The shared stylesheet contains Table, editor, column, and popup rules. Fixture CSS contains page layout.
The components now live in `packages/solid-ui/src/table`. The package stays private during extraction.
This directory retains virtual presentation until Beads `table-qp8.3.2` moves that source.

[Generic UI boundaries](./UI-BOUNDARIES.md) defines the planned private workspace packages,
generic component contracts, styles, and extraction order under Beads epic `table-qp8`.
Its TypeScript examples compile with `pnpm --filter @tanstack/solid-table test:ui:contracts`.
