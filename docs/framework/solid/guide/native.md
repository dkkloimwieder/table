---
title: Native Solid table
---

The `@tanstack/solid-table/native` entry reads a caller-owned Solid collection directly.
It imports only Solid at runtime.
The application owns its records and all writes to them.
Table derives ordered IDs and owns only internal view state, such as selection and column visibility.

This entry provides the foundation for the focused WAMN table.
It supports filters, global search, facets, sorting, nested groups, aggregates, controlled state, and visible cells.
The existing root entry continues to provide the table-core adapter during migration.
The native entry does not yet provide header groups, pagination, or a virtualizer.
Record expansion commands manage state for the renderer. Group expansion determines the grouped display sequence.
The native virtualized example renders record details and measures their height.

Virtualization is optional for each table.
Non-virtualized tables are a supported use case, including editable subsets that typically contain fewer than 1,000 records.
That record count describes the intended editing workload, not a limit or an automatic virtualization threshold.
Editing qualification does not require virtualized rendering.

The [inline editing fixture](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/editing/README.md) demonstrates non-virtualized row drafts with plain text controls.
It tests save and cancel behavior, keyboard focus, revision conflicts, text edits, and native dropdown edits.
Its application lock holds row structure and configuration while edits remain active.
Its editing controller remains application example code and does not require Form or a UI component library.
The separate [popup fixture](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/popup/README.md) tests a focused Kobalte Select port with fixed choices.
Neither fixture publishes its editing controller, popup components, child-table controls, or named-view storage as a native Table API.

## Choose the entry

Both entries export a function named `createTable`, but their contracts differ.
The root entry accepts the table-core API and its feature configuration.
The native entry accepts `source`, explicit column functions, and the state fields described below.
It exports `createNativeTable` as another name for the same native function.
Import native types from `@tanstack/solid-table/native`.

Native Table does not build table-core rows, value caches, or feature factories.
It does not implement the complete root API or accept its row-model factories.
Native row and group handles read current records through logical IDs.
The renderer owns headers, content templates, record details, paging controls, and optional virtualization.
Column `header`, `cell`, and `meta` values remain available to that renderer.
Table does not render them itself.

## Supply the collection

Create the table inside a component or `createRoot`.
Supply unique, nonempty string IDs through `source.ids()`.
Supply the current record through `source.get(id)`.
Keep membership and record writes in the same Solid batch.

```tsx
import { For, createMemo, createSignal, createStore } from 'solid-js'
import { createTable } from '@tanstack/solid-table/native'

function ScoreTable() {
  const [records, setRecords] = createStore<Record<string, { score: number }>>({
    a: { score: 20 },
    b: { score: 10 },
  })
  const [ids, setIds] = createSignal(['a', 'b'])
  const [start, setStart] = createSignal(0)
  const table = createTable({
    source: { ids, get: (id) => records[id] },
    columns: [
      {
        id: 'score',
        accessorKey: 'score',
        filterFn: (value, minimum) => Number(value) >= Number(minimum),
        sortFn: (a, b) => Number(a) - Number(b),
      },
    ],
  })
  const visible = createMemo(() =>
    table.getRowIds().slice(start(), start() + 40),
  )
  const edit = () =>
    setRecords((draft) => {
      draft.a!.score += 1
    })
  const append = () => {
    setRecords((draft) => {
      draft.c = { score: 30 }
    })
    setIds((previous) =>
      previous.includes('c') ? previous : [...previous, 'c'],
    )
  }

  return (
    <>
      <button onClick={edit}>Edit score</button>
      <button onClick={append}>Append row</button>
      <button onClick={() => setStart(0)}>First window</button>
      <table>
        <tbody>
          <For each={visible()}>
            {(id) => {
              const row = table.createRowView(id)
              return (
                <tr>
                  <For each={row.getVisibleCells()}>
                    {(cell) => <td>{String(cell.getValue())}</td>}
                  </For>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </>
  )
}
```

