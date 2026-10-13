# Owned component behavior

`@table/ui-core` is a private workspace package for generic component behavior.
The workspace structure exists. Component source migration remains under Beads `table-qp8.1.1`.
The package exposes no component API yet.

## Source layout

`src/controls` contains public behavior entry points after migration.
`src/vendor/kobalte` contains the selected upstream Core and Utils source.
Vendor source keeps its licenses, original hashes, and local repair history.
Shared Kobalte modules have one owner and one copy.

The first source pass includes Select, Combobox, and their required shared modules.
Further control families expand that subset through their existing Beads issues.
Existing selection, focus, accessibility, and custom element behavior remain part of the source contract.
This pass does not redesign those behaviors.

## Existing inputs

The current Select fixture is in [the popup directory](../solid-table/bench/popup/README.md).
Its ignored `.input/kobalte/packages/core/src` and `utils/src` directories still supply runtime source.
The source task moves the required modules into this package.
It replaces [compiler-time repairs](../solid-table/bench/popup/port.ts) with reviewable source changes.
The event helper must stop importing an example before it becomes library code.
The external scroll repair remains separate from vendored Kobalte source.

## Dependencies

Solid, Solid Primitives, and Floating UI remain external.
Components import primitives when they need them.
Component tests cover those imports without a separate prerequisite task.
The source migration declares the required dependency versions from the current qualified inputs.
No dependency pins change during this structure pass.

This package contains no styles, Table renderer, records, transports, or application validation rules.
The presentation package imports this package. This package never imports presentation or application code.

## Development

From the repository root, run:

```sh
pnpm --filter @table/ui-core test:types
```

This command currently tests the package scaffold.
The source migration expands it to the actual owned modules.
