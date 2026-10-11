# Shared Table presentation

These development components render an application-owned native Table. They do not create an editing model or a record store.
`Table.tsx` owns the table structure, headers, read-only cells, and grouped rows.
It accepts callbacks for custom headers, row content, formatting, and extra columns.
The editing adapter supplies editors, save controls, sub-tables, and edit locks through these callbacks.
The analytics adapter supplies query status, header names, and CSV export.

`ReadOnlyTable.tsx` adds sorting, column filters, search, grouping, visibility, and column ordering to the shared presentation.
It accepts a native Table from the application. The application supplies its source, columns, comparison functions, and filter functions.
The component keeps no separate copy of the records or Table state.
Applications can disable individual controls through the `controls` prop.

Grouping controls accept Table operations and optional summary callbacks. They do not depend on an editing model.
Column movement, resizing, filters, sorting buttons, and header renaming also live here.
The editing and analytics adapters use these shared controls.
Analytics keeps search and filtering disabled. Its export includes every supplied query row.

The components remain development examples. They do not add a published UI API.
