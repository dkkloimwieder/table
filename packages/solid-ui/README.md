# Shared UI presentation

`@table/ui` is a private workspace package for generic styled controls and Table presentation.
Shared Table, virtual presentation, choice controls, column controls, scoped styles, and density values are implemented.
Remaining controls follow Beads `table-qp8`.
The root exports `Select`, `Combobox`, `uiScope`, `uiDensity`, `UI_DENSITIES`, and `UIDensity`.
The `select` and `combobox` subpaths also export their control types.
`@table/ui/table` exports Table presentation and column controls.
It does not copy the running fixtures into a second renderer.

## Source layout

`src/components` is the destination for styled form, overlay, and display controls.
`src/table` owns Table presentation and column controls.
`src/virtual` owns the Solid virtual binding and visible row presentation.
`src/virtual/vendor/virtual-core` owns the single virtual engine with its license and provenance.
`src/styles` contains scoped styles, shared variables, and optional themes.

Applications explicitly import `@table/ui/styles.css`.
Import optional virtual presentation from `@table/ui/virtual`.
Native engine imports remain `@tanstack/solid-table/native`.

## Current source owners

[Shared Table presentation](./src/table/README.md) now lives in `src/table`.
Editing, read-only, and analytics consume the same package exports.
[Virtual presentation](./src/virtual/README.md) owns fixed and measured modes through the same engine.
Its source, license, original hashes, and local hashes stay together in the UI package.
Shared Table, editor, header, column, and popup styles now live in `src/styles/components.css`.
Fixtures retain page layout in their own CSS.
`src/utils/nativeEvents.ts` owns the event helper. Library source never imports examples.
The root workspace owns the fixture dependency on `@table/ui` to avoid a UI and engine dependency cycle.
Solid stays external. The native engine peer is optional for consumers that only use other UI subpaths.

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

## Choice controls

Select and Combobox provide styled parts over the owned Core implementations.
Use `Select` or `Select.Root` with `Label`, `Trigger`, `Value`, `Portal`, `Content`, and `Listbox`.
Use `Combobox` or `Combobox.Root` with `Label`, `Control`, `Input`, `Trigger`, `Portal`, `Content`, and `Listbox`.
Both controls retain Core option keys, groups, disabled options, multiple selection, and custom element rendering through `as`.
Use `Description` and `ErrorMessage` to link help and errors to the control.
Add `HiddenSelect` when a native form must submit the selected key.

The application supplies `options`, `value`, and `onChange`.
Pass `null` to represent an empty controlled selection.
For Combobox, `inputValue` and `onInputChange` control search text independently of the selected value.
The application updates search text after selection when its interface requires that behavior.
When the application rejects a text change, the input retains the supplied text.

For server results, pass `defaultFilter={() => true}` to preserve the supplied option list.
The application owns requests, cancellation, pages, loading state, and the label of an off-page selection.
An option page update preserves the controlled value and does not emit a selection change.
Supply the selected option object with its label when the current page does not contain it.

`Content` accepts `status` and `footer` content.
Combobox permits an empty list by default so that loading and empty messages remain visible.
The application can set `allowsEmptyCollection={false}` to close an empty list.
Footer buttons receive Tab focus, and Tab leaves the popup in normal control order.
Selection and Escape restore focus when the popup owns focus.
Outside interactions preserve the new focus target.

The default portal mount uses the nearest `data-ui-portal-root`, then the enclosing style scope.
Pass `mount` to choose another host.
Both controls use the shared compact styles, density variables, and live scope theme.
The popup fixture uses Select as a Table editor and tests both controls as standalone form fields.