The signal stores ordered IDs, which are references to logical records.
The Solid store contains the records themselves.
Table copies the ID sequence when membership changes. It does not copy each record or create another writable dataset.
An ID array inside a Solid store also works, but tracking individual positions adds memory in the measured workload.

Field edits use native Solid tracking.
Same-ID replacement changes the current record while preserving surviving visible row and cell objects.
Refreshes can use Solid `reconcile` at the source boundary.
The native table requires no `deep()` bridge, snapshot, or dirty-row command.

## Own the visible resources

A Solid scope owns computations and disposes them together.
Create each row view inside the keyed `For` callback that renders that row.
Apply the visible range before creating row views.
The example uses a fixed window to show this boundary. A virtualizer can supply that range later.

`createRowView(id)` creates cells for visible columns in that row scope.
Cell objects and their contexts remain stable while both row and column stay visible.
Hiding a column or scrolling a row out of view disposes its display resources.
Selection, canonical records, and application edit drafts must live outside those display scopes.

`getRow(id)` creates a lightweight handle without cells or a registered owner.
The caller controls that handle's object identity.
Table keeps no permanent registry of row objects or cached cell values.
`row.original`, `row.getValue()`, and `cell.getValue()` read the current source and column definition.
Nested fields track through Solid when a consumer reads them in JSX or a computation.

After record removal, an escaped handle returns `undefined` for its record and values.
A listed ID with no record is an error.
After column removal, an escaped cell returns `undefined` for its value and column definition.
Remove IDs and records before the same Solid flush to keep membership consistent.

## Control view state

Each state field has one authority.
If `state` supplies a field, Table reads that field and sends commands to its corresponding callback.
If the field is absent, Table updates its internal Solid store.
`initialState` supplies initial values only.
Reactive getters preserve external updates to `state`, `source`, `columns`, and manual feature flags.

```ts
const [sorting, setSorting] = createSignal<
  Array<{ id: string; desc: boolean }>
>([])
const table = createTable({
  source,
  columns,
  get state() {
    return { sorting: sorting() }
  },
  onSortingChange: setSorting,
})

table.getColumn('score')!.toggleSorting()
table.getColumn('score')!.setFilterValue(15)
table.getRow('a').toggleSelected(true)
table.getColumn('score')!.toggleVisibility(false)
```

Each command calls its callback once with a value or updater function.
Consecutive updater functions compose within a Solid batch.
Controlled callbacks must apply the update to their external state.
Table does not mirror controlled values into its internal state.
Normal event handlers and Solid effect apply callbacks can issue commands without an `ownedWrite` opt-in.

The supported state fields are:

- `columnFilters`, `globalFilter`, and `sorting` select local derivations.
- `rowSelection` and `expanded` retain flags by logical ID.
- `grouping` defines ordered columns. `groupSorting` and `groupExpanded` control the group display.
- `columnVisibility`, `columnOrder`, and `columnPinning` determine visible column order.
- `columnSizing` determines clamped column widths.
- `rowPinning` retains ordered top and bottom IDs.

State commands do not mutate canonical records or rebuild the source collection.
Selection and expansion survive scrolling and record removal until the caller changes them.
`manualFiltering` and `manualSorting` keep their state but bypass local derivation.
These flags let the server own filtering and sorting.
Removing a column suspends its saved filter and sort until that column returns.
An existing column with an active local filter or sort must provide the corresponding function.

## Column widths

Column definitions accept `size`, `minSize`, `maxSize`, and `enableResizing`.
`column.getSize()` returns the current width within its bounds. `column.setSize(width)` updates the existing `columnSizing` state.
This state holds current widths in memory. Table does not persist them.
Controlled state requires the caller to apply `onColumnSizingChange` updates.

The internal sizing store preserves its container and updates individual properties.
A change to one width leaves unrelated width subscribers unchanged.
Width changes do not read records or invalidate filtering, grouping, or summaries.
Browser layout still responds to new widths and can change wrapping or row heights.

