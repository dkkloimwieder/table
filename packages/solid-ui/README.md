# Shared UI presentation

`@table/ui` is a private workspace package for generic styled controls and Table presentation.
The workspace structure exists. Source extraction follows the existing issues under Beads `table-qp8`.
The package exposes no component API yet.
It does not copy the running fixtures into a second renderer.

## Source layout

`src/components` contains styled form, overlay, and display controls.
`src/table` contains Table presentation and column controls.
`src/virtual` contains the one Solid virtual binding and visible row presentation.
`src/virtual/vendor/virtual-core` contains the existing owned virtual engine after migration.
`src/styles` contains scoped styles, shared variables, and optional themes.

Applications will import controls from the root and component subpaths.
The planned Table, virtual, and CSS exports remain `@table/ui/table`, `@table/ui/virtual`, and `@table/ui/styles.css`.
The source passes add these exports when their implementations exist.
Native engine imports remain `@tanstack/solid-table/native`.

## Current source owners

[Shared Table presentation](../solid-table/bench/table/README.md) remains the source until extraction.
`Table.tsx`, `ReadOnlyTable.tsx`, and `Table*.tsx` column controls move to `src/table`.
`createVirtualizer.ts`, `VirtualRows.tsx`, and `virtualWindow.ts` move to `src/virtual`.
The existing `bench/table/vendor/virtual-core` moves to `src/virtual/vendor/virtual-core` with its licenses and provenance.
`style.css` and `column-move.css` move into the shared style layer after selectors become component scoped.
Table extraction also removes reverse imports from example directories.

Editing, analytics, read-only, popup, and WAMN fixtures remain application consumers under `packages/solid-table/bench`.
Their transports, records, caches, validators, controllers, and mock services do not move into this package.
The same fixture directories remain available for incremental migration and browser review.

## Ownership

Styled controls use behavior from `@table/ui-core` or native HTML.
Table uses the existing native engine and caller-owned records.
Applications own enabled features, actions, validation, requests, submission, queries, export, and persistence.
The library provides generic values, callbacks, and composition slots.
It contains no WAMN screen contract.

Compact styling remains the default.
All controls share fonts, spacing, borders, colors, focus, and density variables.
Fixed row geometry reads the same density configuration as CSS.
The virtual binding computes visible ranges and never fetches records.
Both fixed and measured modes keep one engine and one Solid binding.

## Development

From the repository root, run:

```sh
pnpm --filter @table/ui test:types
```

This command currently tests the package scaffold.
Source passes add their own type and behavior tests.
The [boundary decision](../solid-table/bench/table/UI-BOUNDARIES.md) defines the public contract and component catalog.
