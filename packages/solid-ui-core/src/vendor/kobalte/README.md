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
The inventory and update procedure below complete Beads `table-qp8.1.3`.

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

## Inventory and ownership

The [audit command](../../../../../scripts/audit-solid-ui-vendor.mjs) inventories both generic UI packages.
Its report records every TypeScript and CSS source, original hash, local hash, and import edge.
An import edge connects a source file to its dependency.
The report distinguishes imports that supply runtime code from imports that supply only types.
It resolves workspace entry points and lists the external package declarations and their importing files.
The existing integrity commands require unchanged license bytes and declared external imports.

| Source                                      | Origin                           | License                   | Inventory                                                                                                   |
| ------------------------------------------- | -------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Kobalte Core and Utils                      | Revision recorded above          | Three unchanged MIT files | 204 source files in `provenance.json`                                                                       |
| Virtual engine                              | `@tanstack/virtual-core` 3.17.11 | Unchanged MIT file        | Three sources in [virtual provenance](../../../../solid-ui/src/virtual/vendor/virtual-core/provenance.json) |
| Generic Core helpers                        | Repository-owned source          | Repository MIT license    | `solid-ui-core/src`, outside the vendor directory                                                           |
| Styled controls, Table, and virtual binding | Repository-owned source          | Repository MIT license    | `solid-ui/src`, outside the virtual vendor directory                                                        |

The Table source came from this repository's shared presentation.
The generic wrappers and helpers are repository code, rather than copies of installed component packages.
Both table row modes share the single owned virtual engine.
The virtual engine imports no external runtime package.

Solid and `@solidjs/web` remain external peers.
External runtime imports also include Floating UI, internationalized number formatting, and the declared Solid Primitives packages.
Their exact declarations remain in [the Core manifest](../../../package.json) and [the UI manifest](../../../../solid-ui/package.json).
The UI package imports its owned Core package through workspace entry points.
The native Table peer supplies types to the UI source.
Applications create the native engine and pass it to Table presentation.

## Repair locations

The generated comparison patch records every local file difference, including formatting and import changes.
All 204 Kobalte sources differ from their originals, but that count does not represent 204 behavior repairs.
The source families below locate the behavior changes described earlier.

