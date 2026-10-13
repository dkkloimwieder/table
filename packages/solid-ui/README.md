# Shared UI presentation

`@table/ui` is a private workspace package for generic styled controls and Table presentation.
Shared scoped styles and density values are implemented. Component extraction follows Beads `table-qp8`.
The package exports `uiScope`, `uiDensity`, `UI_DENSITIES`, and `UIDensity`. Component exports follow their source migrations.
It does not copy the running fixtures into a second renderer.

## Source layout

`src/components` is the destination for styled form, overlay, and display controls.
`src/table` is the destination for Table presentation and column controls.
`src/virtual` is the destination for the Solid virtual binding and visible row presentation.
`src/virtual/vendor/virtual-core` contains the existing owned virtual engine after migration.
`src/styles` contains scoped styles, shared variables, and optional themes.

Applications explicitly import `@table/ui/styles.css`.
The planned Table and virtual exports remain `@table/ui/table` and `@table/ui/virtual`.
The source passes add these exports when their implementations exist.
Native engine imports remain `@tanstack/solid-table/native`.

## Current source owners

[Shared Table presentation](../solid-table/bench/table/README.md) remains the source until extraction.
`Table.tsx`, `ReadOnlyTable.tsx`, and `Table*.tsx` column controls move to `src/table`.
`createVirtualizer.ts`, `VirtualRows.tsx`, and `virtualWindow.ts` move to `src/virtual`.
The existing `bench/table/vendor/virtual-core` moves to `src/virtual/vendor/virtual-core` with its licenses and provenance.
Shared Table, editor, header, column, and popup styles now live in `src/styles/components.css`.
Fixtures retain page layout in their own CSS.
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

This command tests all package source.
The root `pnpm test:solid:qualification` command also tests isolated style scopes, density, focus, and themes.
Source passes add their own type and behavior tests.
The [boundary decision](../solid-table/bench/table/UI-BOUNDARIES.md) defines the public contract and component catalog.