The [editing fixture](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/editing/README.md#column-resizing) demonstrates optional pointer and keyboard resize controls.
It resizes headers and body cells together during pointer movement.
Its Grow table mode shifts following columns. Keep table width mode transfers space to or from the adjacent visible column.
Both modes respect column bounds. The fixture offers no width persistence or reset controls.
Its shared `colgroup` keeps headers, cells, and group spans aligned.
The component cancels stale gestures and releases listeners when a header disappears.
Column resizing remains independent of record processing and does not require horizontal virtualization.

## Gate local processing

`manualProcessing: true` bypasses local search, filters, facets, sorting, grouping, aggregates, and totals together.
Record rendering and column arrangement remain available.
Saved feature state remains intact for a later switch to local processing.
The individual manual flags remain available when the server owns only selected operations.

```ts
const table = createTable({
  source,
  columns,
  get manualProcessing() {
    return !load.fullyRead || load.busy
  },
})
```

The application owns `fullyRead`, `busy`, `cap`, and `generation`.
It accepts or rejects load results before writing records to the source.
Table does not fetch, infer completeness, or accept results from a load generation itself.
Keep source membership, record changes, and completion flags in the same Solid batch.
In WAMN, client export and refinement controls must also use the application's completeness condition.

Partial results can still contain authoritative server totals and facets.
Provide those explicitly through `options.getTotalValue(columnId, scope)` and `options.getFacetedUniqueValues(columnId)`.
These providers take precedence in both local and manual modes.
An `undefined` result stays unavailable. Table does not substitute a local subtotal for it.

## Search and facets

A facet counts the records that contain each distinct value.
`column.getFacetedUniqueValues()` returns a read-only Map of values to counts.
It applies global search and other column filters, but excludes its own column filter.
`column.getFacetedMinMaxValues()` returns the finite numeric range from those same facet values.
An empty numeric set returns `undefined`.

```tsx
table.setGlobalFilter('ada')
table.getColumn('score')!.setFilterValue(15)

function FacetSummary() {
  return (
    <>
      <output>
        {table.getColumn('color')?.getFacetedUniqueValues()?.size ??
          'Unavailable'}
      </output>
      <output>
        {table.getColumn('score')?.getFacetedMinMaxValues()?.join(' to ') ??
          'Unavailable'}
      </output>
    </>
  )
}
```

Default search trims the query and matches case-insensitive substrings in string, number, and bigint values.
It searches visible columns with accessors, except columns with `enableGlobalFilter: false`.
Hidden columns keep their explicit column filters.
An empty query applies no global filter.
A nonempty query with no eligible columns matches no rows.

`globalFilterFn(value, query, column)` replaces the default search predicate.
It receives the trimmed query and the current column definition, including its metadata.
Computed accessors can provide nested fields or application search values.
`getFilteredRowIds()` exposes the result before sorting.

For an expensive deterministic accessor, set `enableFilterValueReuse: true` on its column definition.
This option defaults to `false` and also applies to property getters through `accessorKey`.
The accessor must return a stable value for unchanged inputs during one record match.
During that match, all accessor and predicate callbacks must preserve those inputs and returned objects.
Do not use this option for values that depend on time, randomness, invocation counts, or a fresh object identity.

Table can reuse that value between column filters and global search for the same record.
Predicate order and rejection at the first failed predicate remain unchanged.
The option also applies to repeated predicates for the same column.
Values never survive the matcher call or move between records or feature passes.
Facet value extraction, cell reads, sorting, and aggregates remain independent.
Facet counts still exclude their own column filter.

By default, each record contributes its accessor value to a facet.
For multiple values, provide `getUniqueValues(record)` in the column definition.
Table counts each distinct returned value once per record.
Map keys use JavaScript equality, including object identity for object values.
Use scalar keys when facet values must survive replacement of an object.

```ts
type Item = { tags: Array<string> }
const tagColumn = {
  id: 'tags',
  accessorFn: (record: Item) => record.tags.join(', '),
  getUniqueValues: (record: Item) => record.tags,
  enableGlobalFilter: false,
}
```

Facet memos run when read and release their tracking dependencies when their last consumer stops.
Opening a facet scans its input records.
Changing only its own filter does not rescan that facet.
Other relevant edits rebuild its counts through native Solid tracking.
Removed columns dispose their facet handles. After restoring a column, obtain its new handle through `getColumn()`.

With `manualFiltering`, local facets return `undefined` to indicate unavailable counts.
The caller can provide authoritative counts through `options.getFacetedUniqueValues(columnId)`.
When present, that function supplies facets in both local and manual modes.
An unavailable count is different from an empty Map, which represents an available result with zero values.

## Sort values

Sorting uses explicit column comparators and preserves source order for equal keys.
Multi-sort evaluates columns in state order and uses later columns to resolve ties.
Each derivation reads each sort key once per input record.
Relevant edits, append, deletion, and source reorder produce a current sequence of logical IDs.

By default, `null`, `undefined`, and `NaN` sort last in either direction.
Set `sortMissing: 'first'` to place them first.
Set `sortMissing: false` to pass those values to the custom comparator.
With explicit first or last placement, missing values tie with each other and continue to the next sort column.

```ts
const scoreColumn = {
  id: 'score',
  accessorKey: 'score' as const,
  sortFn: (a: unknown, b: unknown) => Number(a) - Number(b),
  sortMissing: 'last' as const,
}
```

Filtering and sorting use separate memos.
A sort-state change does not repeat filtering.
Closing the last consumer releases their tracked record fields.
An active feature still scans or sorts its input when a relevant field changes.

## Group records

`grouping` lists columns from the outermost group to the innermost group.
Groups derive from filtered records and retain source order unless `groupSorting` supplies a comparator at that depth.
Leaf records retain the table sort within each group.
Removing a grouping column suspends that level until the column returns.

```ts
import { nativeAggregations } from '@tanstack/solid-table/native'

const amountColumn = {
  id: 'amount',
  accessorKey: 'amount' as const,
  aggregationFn: nativeAggregations.sum,
  sortFn: (a: unknown, b: unknown) => Number(a) - Number(b),
}

table.setGrouping(['region', 'city'])
table.setGroupSorting([{ depth: 0, id: 'amount', desc: true }])
table.toggleAllGroupsExpanded(true)
table.toggleAllGroupsExpanded(false, 1)
```

A group key encodes the ordered column path and each typed grouping value.
Strings, numbers, booleans, and bigints retain distinct identities.
Null and undefined share one null group. Empty strings remain distinct.
NaN values share a group, as do positive and negative zero.
The application supplies labels such as `(none)` without changing identity.

`getGroupingValue(record)` overrides the column accessor for grouping.
Use it for date buckets or application-specific normalization.
Object values require an explicit scalar grouping value.
The application resolves date boundaries, time zones, and the start of the week.

`getGroup(key)` returns a lightweight handle with a live path, depth, count, values, and child group keys.
`getLeafRowIds()` returns an iterator over the current membership. It creates no record copies or row wrappers.
Refreshes with compatible paths retain expansion.
After the final member leaves, the old handle returns no path or values and a count of zero.

`groupExpanded` stores flags by group key. `expanded` stores record-detail flags by record ID.
These separate fields prevent collisions even when a record ID equals an encoded group key.
`toggleAllGroupsExpanded(expanded, depth?)` changes existing groups at every level or at one zero-based depth.
New groups start collapsed unless their logical keys retain expansion from an earlier refresh.

## Render grouped views

`getRowIds()` continues to return filtered, sorted record IDs for record operations and export.
`getDisplayKeys()` returns the visible hierarchy, including group headers and expanded descendants.
Both group and record display keys use separate encodings.
Use `getDisplayItem(key)` to identify the kind and obtain the raw record ID or group key.
Use `getRowKey(id)` to obtain a record's display key without depending on its encoding.

```tsx
<For each={table.getDisplayKeys().slice(start(), end())}>
  {(key) => {
    const item = table.getDisplayItem(key)
    const view =
      item.kind === 'row'
        ? table.createRowView(item.id)
        : table.createGroupView(item.key)
    return (
      <div>
        <For each={view.getVisibleCells()}>
          {(cell) => <span>{String(cell.getValue())}</span>}
        </For>
      </div>
    )
  }}
</For>
```

Create group views inside their rendered Solid scopes, after applying the visible range.
Each visible group cell owns a lazy memo for its value.
Group cells expose `group`, `column`, and `getValue()`.
Group rendering does not invent an original record for a group.

## Aggregate values

`aggregationFn(values, context)` receives a single-pass iterator over original leaf values. The context includes the member count.
Every level aggregates original leaves. Parent groups do not aggregate child averages.
For grouping columns, `group.getValue(columnId)` returns the bucket value.
`group.getAggregateValue(columnId)` always requests the aggregate, including on a grouping column.
A group cell uses the aggregate when its column defines one. Otherwise, it uses the bucket value.
Group sorting uses the bucket for the current grouping column and aggregates for other columns.

`nativeAggregations` provides these helpers:

- Numeric: `sum`, `min`, `max`, `mean`, `median`, `range`, and `span`.
- Counts: `count`, `filled`, `empty`, and `distinct`.
- Ordered values: `first` and `last`.

Numeric helpers ignore nonnumeric and nonfinite values.
For empty input, `sum` returns zero. Other numeric helpers return `undefined`.
`range` returns a minimum–maximum tuple. `span` returns maximum minus minimum.
`median` sorts a temporary array of valid numbers. It does not copy or sort source records.
An even-sized input uses the average of its two middle numbers.

`count` uses membership metadata and reads no accessor values.
`empty` counts null, undefined, and blank strings. `filled` counts the remaining values, including zero and false.
`distinct` counts nonempty values through a JavaScript Set. It preserves whitespace in nonblank strings and uses identity for objects.
Applications can supply a different comparison or normalization policy.

`first` and `last` preserve the actual endpoint value, including null or an empty string.
Within Table, they follow the current record sort across the group, independent of subgroup order and expansion.
Without sorting, they follow source order. Filtering limits the candidate records.
They scan member IDs through the existing order index and read only the selected accessor value.
Requesting either summary can activate record sorting, including in collapsed groups.
Other aggregates do not subscribe to record sorting.

The context supplies lazy `getFirstValue()` and `getLastValue()` callbacks for custom ordered summaries.
Standalone calls without those callbacks use iterator order, for example `nativeAggregations.first(values, { count: 3 })`.
The iterator remains single-pass. Custom functions can use the boundary callbacks independently of that iterator.

Date columns can supply epoch milliseconds, which are numeric timestamps, through their accessor.
Numeric minimum, maximum, range, and span then support date summaries without parsing strings inside Table.
A span uses milliseconds. The application controls date formatting, time zones, and calendar-day calculations.
Applications can supply custom aggregates for decimals or other types.

For a structured result such as a range tuple, supply `column.aggregationEquals(previous, next)` to compare equivalent results.
Group cells use this comparison before notifying subscribers. The default comparison uses `Object.is`.
This comparison preserves equivalent output references. It does not remove the aggregate scan or its temporary output allocation.

Without an external provider, `getTotalValue(columnId)` aggregates filtered records, independent of grouping and expansion.
Pass `'source'` as the second argument to aggregate all loaded source records.
For first and last, this explicit source scope follows source order and ignores table sorting and filters.
Neither scope proves that the loaded set represents a complete server result.
`manualAggregating` disables local group aggregates and totals. Unavailable values return `undefined`.
`manualGrouping` bypasses groups while preserving their state.

Membership stores IDs only at the leaf level and a count for each group.
It tracks grouping fields separately from aggregate values and leaf sorting.
An aggregate edit does not rebuild membership unless that field also controls grouping or filtering.
An observed group aggregate scans its members when a relevant value changes.
Aggregate sorting reads each sibling aggregate once per ordering pass.
It can repeat work done by visible group cells. These consumers do not share a permanent aggregate cache.
Collapsed groups do not activate leaf sorting unless another consumer requests the sorted record sequence.
Closing the last consumer releases grouping and aggregate dependencies.
Many distinct groups still require many membership nodes, but each node has no Solid owner or cell cache.

## Partition pinned rows

`getRowSections()` returns three display-key arrays: `top`, `center`, and `bottom`.
Render pinned sections separately and pass only `center` to a virtualizer.
The top and bottom arrays follow the explicit order in `rowPinning`.
An ID that appears in both sections belongs to the top section. Duplicate and missing IDs produce no extra rows.
Pinning changes display placement. It does not remove records from filtering, sorting, or group aggregates.

By default, pinned records remain visible through filtering while they remain in the source.
Set `keepPinnedRows: false` to require membership in the current display sequence.
A collapsed group hides its pinned descendants in either mode.
Saved pin state survives filtering and removal. A returning logical ID can regain its placement.
With no pins, the center array reuses `getDisplayKeys()`.

## Render a virtual window

The [native virtualized example](https://github.com/dkkloimwieder/table/blob/main/examples/solid/virtualized-rows/src/NativeApp.tsx) uses TanStack virtual-core for geometry.
Its [Solid binding](https://github.com/dkkloimwieder/table/blob/main/examples/solid/_shared/createKeyedVirtualizer.ts) publishes only visible measurements and total height.
Neither the binding nor virtual-core owns records or computes table features.
The native package itself continues to import only Solid.

The example keys its `For` by logical display key and creates row views inside that visible scope.
The range includes the viewport and five extra rows at each end.
Pinned sections create their own visible views. Their records never appear twice in the center sequence.
Pinned sections are not windowed, so applications must keep their size appropriate for the viewport.

The virtualizer receives a new key function when the displayed sequence changes.
This updates geometry after a reorder that keeps the same number of rows.
Measured heights follow surviving keys. Removed keys lose their measurement entries.
Scrolling changes the virtual window without reevaluating the dataset or constructing table-core rows.

The example moves one container for the visible window. Rows inside that container remain in normal flow.
It sets each row's current `data-index` before measuring its element.
A ResizeObserver updates visible heights after wrapping or detail expansion.
Column layout changes clear obsolete measurements. Unseen rows use estimated heights until measured.
Hidden sample rows measure the common record and group heights for the current widths and font.
This avoids repeated corrections when a constant estimate differs from every rendered row.
Real rows still receive individual measurements, including expanded details.

The binding preserves the first unobscured key and its pixel offset through sequence and column layout changes.
It restores the position after Solid commits the new geometry, so the browser uses the current scroll limits.
Measured height changes above that key also preserve its position.
If the key disappears, it retains the scroll offset within the new bounds.
The example disables browser scroll anchoring so the browser and virtualizer do not both adjust the same change.
Header and pinned sections remain sticky during scrolling.
Columns use ordinary horizontal scrolling. Horizontal virtualization is outside this work.

From `examples/solid/virtualized-rows`, start the example and open `/native.html` on the reported local address.

```sh
pnpm start
```

## Preserve drafts and focus

The example keeps name drafts and refusal messages in application state outside the virtual row components.
It creates a draft only when editing starts. Drafts contain edited fields, not complete record copies.
Selection remains in table view state.
Scrolling, sorting, and filtering can remove an editor without erasing its draft or changing its logical record ID.

When a focused row leaves the rendered window, focus returns to the grid.
Returning rows display their drafts without taking focus.
Saving and canceling remain available outside the virtual window.
The example preserves a draft when its record disappears, a concurrent name change conflicts, or the demo server refuses a save.
These responses demonstrate rendering lifetime. They do not define backend mutation semantics.

Arrow keys move between logical cells and scroll the destination into view.
Control+Home and Control+End move to the first and last cells.
Enter starts a name edit or toggles a group. Space toggles record selection.
Enter saves an active editor. Escape cancels it.
The grid exposes an active descendant only while that cell exists in the rendered window.
Accessible row positions follow the complete displayed sequence, including pinned sections.

The example binds native DOM listeners through ref callbacks and removes them when their scopes end.
This avoids retained delegated events observed with Solid rc.13 in Chromium after editing.
The [heap report](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/heap-findings.md) records the retaining paths and the matching capture after cleanup.
Create the listener helper in the owning component. Ref callbacks only supply the element.
The editor reads its row ID in the effect's compute function. The apply function moves DOM focus.

## Derive values and indexes

Accessors receive the current record.
`getSourceIndex(id)` and `row.index` read the current position in source order.
`getDisplayIndex(id)` reads the position after local filtering and sorting.
For a grouped viewport, use each key's position in `getDisplayKeys()` instead.
Absent IDs return `-1`.
Each index map is lazy and allocates only when a consumer reads it.

An index-dependent cell can combine `row.index` with its value inside the consuming computation.
Use the source index for source position and the display index for displayed numbering.
Avoid reading the display index inside a filter or sort accessor because that creates a circular dependency.

Filters read only their configured fields across their input IDs.
Sorting reads each sort key once per record during a derivation and uses a stable comparison order.
An active feature processes its full input when a tracked field changes.
Direct cell reads and active features can evaluate the same accessor separately.
Expensive computed columns need measurement before adding shared memos.
The [computed accessor profile](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/heap-findings.md#computed-accessor-profiling-on-2026-10-06) compares temporary value reuse and combined scans.
The native reuse mode tests `enableFilterValueReuse` against the separate scans.
The combined scan and fixture implementations remain experimental.

The implementation creates no memo or owner for each loaded record.
Facet controls add a few lazy memos per column instead.
The [Solid 2 cheatsheet](https://github.com/solidjs/solid/blob/next/packages/solid/CHEATSHEET.md) describes lazy memo disposal.

The [benchmark guide](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/README.md) records the workload, allocation gates, and host limits.
The [heap findings](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/heap-findings.md) distinguish native tracking costs from duplicated core caches.
Exact memory parity with the array-based table is not a requirement.

The [WAMN integration fixture](https://github.com/dkkloimwieder/table/blob/main/packages/solid-table/bench/wamn/README.md) connects real generated bindings and page helpers to a caller-owned Solid store.
It tests loading, edits, revision conflicts, partial results, and vertical virtualization with plain controls.
Production Form and shared DataGrid adoption are deferred and do not block Table qualification.
The plain-control fixture also tests selection and generated action mappings.
These mappings do not prove production forms, bulk actions, or searchable and paged reference editors.
Production component adoption remains deferred.

## Holding row structure during editing

Use the reactive `rowProcessingPaused` option to keep evaluated row membership, ordering, and group structure fixed while editing.
Cell values continue to read the caller-owned records. The table retains ID arrays and group structures without copying record data.
When processing resumes, the table derives membership and order from current records.
A structure first requested while paused initializes from current data.

The caller must guard configuration changes and retain displayed source records until processing resumes.
This option does not disable controls or manage drafts, transport requests, or record deletion.
The editing fixture demonstrates those policies, including independent child saves and deferred removal.

## Dispose the owning scope

Native Table has no separate `dispose()` command.
The component or `createRoot` that creates Table owns its reactive computations.
Dispose that root when its consumer ends.
Create each row or group view in its own rendered scope so that leaving the viewport releases its cells.

The application owns transport cancellation, drafts, listeners, and popup resources.
Those resources need cleanup in their own scopes.
The editing fixture cancels child initialization and storage requests when their model ends.
Late responses cannot install a child model or restore table configuration after disposal.

The fixtures retain two runtime workarounds first observed with Solid rc.13.
Native DOM listeners avoid the delegated-event retention described in the heap report.
The WAMN fixture drains a disposed pending queue through an `action()` and `flush()` wrapper around its render disposer.
These workarounds do not change source records or define a new Table API.
Their retirement remains separate work under `table-gd3.6.4` and `table-gd3.6.5`.
The popup fixture has its own repair-retirement task under `table-gd3.6.7.9`.
