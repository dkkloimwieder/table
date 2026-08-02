---
name: devtools
description: >
  Connect Solid Table v9 instances to Devtools with tableDevtoolsPlugin and useTanStackTableDevtools in the proper reactive owner. Load for missing targets, required options.key, enabled state, cleanup, or development versus explicit production exports.
metadata:
  type: framework
  library: '@tanstack/solid-table-devtools'
  framework: solid
  library_version: '9.0.0-beta.65'
requires:
  - '@tanstack/table-core#core'
  - '@tanstack/table-devtools#devtools'
sources:
  - 'TanStack/table:docs/devtools.md'
  - 'TanStack/table:packages/solid-table-devtools/src/index.ts'
  - 'TanStack/table:packages/solid-table-devtools/src/useTanStackTableDevtools.ts'
---

This skill builds on @tanstack/table-core#core and @tanstack/table-devtools#devtools.

The Solid devtools stack currently supports Solid 1 only (`@tanstack/solid-table-devtools` peers `solid-js <2.0.0`). In a Solid 2 app, keep the `key` table option but leave devtools unwired until the devtools packages ship Solid 2 support.

## Setup

```tsx
import { createTable, tableFeatures } from '@tanstack/solid-table'
import {
  tableDevtoolsPlugin,
  useTanStackTableDevtools,
} from '@tanstack/solid-table-devtools'

const features = tableFeatures({})
const plugin = tableDevtoolsPlugin()

export function App() {
  const table = createTable({
    key: 'users-table',
    features,
    columns: [],
    data: [],
  })
  useTanStackTableDevtools(table)
  return null
}
```

Mount `plugin` in your devtools shell's `plugins` array — for example the `TanStackDevtools` component from `@tanstack/solid-devtools` (Solid 1 only).

## Hooks and Components

Register inside the component's Solid owner. Pass `{ enabled }` to the hook for conditional registration.

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
