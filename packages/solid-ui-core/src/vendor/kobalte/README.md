# Owned Kobalte subset

This directory contains 139 source modules for Select, Combobox, Checkbox, Switch, RadioGroup, and their shared Kobalte Core and Utils dependencies.
The origin is revision `e9d426d438b7c9ea0cc81bd1133831a20cd5fcae` from the Kobalte `solid2` branch.
`provenance.json` records the original and local SHA-256 for each source and license.
The copied originals match archive SHA-256 `c07f47331a9aee20f69e2e55d81454f0b48976e2e6e98551da2b27a9169c6f70`.
The root, Core, and Utils licenses remain unchanged.
Original third-party attribution comments remain in their source files.
This subset retains module barrels and their type dependencies. It does not claim a minimal browser bundle.

## Local changes

Core imports the single checked-in Utils subset through relative paths.
Repository formatting replaces upstream formatting.
Focus handlers use `untrack` when synchronous DOM events read current state.
Combobox initial snapshots and imperative effect callbacks also use explicit untracked reads.
Effect computation functions retain their tracked dependencies.
Selectable collections scroll their own viewport instead of the document.
Native polymorphic elements and dismissable layers use owned DOM listeners from `src/ownedEvents.ts`.
Custom component rendering through `as` retains the upstream forwarding branch.
Select and Combobox reference arrays avoid outer TypeScript assertions that the current compiler drops.
Reference casts remain inside those arrays where generic element types require them.

The strict type pass makes implicit undefined returns explicit in the keyboard delegate.
It preserves known nonempty array accesses and guards missing collection keys and touch entries.
Dependency iteration avoids unchecked array access.
Combobox now returns its plural option-count announcement instead of discarding that string.
A focused source test covers zero, one, and multiple results.

Combobox accepts `inputValue` for application-controlled search text.
It keeps that text separate from selection, blur, and Escape.
The input restores the accepted text when the application rejects an input change.
Its keyboard handler respects a caller that prevents the default action.
Styled controls use this behavior to give footer buttons keyboard access.
Select does not prune application-controlled values when the current option page changes.
Both controls resolve missing selected options from the supplied controlled value.
The hidden select retains missing selected keys for native form submission.
It reapplies native selection after the browser processes replacement option nodes.
Select exposes `aria-invalid` on its trigger when its validation state is invalid.
These repairs do not fetch options or store a separate record cache.
The event dispatch helper now lives in generic Core source outside this subset.
Utils re-exports that helper, so native controls reuse it without importing Kobalte modules.

Boolean controls keep native checkbox and radio inputs for keyboard behavior and form values.
Their visual controls respect caller events that prevent the default action.
Disabled radio items reject pointer selection. Read-only radio groups restore every native checked state after a rejected change.
Reset callbacks run after the native reset action and restore accepted controlled values or uncontrolled defaults.
A shared Core helper cancels pending reset work on disposal and respects prevented reset events.
The shared form label reads its one-time forwarded ref through `untrack`.

The external scroll registry uses the existing owner repair through a pnpm patch.
Solid, Solid Primitives, Floating UI, and internationalized number formatting remain external.
No installed Kobalte module supplies the library implementation.
Beads `table-gd3.6.7.9` retains the earlier repair evidence and upstream retirement scope.

## Integrity

From the repository root, run:

```sh
pnpm --filter @table/ui-core test:vendor
```

The command tests file hashes, licenses, relative imports, and declared external dependencies.
When source changes, update its local hash after review.
Keep original hashes unchanged unless the upstream revision changes.
Runtime preparation never downloads source.
The fuller update procedure and subset cost audit remain under Beads `table-qp8.1.3`.
