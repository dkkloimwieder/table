# Generic UI boundaries

This decision defines the generic UI library under Beads epic `table-qp8`.
The package paths and exports below are planned. They do not exist yet.
Follow-up issues implement them in focused changes.
WAMN is a prospective consumer. Its interface does not define the library API.

## Packages

`packages/solid-ui-core` will provide private package `@table/ui-core`.
It owns the selected Kobalte behavior and shared Kobalte utilities.
Component subpaths expose behavior without importing presentation CSS.
For example, `@table/ui-core/select` exposes the owned Select behavior.
Its vendor directory contains original licenses, provenance, and documented source repairs.

`packages/solid-ui` will provide private package `@table/ui`.
It owns styled controls and shared Table presentation.
The root exports styled controls. `@table/ui/table` exports Table and column controls.
`@table/ui/virtual` exports the existing virtual engine binding and row presentation.
`@table/ui/styles.css` provides shared component styles and theme variables.
Component subpaths allow consumers to import one control family.

The existing `@tanstack/solid-table/native` export keeps the native table engine.
The library does not move that engine to rename its package.
The classic adapter and other framework packages remain separate.
The new package names identify local workspace packages. They reserve no registry names.
Both new packages remain private during extraction.

## Import directions

Applications import `@table/ui`, the native engine, and external Solid Primitives as needed.
`@table/ui` imports `@table/ui-core` for control behavior.
Its Table subpath imports `@tanstack/solid-table/native`.
Its virtual subpath owns the existing vendored virtual engine and one Solid binding.
`@table/ui-core` imports external Solid, Solid Primitives, and Floating UI.
It does not import Table presentation.

Neither library package imports application models, demo transports, generated screens, or WAMN modules.
Examples import the library. The library never imports examples.
The current `nativeEvents` helper still lives in an example directory.
Extraction must remove that reverse dependency before exposing library components.

Solid and Solid Primitives remain external dependencies.
Floating UI also remains external in the initial scope.
Packages declare the runtime dependencies that they use directly.
Solid runtime dependencies use peer declarations and matching development pins to preserve one runtime instance.
The workspace lockfile keeps the currently qualified versions.
The direct primitive task qualifies required APIs before declaring support.
Required external dependency repairs use one shared patch mechanism.
Kobalte source repairs belong in the checked-in vendor source.

## Component contracts

Controlled components read current prop values and request changes through callbacks.
They do not treat a callback as proof that the application accepted a change.
Callbacks carry values or stable keys, rather than backend commands.
Components do not clone a canonical record store.
An uncontrolled mode requires an explicit `defaultValue` or `defaultOpen` contract.
A component must not switch ownership modes during its lifetime.

Text controls expose standard native attributes and forward refs to their actual input elements.
Choice controls use application-provided options and stable option keys.
The application owns option loading, search requests, paging, and missing-label resolution.
Combobox exposes search text separately from the selected key.
Footer content allows an application to provide paging controls.
The component supplies interaction behavior without embedding a paging service.

Labels, descriptions, errors, and disabled state remain generic props or composition slots.
Field components link accessible names and descriptions to controls.
The application decides validation rules and supplies error text.
The library does not execute business validation or submission requests.

Custom element rendering through `as` remains supported where Kobalte provides it.
Custom triggers and input wrappers must preserve refs, event handlers, and accessibility attributes.
Simple native controls use native attributes without introducing Kobalte behavior unnecessarily.

The following type example defines the proposed controlled choice boundary.
It describes a contract, not an implemented component.
The documentation command compiles this example on the current pinned runtime.

```ts
import type { JSX } from '@solidjs/web'

export type ChoiceProps<Option> = {
  options: ReadonlyArray<Option>
  value: string | null
  onValueChange: (key: string | null) => void
  optionKey: (option: Option) => string
  optionLabel: (option: Option) => string
  disabled?: boolean
  label: JSX.Element
  description?: JSX.Element
  error?: JSX.Element
}

export type SearchChoiceProps<Option> = ChoiceProps<Option> & {
  searchValue: string
  onSearchValueChange: (text: string) => void
  loading?: boolean
  footer?: JSX.Element
  inputRef?: (element: HTMLInputElement) => void
}

export function choiceConfiguration(
  options: ReadonlyArray<{ key: string; name: string }>,
  value: string | null,
  searchValue: string,
  onValueChange: (key: string | null) => void,
  onSearchValueChange: (text: string) => void,
): SearchChoiceProps<{ key: string; name: string }> {
  return {
    options,
    value,
    searchValue,
    onValueChange,
    onSearchValueChange,
    optionKey: (option) => option.key,
    optionLabel: (option) => option.name,
    label: 'Category',
  }
}
```

