# Kobalte popup editing

This fixture uses the real Kobalte Select with Table and Solid 2 rc.14.
It replaces the Priority editor through a component supplied by the parent.
The regular editing fixture continues to use an HTML select.
The published Table package gains no Kobalte dependency.

The wrapper maps a scalar draft to a stable choice object.
Labels remain separate from saved values.
The existing controller owns drafts, Zod Mini rules, revision conflicts, and save requests.
The popup owns its open state and highlighted choice.
This interface adds no record store or copy of the collection.

## Source and local repairs

`prepare.mjs` downloads Kobalte revision `e9d426d438b7c9ea0cc81bd1133831a20cd5fcae` from the upstream `solid2` branch.
The [immutable source](https://github.com/kobaltedev/kobalte/tree/e9d426d438b7c9ea0cc81bd1133831a20cd5fcae) pins Solid rc.3.
The archive SHA-256 is `c07f47331a9aee20f69e2e55d81454f0b48976e2e6e98551da2b27a9169c6f70`.
Preparation extracts runtime sources and licenses into the ignored `.input` directory.
It excludes upstream tests, applications, and documentation.

`dependencies-lock.json` fixes the complete npm dependency graph in a separate scratch directory.
It includes Kobalte core `2.0.0-alpha.2`, utils `2.0.0-alpha.0`, and scroll primitives `3.0.0-next.4`.
Overrides pin Solid, web, and signals to rc.14.
The fixture uses the workspace compiler and TypeScript 6.0.3.
Preparation records source and dependency hashes in `.input/provenance.json`.

`port.ts` applies focused source repairs during compilation.
It does not modify the downloaded source or installed packages.
The repairs address observed failures:

1. Focus handlers read current values once through `untrack`, even when an effect synchronously dispatches focus.
2. A plain positioner reference array survives compilation. The compiler drops the upstream form with an outer TypeScript assertion.
3. Keyboard navigation scrolls the list viewport. The upstream document scroll can move a pointer target before release.
4. Owned DOM listeners release callbacks when the popup closes. Earlier snapshots retain records through detached nodes and browser event caches.
5. The global scroll signal uses `runWithOwner(null, ...)`. Its lifetime must not retain the first popup owner.

The event helper covers the DOM events used by this fixed-choice fixture.
Custom component properties pass through unchanged.
This experiment does not qualify every Kobalte component or polymorphic rendering combination.
The reference callback binds once when its element mounts.
The scroll repair also runs during development because that dependency bypasses Vite prebundling.
Bead `table-gd3.6.7.9` tracks retirement of these repairs after matched upstream fixes.

Set `BENCH_KOBALTE_UNPATCHED=1` when building or serving to reproduce the upstream behavior without these repairs.
The initial standalone probe produced `STRICT_READ_UNTRACKED` diagnostics during focus.
Table integration also exposed positioning, scrolling, Tab order, and disposal defects.
The [heap findings](../heap-findings.md#kobalte-popup-editing) describe the retaining paths and measured results.

## Table behavior

A portal places the popup outside the row in the document.
The popup carries a Table-specific owner ID so focus inside it preserves the row editor.
Tab closes the popup and continues from the trigger position in the table.
Escape closes only the popup. Selecting a choice changes only the draft.
Explicit Save or Save all commits changes.

Pending saves disable the trigger and close its popup.
An outside interaction prevents delayed focus restoration.
Child tables use the same editor and save independently.
Grouped rows construct no editors.
Existing editing locks keep filters, sorting, grouping, and layout fixed during an edit.

The demonstration includes an empty choice and a disabled choice.
Its application schema rejects an empty priority and allows recovery in place.
Nullable application schemas can accept the same empty value.
Searchable record references, paging, multiple selection, touch gestures, and other browsers require separate work.
WAMN Form/UI and Zaidan wrappers remain outside this fixture.

## Run the fixture

Run these commands from the repository root after the workspace dependencies are installed:

```sh
node packages/solid-table/bench/popup/prepare.mjs
pnpm --filter @tanstack/solid-table exec vite --config bench/popup/vite.config.ts --host 127.0.0.1 --port 7782 --strictPort
```

Open `http://127.0.0.1:7782/?size=25&save=all` for Table editing.
Open `http://127.0.0.1:7782/?standalone=1` for the independent popup.
Preparation uses `/tmp/table-kobalte-popup-deps` by default on Linux.
Set `KOBALTE_DEPS` before preparation to choose another dependency directory.

Build the source fixture and run its Chromium scenarios:

```sh
pnpm --filter @tanstack/solid-table exec vite build --config bench/popup/vite.config.ts
node packages/solid-table/bench/popup/run.mjs
```

The distribution fixture requires an existing Solid Table package build.
Use the unminified profile build for heap classification:

```sh
BENCH_DISTRIBUTION=1 BENCH_PROFILE=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/popup/vite.config.ts
BENCH_DISTRIBUTION=1 BENCH_WORKLOAD=1 BENCH_HEAPS=/tmp/table-popup-heaps node packages/solid-table/bench/popup/run.mjs
```

`BENCH_SCENARIOS=0` selects only the repeated workload.
Heap snapshots use gzip compression and retain their parsed summaries beside them.
The inspector also accepts uncompressed Chrome snapshots.
Resource counts are strict assertions. Timings remain advisory on a shared host.

Build and exercise Solid development diagnostics:

```sh
NODE_ENV=development BENCH_DEVELOPMENT=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/popup/vite.config.ts
BENCH_DEVELOPMENT=1 node packages/solid-table/bench/popup/run.mjs
```

The qualification host uses `PLAYWRIGHT_BROWSERS_PATH=/tmp/table-solid2-browsers` for its existing Chromium installation.
It also uses `TMPDIR=/dev/shm` for browser scratch files because the temporary filesystem has a quota.
Set these variables only for browser commands on that host.
`BENCH_URL=http://127.0.0.1:7782/` tests the running development preview.
`BENCH_OUTPUT` selects the JSON report path.

The module audit requires one Solid runtime and rejects table-core, TanStack Store, virtual-core, and Form.
TypeScript tests the wrapper against the published Select declarations.
The compiler builds the patched source. This fixture does not run the upstream Kobalte test suite.
