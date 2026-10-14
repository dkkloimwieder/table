# Vendored virtual engine

This directory contains the runtime source of `@tanstack/virtual-core` version `3.17.11`.
The source and MIT license are checked into Git. Preparation does not download this engine.
`provenance.json` records the SHA-256 of each original source file and license from the installed npm package.
`localSha256` records the owned source and unchanged license after local repairs.
Run `pnpm --filter @table/ui test:virtual:vendor` from the repository root to test these hashes.
The upstream repository is [TanStack Virtual](https://github.com/TanStack/virtual).

Both table row modes use this `Virtualizer` class through `createTableVirtualizer`.
The Solid binding owns subscriptions and cleanup. Applications own records and page requests.
The shared `VirtualRows` component owns visible row iteration and layout.

## Local changes

The optional `fixedItemSize` supplies one positive row size and requires one lane.
A fixed measurement view calculates an item when the engine reads its index.
It retains no array, typed buffer, or key map proportional to the total row count.
The engine uses its existing range calculation, overscan, scrolling, and viewport observers for both modes.
Fixed rows ignore element size measurements and explicit resize requests.
Measured rows retain the upstream measurement caches and row observers.

Local declarations type the upstream environment expression for browser-only TypeScript projects.
Build tools still replace `process.env.NODE_ENV` in browser bundles.

The fixed-size option participates in measurement invalidation and rejects invalid sizes or multiple lanes.
The unit tests cover one million rows, bounded key reads, page metadata stability, measurements, and disposal.
Browser workloads cover paging, wrapped text, expansion, resizing, pinning, anchoring, and keyboard navigation.

The engine has no external runtime package dependencies.
Other repository examples can still use the installed TanStack Virtual package.

## Maintenance

The [shared vendor procedure](../../../../../solid-ui-core/src/vendor/kobalte/README.md#update-a-vendor-revision) covers source inventories, original comparison, patch replay, and build contributions.
From the repository root, run `pnpm audit:solid:vendor --bundles` to include both owned vendor subsets.
Supply `--virtual-upstream` with the exact pinned package directory to test original hashes and generate its local repair patch.
The replay test requires every resulting source and license hash to match the checked-in copy.
