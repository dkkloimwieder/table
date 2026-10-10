# Matched editing overhead

This benchmark measures the existing editing fixture with identical records, columns, formatting, and native Table implementation.
A draft is a separate copy of editable values.
The editing controller owns drafts and save operations.
The caller owns one record store, and each draft belongs to one record ID.

## Measurement boundaries

The benchmark uses five modes:

| Mode         | Mounted resources                                                                           |
| ------------ | ------------------------------------------------------------------------------------------- |
| `store`      | One Solid record store                                                                      |
| `controller` | The same store plus the actual `createEditing` controller                                   |
| `model`      | The actual `createModel`, with its native engine, editing controller, and shared demo state |
| `read-only`  | The same model and Table shell, with the existing `ReadOnlyRow` renderer                    |
| `editable`   | The same model and Table shell, with the existing editable `Row` renderer                   |

Both rendered modes consume the same six columns and use the same formatting.
Both retain the same Table shell and editing controller.
The `Table.readOnly` prop selects the renderer for this comparison.
Its default preserves the existing editing demo.

The controller contrast isolates its idle ownership cost from record storage.
The model contrast includes demo state and controller ownership, so it does not isolate engine memory alone.
The presentation contrast isolates the actual additional row bindings, controls, listeners, and messages.
Do not add these contrasts as separate parts of one total.

Sizes 25, 250, and 999 exercise both presentations without virtualization.
Virtualization renders only a visible subset of rows.
Sizes 10,000 and 50,000 exercise store, controller, and model ownership without rendered rows.
These large cases measure whether idle editing ownership grows with loaded records.
They do not measure a virtualized analytics presentation.

## Work and evidence

Every mode receives twelve committed name updates on one stable record.
The controller, model, and editable modes also create one draft and then ten drafts.
They cancel those drafts, repeat twenty edit/cancel cycles, and save one record.
Draft phases call the controller directly and keep up to ten rows expanded.
Ordinary pointer entry collapses the prior editor, so this phase does not represent the usual focus sequence.
The runner asserts stable record identity, exact revisions, draft isolation, rendered values, and row and cell counts.
Every repetition must produce identical work counts.

The runner opens a fresh browser page for each sample and rotates mode order across repetitions.
Warmup repetitions warm the browser process, but each fresh page starts a new JavaScript context.
It measures retained JavaScript memory after garbage collection, which releases unreachable objects.
Each memory value subtracts that page's baseline before model creation.
This measures retained memory rather than peak temporary allocation or process memory.
A heap snapshot describes the live objects in memory.
Actual snapshots cover sizes 999 and 50,000 in the first measured repetition.
The inspector asserts one record object per input record before updates.
After updates, rendered modes retain one prior backing for the one changed record.
A backing is the raw object behind a store proxy.
Exact counts after repeated updates and edit/cancel cycles bound that extra version.
Disposal must release every classified application resource.
Both presentations use the existing qualified Solid rc.13 disposal workaround.

The report records CPU counters, load averages, available memory, browser version, and compiled asset hashes.
Use memory scaling and exact work counts as evidence.
Treat all timings as advisory on a shared machine.
Garbage collection and snapshot capture also add work to the host.
Do not reject slower samples or infer a latency limit from these measurements.

## Run

Run these commands from the repository root with installed workspace dependencies.
Build the packages sequentially, because each package build replaces its distribution directory.
Install the browser version that matches the installed Playwright package.

```sh
pnpm --filter @tanstack/table-core run build
pnpm --filter @tanstack/solid-table run build
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-solid-export-browsers pnpm exec playwright install chromium
pnpm --filter @tanstack/solid-table exec vite build --config bench/editing-overhead/vite.config.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-solid-export-browsers TMPDIR=/dev/shm BENCH_REPEATS=5 BENCH_HEAPS=/tmp/table-editing-overhead-source-heaps BENCH_OUTPUT=/tmp/table-editing-overhead-source.json node packages/solid-table/bench/editing-overhead/run.mjs
BENCH_DISTRIBUTION=1 pnpm --filter @tanstack/solid-table exec vite build --config bench/editing-overhead/vite.config.ts
PLAYWRIGHT_BROWSERS_PATH=/tmp/table-solid-export-browsers TMPDIR=/dev/shm BENCH_DISTRIBUTION=1 BENCH_REPEATS=5 BENCH_HEAPS=/tmp/table-editing-overhead-distribution-heaps BENCH_OUTPUT=/tmp/table-editing-overhead-distribution.json node packages/solid-table/bench/editing-overhead/run.mjs
node packages/solid-table/bench/editing-overhead/summarize.mjs /tmp/table-editing-overhead-source.json /tmp/table-editing-overhead-distribution.json
```

Local servers and browser launches can require sandbox permission.
The runner uses a temporary server port and preserves existing review servers.
Run the two measurement campaigns sequentially without other repository tests.

The default runner uses one warmup and three measured repetitions.
Set `BENCH_REPEATS=5` to rotate each rendered mode through every position.
Set `BENCH_SIZES=25` and `BENCH_WARMUPS=0` for a smoke test.
Omit `BENCH_HEAPS` to skip snapshots.
The summary compares exact contracts across source and distribution builds and reports minimum, median, and maximum paired differences.

The fixture participates in `test:fixtures:types` and `test:fixtures:eslint`.
The measurement campaign remains separate from routine qualification because host load affects timings.
See the [heap findings](../heap-findings.md) for recorded results and the architecture recommendation.
