# Owned component behavior

`@table/ui-core` is a private workspace package for generic component behavior.
The source contains Select, Combobox, Checkbox, Switch, RadioGroup, Dialog, AlertDialog, Popover, DropdownMenu, and Tooltip.
It also contains their required Kobalte Core and Utils modules.
The component subpaths export the owned Kobalte behavior API.
Styled generic controls follow in the presentation package.

## Source layout

`src/controls` contains the choice, boolean, radio, dialog, and popup behavior entry points.
`src/vendor/kobalte` contains the selected upstream Core and Utils source.
Vendor source keeps its licenses, original hashes, and local repair history.
Shared Kobalte modules have one owner and one copy.

The first source pass includes Select, Combobox, Checkbox, Switch, RadioGroup, Dialog, AlertDialog, Popover, DropdownMenu, Tooltip, and their required shared modules.
Further control families expand that subset through their existing Beads issues.
Existing selection, focus, accessibility, and custom element behavior remain part of the source contract.
This pass does not redesign those behaviors.

## Existing inputs

The Select fixture is in [the popup directory](../solid-table/bench/popup/README.md).
It imports `@table/ui-core/select` through the workspace dependency.
A basic Combobox fixture imports `@table/ui-core/combobox`.
Ignored downloaded source and compiler-time source rewrites no longer supply either implementation.
The event helper lives in this package and imports no examples.
The external scroll repair uses a shared pnpm patch.

## Dependencies

Solid, Solid Primitives, and Floating UI remain external.
Components import primitives when they need them.
Component tests cover those imports without a separate prerequisite task.
The package declares the required external dependency versions from the previous popup inputs.
Existing workspace versions and unrelated peer assignments remain unchanged.

This package contains no styles, Table renderer, records, transports, or application validation rules.
The presentation package imports this package. This package never imports presentation or application code.

## Development

From the repository root, run:

```sh
pnpm --filter @table/ui-core test:types
```

This command tests all owned source, including every behavior entry point.
Strict types, unused declarations, return paths, and indexed accesses remain checked.
The fixture lint command still checks its application code for unused declarations.

Run the source inventory and focused source tests:

```sh
pnpm --filter @table/ui-core test:vendor
pnpm --filter @table/ui-core test:lib
```

The [vendor record](./src/vendor/kobalte/README.md) describes origins and local changes.
Its [maintenance procedure](./src/vendor/kobalte/README.md#update-a-vendor-revision) covers the inventory, build contributions, original comparison, and exact patch replay.

## Toast state

`@table/ui-core/toast` exports `createToastState`, `ToastOptions`, and `ToastDismissReason`.
This small owned helper uses the existing external controlled signal primitive.
Each instance owns its visibility proposals, pause reasons, timer, and document listeners.
It provides no global queue or application operation.
Display markup and announcement roles live in the UI package.
The Kobalte source subset remains unchanged for this component family.