| Repair                                                                             | Source locations                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Owned events and custom `as` forwarding                                            | `core/src/polymorphic`, `core/src/dismissable-layer`, and `solid-ui-core/src/ownedEvents.ts`                                                 |
| Compiler ref handling and viewport-only scrolling                                  | `core/src/select`, `core/src/combobox`, `core/src/selection`, and `utils/src`                                                                |
| Controlled search, missing selected options, native form values, and announcements | `core/src/combobox`, `core/src/select`, and `core/src/listbox`                                                                               |
| Controlled boolean values, prevented events, form reset, and label refs            | `core/src/checkbox`, `core/src/switch`, `core/src/radio-group`, `core/src/form-control`, and `solid-ui-core/src/formReset.ts`                |
| Modal focus, background hiding, dismissal, and closed-content cleanup              | `core/src/dialog`, `core/src/popover`, `core/src/menu`, `core/src/dismissable-layer`, and `solid-ui-core/src/controls/modal-hide-outside.ts` |
| Nested menu navigation and timer cleanup                                           | `core/src/menu`, `core/src/selection`, and `core/src/tooltip`                                                                                |
| Fixed arithmetic measurements and shared virtual modes                             | [Virtual engine repair record](../../../../solid-ui/src/virtual/vendor/virtual-core/README.md#local-changes)                                 |

The [scroll patch](../../../../../patches/solid-primitives-scroll-3.0.0-next.4.patch) repairs an external primitive's owner registry.
It is not a vendored primitive implementation.
Keep its lockfile association until matched upstream evidence permits removal.
Beads `table-gd3.6.7.9`, `table-gd3.6.4`, and `table-gd3.6.5` track existing upstream repair retirement gates.
An upstream release number alone does not prove that a repair is obsolete.

## Produce the audit

From the repository root, run:

```sh
pnpm audit:solid:vendor --bundles
```

The report is `test-results/solid-ui-vendor-audit/audit.json`.
The command tests both vendor inventories before it generates the source graph.
It builds the read-only, editing, analytics, and popup fixtures serially without writing their build directories.
Clear `BENCH_DEVELOPMENT`, `BENCH_DISTRIBUTION`, and `BENCH_PROFILE` before this production audit.
Use `--output` to retain a separate report for a candidate update.

The report lists retained modules, their imports, and the bundler's rendered character count for each source group.
It also records final JavaScript and CSS bytes and gzip bytes for each asset.
Each build lists retained external packages with their installed versions, licenses, and package manifest paths.
Rendered character counts describe the bundler's contribution accounting.
They do not measure the download savings from deleting a component.
Shared helpers, compression, and chunk structure affect those savings.
Type-only imports and source barrels can remain in the source inventory without adding browser code.

Compare reports from the same fixtures, runtime, compiler, and build mode.
Use retained module changes and browser behavior to assess a proposed removal.
Keep keyboard, focus, accessibility, controlled values, custom `as`, and cleanup contracts intact.
Do not remove an optional part solely because its source contains many lines.

### Baseline measured on October 14, 2026

The audit inventories 260 TypeScript and CSS sources across both UI packages.
It finds 19 imported package names, including the owned Core workspace and the native Table type peer.
The remaining 17 names supply external runtime imports.
Each vendor comparison reproduces its checked-in sources and unchanged licenses exactly.

| Fixture   | JavaScript bytes | Gzip JavaScript bytes | Kobalte modules with code | Kobalte rendered characters | Virtual rendered characters |
| --------- | ---------------: | --------------------: | ------------------------: | --------------------------: | --------------------------: |
| Read-only |          133,518 |                44,158 |                        17 |                      13,682 |                           0 |
| Editing   |          210,863 |                67,103 |                         0 |                           0 |                           0 |
| Analytics |          149,199 |                49,208 |                         0 |                           0 |                      41,138 |
| Popup     |          424,079 |               122,920 |                       176 |                     247,164 |                           0 |

The popup fixture intentionally imports every implemented control family and its test application.
Its total is not the cost of one control or a minimum application bundle.
The read-only fixture retains checkbox behavior without choice or overlay behavior.
Analytics retains the single virtual engine without Kobalte behavior.
CSS assets range from 26,529 to 27,491 bytes because these fixtures import the shared stylesheet.
The report records each asset and its compressed size separately.
These measurements establish a baseline rather than a feature-removal decision.

## Reproduce local patches

Obtain the exact Kobalte revision from the recorded archive URL:

```sh
curl --fail --location --output /tmp/table-kobalte-pinned.tgz https://codeload.github.com/kobaltedev/kobalte/tar.gz/e9d426d438b7c9ea0cc81bd1133831a20cd5fcae
echo 'c07f47331a9aee20f69e2e55d81454f0b48976e2e6e98551da2b27a9169c6f70  /tmp/table-kobalte-pinned.tgz' | sha256sum --check
mkdir -p /tmp/table-kobalte-pinned
tar -xzf /tmp/table-kobalte-pinned.tgz --directory=/tmp/table-kobalte-pinned --strip-components=1
```

Use the pinned virtual package from the repository's installed dependency tree.
The following path applies to the current lockfile.

```sh
pnpm audit:solid:vendor --kobalte-upstream /tmp/table-kobalte-pinned --virtual-upstream node_modules/.pnpm/@tanstack+virtual-core@3.17.11/node_modules/@tanstack/virtual-core
```

The command first compares each supplied original with its recorded upstream hash.
It then writes `local.patch`, the original tree, and the local tree beneath a fresh comparison directory.
The report records that directory's patch path.
The command replays the patch into a separate copy and requires every resulting hash to match the checked-in source.
It never changes the supplied originals or repository source.
Keep repository-owned helpers and wrappers alongside the vendor source.
The vendor patch references those helpers but does not contain them.

## Update a vendor revision

1. Produce the current audit and verified local patches.
2. Obtain an immutable candidate revision or package archive.
3. Record its archive hash, licenses, and source hashes separately from the current provenance.
4. Compare the current originals with the candidate originals using `git diff --no-index`.
5. Copy the candidate subset into a separate directory.
6. Preserve the full relative import closure and public type exports.
7. Replay the current local patch against that copy with `git apply --check -p2 --directory=<candidate-subset>`.
8. Apply the patch after the check passes.
9. If the check fails, resolve each changed hunk against the upstream change and existing repair contract.
10. Review every repair location before replacing repository source.
11. Update upstream hashes only when the selected upstream origin changes.
12. Update local hashes after formatting and source review.
13. Retain license text and original third-party attribution.
14. Produce the candidate audit with a separate output directory.
15. Run the required tests before committing the update.

Run patch commands from a separate directory outside a Git checkout.
Use a relative candidate directory below the patch command's working directory.
Alternatively, set `GIT_CEILING_DIRECTORIES` to that directory's parent.
Git can silently skip relative patch paths when it discovers an enclosing checkout.
The audit prevents that discovery and requires exact replay hashes.

From the repository root, run the integrity and required Solid checks:

```sh
pnpm --filter @table/ui-core test:vendor
pnpm --filter @table/ui test:virtual:vendor
pnpm test:solid:qualification
pnpm test --projects=@tanstack/table-core,@tanstack/solid-table --parallel=1
pnpm test:e2e --projects=tanstack-solid-table-example-basic-use-table,tanstack-solid-table-example-filters --parallel=1 --no-retry
pnpm test:docs
```

Qualification includes strict types, lint, source and distribution interactions, server rendering, hydration, and live component reloads.
Run a development popup build and browser suite with the fixture's documented commands.
Keep first failures and candidate audit reports for review.
Scope primitive or Solid version changes separately when they require their own migration.
