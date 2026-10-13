# Virtual presentation

Import `createTableVirtualizer` and `VirtualRows` from `@table/ui/virtual`.
The export also contains the `TableVirtualizerOptions` and `VirtualWindow` types.
Virtual presentation remains optional. Normal tables can render their full record list.

Both fixed and measured modes use one Solid binding and one owned `Virtualizer` class.
The engine source, MIT license, and provenance live in `vendor/virtual-core`.
The migration preserves the existing runtime source.

## Modes

Fixed mode receives a total count, row height, and key readers.
It calculates visible geometry without measurements or storage proportional to the total count.
Supply the same density to `uiScope()` and fixed row height through `uiDensity()`.

Measured mode receives caller-owned keys and a size estimate.
`observeRow` measures visible elements and releases detached elements.
`measurementVersion` invalidates old heights after layout changes.
The binding preserves the existing key and scroll anchor behavior.

Create the binding within a Solid owner.
Supply its scroll element through `getScrollElement`.
The owner starts observers during the client lifecycle and removes them on disposal.
`scrollToIndex` and `scrollToKey` move the viewport through the same engine.

## Row layout

`VirtualRows` accepts one virtual window and a `renderRow` callback.
Table layout renders spacer rows around visible records.
Block layout renders visible records within a positioned window.
Choose the layout when the component mounts.

Applications own records, page requests, loading states, caching, memory estimates, and export.
The binding computes visible ranges and never requests records.
Analytics and measured native rows use the same package exports.

## Tests

Existing native virtualizer tests consume the UI factory export.
They test shared engine identity, one million fixed rows, bounded key reads, measurements, and disposal.
Browser cases test paging, density, wrapping, row expansion, pinning, resizing, anchors, and keyboard navigation.
The WAMN fixture also consumes the same binding.
Use `pnpm --filter @table/ui test:virtual:vendor` to test source and license hashes.
