# Owned Kobalte subset

This directory contains 204 source modules for the owned controls and their shared Kobalte Core and Utils dependencies.
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

Dialog and AlertDialog now share the owned dismissable layer and external focus, interaction, and scroll primitives.
Dismissable layers forward native and custom `as` elements through the repaired Polymorphic component.
They register while enabled and release their layer and document locks while disabled.
Force-mounted closed dialogs keep their content without locking scrolling or receiving dismissal events.
Dialog trigger and close handlers respect prevented caller events.
Caller focus restoration takes precedence over the default trigger focus.
Dialogs without a connected trigger retain the focus primitive's previous focus target.
Modal content exposes `aria-modal`. AlertDialog prevents outside dismissal.
Background hiding waits until focus enters the mounted modal.
The shared Core helper follows the external focus trap or caller focus callback and releases its listener on closure.
This order prevents `aria-hidden` from hiding a focused opener before delayed initial focus runs.

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

## Contextual controls

Popover, DropdownMenu, and Tooltip share the existing Popper and dismissable layer.
Popover and menu scroll locks follow open state, including force-mounted content.
Closed content releases its dismissal layer.
Native Polymorphic elements use the full owned event registry, including pointer entry and exit.
Trigger and item handlers respect caller events that prevent the default action.
Focus callbacks use untracked reads and respect caller focus restoration.
Submenu refs retain direct callback arrays. Escape closes the current menu before its parent.
Menu item close timers and submenu grace timers cancel on disposal.
Tooltip uses a typed plain registry and cancels its owned delay timers on disposal.
Tooltip timer and document callbacks use untracked imperative reads.
These components contain no application commands or services.

Nonmodal Popover and menu focus restoration use the external focus restore primitive.
Popover initial focus and menu focus strategies wait for mounted content and cancel that work on closure.
Selectable collections also cancel their deferred initial focus on disposal.
Enabled dismissable layers expose the shared accessibility exemption for nested modal content.
Menu Escape handling runs before list navigation consumes the key.