## Table contracts

Table receives an application-owned native table and renders its current state.
Sorting, filtering, grouping, summaries, column visibility, ordering, and resizing remain independent capabilities.
Read-only tables can expose all display features without constructing an editing model.
Editing uses shared cells and controls with application-provided composition.
The application owns drafts, validation, revisions, save rules, conflicts, permissions, and row actions.
The application also owns saved view persistence.

The existing renderer remains the extraction baseline.
This example uses current imports because the planned packages do not exist yet.
The extraction task will replace these imports with supported package exports.

```tsx
import type { NativeTable } from '@tanstack/solid-table/native'
import { ReadOnlyTable } from './ReadOnlyTable'

export function Results<Row, Metadata>(props: {
  table: NativeTable<Row, Metadata>
}) {
  return (
    <ReadOnlyTable
      table={props.table}
      title="Results"
      controls={{ sorting: true, filtering: true, grouping: true }}
    />
  )
}
```

Analytics receives query results, range callbacks, server sorting callbacks, and export callbacks from the application.
It does not apply local search or filtering to the query result.
The default preview remains 1,000 rows.
Full browsing requests pages through the application adapter.
The application owns transport, cancellation, page caching, and memory estimates.
Export passes query identity, sorting, and ordered column IDs with display labels.
The application exports the full query through its server.
The library does not generate CSV or infer backend permissions.

Virtualization remains optional.
Both fixed and measured rows use the existing vendored engine and one Solid binding.
The virtual binding computes visible ranges. It does not fetch records.
Fixed geometry remains bounded for large result counts.
Measured rows retain sizing and anchoring.

## Styles and rendering

Applications explicitly import `@table/ui/styles.css` once.
JavaScript entry points do not silently import global styles.
The CSS export counts as a side effect in package metadata.
Component selectors do not reset `body`, `main`, or unrelated native elements.
Shared variables define fonts, spacing, borders, colors, focus, and density.
Compact styling is the default. Optional themes override shared variables.
Portals inherit the configured theme through a supported container or explicit theme scope.
The same density configuration supplies fixed row geometry and CSS row height.
Analytics preserves its reserved viewport height during loading and result changes.

Library modules do not access browser globals during import or server rendering.
DOM listeners, observers, measurements, and portals start within a client lifecycle.
Disposal removes those resources.
Stable IDs preserve label links when hydration attaches to existing HTML.
Client hydration must retain server-rendered cells and support later interaction.
Package builds follow the existing Solid source, server, and distribution export conventions.
Consumer tests must cover each supported condition before the package claims support.

## Initial catalog

The initial form catalog contains Button, IconButton, Input, Textarea, Field, Label, HelpText, FieldError, FieldSet, and InputGroup.
Choice controls contain Select and Combobox.
Boolean and exclusive-choice controls contain Checkbox, Switch, and RadioGroup.
Overlays contain Dialog, AlertDialog, Popover, DropdownMenu, and Tooltip.
Sheet uses Dialog behavior with a different presentation.
Display components contain Badge, Card, Separator, InlineAlert, EmptyState, Spinner, Skeleton, Progress, and Toast.
Table contains shared headers, cells, column controls, groups, summaries, optional editors, and optional virtual rows.

Tabs, Collapsible, and Accordion remain later candidates.
Date, time, and file controls require concrete use cases before design.
WAMN wrappers, generated forms, navigation layouts, and production migration remain outside this milestone.

## Delivery order

The boundary task establishes this decision and compiles its examples.
The primitive and style tasks follow independently.
The vendor task checks in Select, Combobox, and their required shared modules.
Control families and Table extraction follow their stored Beads dependencies.
Each implementation task includes its own behavior and cleanup tests.
The isolated consumer fixture then proves composition through public imports.
Final tests cover source and distribution builds, types, lint, server rendering, hydration, interaction, and disposal.
Heavy tests run serially because host load varies.
Timing results remain advisory. Correctness and bounded resources remain required.

## Documentation examples

From the repository root, run:

```sh
pnpm --filter @tanstack/solid-table test:ui:contracts
```

This command compiles every TypeScript example in this decision.
It does not prove that planned packages or components already exist.
The follow-up consumer tests establish that behavior.
