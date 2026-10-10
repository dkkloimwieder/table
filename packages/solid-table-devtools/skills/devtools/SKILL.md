---
name: devtools
description: >
  Inspect table instances from a Solid 1 owner with TableDevtoolsPanel and useTanStackTableDevtools. Load for missing targets, required options.key, enabled state, cleanup, production exports, or the deferred Solid 2 integration.
metadata:
  type: framework
  library: '@tanstack/solid-table-devtools'
  framework: solid
  library_version: '9.2.0'
requires:
  - '@tanstack/table-core#core'
  - '@tanstack/table-devtools#devtools'
sources:
  - 'TanStack/table:docs/devtools.md'
  - 'TanStack/table:packages/solid-table-devtools/src/index.ts'
  - 'TanStack/table:packages/solid-table-devtools/src/TableDevtools.tsx'
  - 'TanStack/table:packages/solid-table-devtools/src/useTanStackTableDevtools.ts'
---

This skill builds on @tanstack/table-core#core and @tanstack/table-devtools#devtools.

## Setup

The devtools adapter currently uses Solid 1. The Table adapter and migrated examples use Solid 2.
Do not call the devtools hook or render its components inside a Solid 2 owner.
An owner is the Solid scope that manages reactive cleanup.
Solid 2 devtools integration remains deferred until the companion packages support it.

For an existing Solid 1 integration, pass a stable table instance to this panel component.
Set a unique `options.key` on that table before registration.

<!-- skill-snippet:check -->

```tsx
import {
  TableDevtoolsPanel,
  useTanStackTableDevtools,
} from '@tanstack/solid-table-devtools'
import type { RowData, Table, TableFeatures } from '@tanstack/table-core'

export function TableInspector<
  TFeatures extends TableFeatures,
  TData extends RowData,
>(props: { table: Table<TFeatures, TData> }) {
  useTanStackTableDevtools(props.table)
  return <TableDevtoolsPanel />
}
```

## Hooks and Components

Register inside the component's Solid 1 owner. Pass `{ enabled }` to the hook for conditional registration.
Use `tableDevtoolsPlugin()` only with a compatible Solid 1 devtools host.
The standalone panel above does not require a host package.

## Common Mistakes

### HIGH Registration created outside an owner

Wrong: call the Solid registration hook at module scope.

Correct: call it in the component that owns the table.

The hook uses Solid reactive cleanup to unregister the target.

Source: TanStack/table:packages/solid-table-devtools/src/useTanStackTableDevtools.ts

### HIGH Missing or reused table key

Wrong: omit `options.key` or share one key between mounted tables.

Correct: assign a stable unique key per live table.

The target registry skips missing keys and replaces duplicate identities.

Source: TanStack/table:packages/table-devtools/src/tableTarget.ts

### MEDIUM Production entrypoint assumed active

Wrong: expect normal Devtools exports to inspect a production table.

Correct: keep default guidance development-only; use `/production` only on explicit request.

The package index selects no-op implementations outside development.

Source: TanStack/table:packages/solid-table-devtools/src/index.ts

## API Discovery

Inspect `node_modules/@tanstack/solid-table-devtools/dist/index.d.ts`, `useTanStackTableDevtools.d.ts`, and `production.d.ts`.
