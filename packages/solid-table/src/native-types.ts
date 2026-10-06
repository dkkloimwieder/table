export type Updater<T> = T | ((previous: T) => T)
export type ChangeHandler<T> = (updater: Updater<T>) => void

export type NativeGroupValue = string | number | boolean | bigint | null
export interface NativeGroupPathEntry {
  readonly columnId: string
  readonly value: NativeGroupValue
}
export type NativeAggregationFn = (
  values: Iterable<unknown>,
  context: {
    readonly count: number
    /** Ordered boundaries supplied by Table. Standalone calls use iterator order. */
    readonly getFirstValue?: () => unknown
    readonly getLastValue?: () => unknown
  },
) => unknown
export type NativeDisplayItem =
  { kind: 'row'; id: string } | { kind: 'group'; key: string }

/** The caller owns this collection and all record writes. */
export interface NativeSource<T> {
  ids: () => ReadonlyArray<string>
  get: (id: string) => T | undefined
}

export interface NativeColumnDef<T, TMeta = unknown> {
  id: string
  accessorKey?: keyof T
  accessorFn?: (record: T) => unknown
  /** Reuse a deterministic value within one record's filter/search match.
   * Matcher callbacks must not change accessor inputs or returned values during that match.
   * Defaults to false. Values never survive a match or cross feature passes.
   */
  enableFilterValueReuse?: boolean
  filterFn?: (value: unknown, filter: unknown) => boolean
  getUniqueValues?: (record: T) => ReadonlyArray<unknown>
  enableGlobalFilter?: boolean
  sortFn?: (a: unknown, b: unknown) => number
  /** Null, undefined, and NaN. Placement is independent of sort direction. */
  sortMissing?: 'first' | 'last' | false
  /** Return a scalar bucket, such as an application-defined date bucket. */
  getGroupingValue?: (record: T) => NativeGroupValue | undefined
  aggregationFn?: NativeAggregationFn
  /** Preserve equivalent structured summary results, such as a min/max pair. */
  aggregationEquals?: (previous: unknown, next: unknown) => boolean
  header?: unknown
  cell?: unknown
  meta?: TMeta
  size?: number
  minSize?: number
  maxSize?: number
  enableHiding?: boolean
  enablePinning?: boolean
  enableResizing?: boolean
}

export interface NativeTableState {
  columnFilters: Array<{ id: string; value: unknown }>
  globalFilter: string
  sorting: Array<{ id: string; desc: boolean }>
  grouping: Array<string>
  groupSorting: Array<{ depth: number; id: string; desc: boolean }>
  groupExpanded: Record<string, boolean>
  rowSelection: Record<string, boolean>
  expanded: Record<string, boolean>
  columnVisibility: Record<string, boolean>
  columnOrder: Array<string>
  columnPinning: { start: Array<string>; end: Array<string> }
  columnSizing: Record<string, number>
  rowPinning: { top: Array<string>; bottom: Array<string> }
}

export type NativeStateCallbacks = {
  [K in keyof NativeTableState as `on${Capitalize<K>}Change`]?: ChangeHandler<
    NativeTableState[K]
  >
}

export interface NativeTableOptions<
  T,
  TMeta = unknown,
> extends NativeStateCallbacks {
  source: NativeSource<T>
  columns: ReadonlyArray<NativeColumnDef<T, TMeta>>
  initialState?: Partial<NativeTableState>
  state?: Partial<NativeTableState>
  /** Hold evaluated row membership, order and group structure. Cell values stay live.
   * The caller must retain displayed source records and guard configuration changes.
   */
  rowProcessingPaused?: boolean
  /** Bypass every local data transformation while preserving view state. */
  manualProcessing?: boolean
  manualFiltering?: boolean
  manualSorting?: boolean
  manualGrouping?: boolean
  manualAggregating?: boolean
  /** Keep pinned source records through filtering. Collapsed groups still hide them. */
  keepPinnedRows?: boolean
  globalFilterFn?: (
    value: unknown,
    query: string,
    column: NativeColumnDef<T, TMeta>,
  ) => boolean
  /** Authoritative external counts. Undefined means unavailable. */
  getFacetedUniqueValues?: (
    columnId: string,
  ) => ReadonlyMap<unknown, number> | undefined
  /** Authoritative external total. Undefined means unavailable. */
  getTotalValue?: (columnId: string, scope: 'source' | 'filtered') => unknown
}

export interface NativeColumn<T, TMeta = unknown> {
  readonly id: string
  readonly columnDef: NativeColumnDef<T, TMeta> | undefined
  getIsVisible: () => boolean
  toggleVisibility: (visible?: boolean) => void
  getIsPinned: () => 'start' | 'end' | false
  pin: (position: 'start' | 'end' | false) => void
  getSize: () => number
  setSize: (size: number) => void
  getFilterValue: () => unknown
  setFilterValue: (value: Updater<unknown>) => void
  getFacetedUniqueValues: () => ReadonlyMap<unknown, number> | undefined
  getFacetedMinMaxValues: () => readonly [number, number] | undefined
  getIsSorted: () => 'asc' | 'desc' | false
  toggleSorting: (desc?: boolean, multi?: boolean) => void
}

export interface NativeRow<T> {
  readonly id: string
  readonly original: T | undefined
  readonly index: number
  getValue: <V = unknown>(columnId: string) => V | undefined
  getIsSelected: () => boolean
  toggleSelected: (selected?: boolean) => void
  getIsExpanded: () => boolean
  toggleExpanded: (expanded?: boolean) => void
  getIsPinned: () => 'top' | 'bottom' | false
  pin: (position: 'top' | 'bottom' | false) => void
}

export interface NativeCellContext<T, TMeta = unknown> {
  table: NativeTable<T, TMeta>
  row: NativeRow<T>
  column: NativeColumn<T, TMeta>
  cell: NativeCell<T, TMeta>
  getValue: <V = unknown>() => V | undefined
}

export interface NativeCell<T, TMeta = unknown> {
  readonly id: string
  readonly row: NativeRow<T>
  readonly column: NativeColumn<T, TMeta>
  getValue: <V = unknown>() => V | undefined
  getContext: () => NativeCellContext<T, TMeta>
}

export interface NativeRowView<T, TMeta = unknown> extends NativeRow<T> {
  getVisibleCells: () => Array<NativeCell<T, TMeta>>
}

/** Group handles contain no record copies or per-record reactive owners. */
export interface NativeGroup {
  readonly key: string
  readonly path: ReadonlyArray<NativeGroupPathEntry> | undefined
  readonly depth: number
  readonly count: number
  getLeafRowIds: () => Iterable<string>
  getChildGroupKeys: () => ReadonlyArray<string>
  getValue: <V = unknown>(columnId: string) => V | undefined
  getAggregateValue: <V = unknown>(columnId: string) => V | undefined
  getIsExpanded: () => boolean
  toggleExpanded: (expanded?: boolean) => void
}

export interface NativeGroupCell<T, TMeta = unknown> {
  readonly id: string
  readonly group: NativeGroup
  readonly column: NativeColumn<T, TMeta>
  getValue: <V = unknown>() => V | undefined
}

export interface NativeGroupView<T, TMeta = unknown> extends NativeGroup {
  getVisibleCells: () => Array<NativeGroupCell<T, TMeta>>
}

export type NativeStateSetters = {
  [K in keyof NativeTableState as `set${Capitalize<K>}`]: ChangeHandler<
    NativeTableState[K]
  >
}

export interface NativeTable<T, TMeta = unknown> extends NativeStateSetters {
  readonly options: NativeTableOptions<T, TMeta>
  readonly state: Readonly<NativeTableState>
  getSourceIds: () => ReadonlyArray<string>
  getFilteredRowIds: () => ReadonlyArray<string>
  getRowIds: () => ReadonlyArray<string>
  /** Encoded keys distinguish records from groups without reserving row IDs. */
  getDisplayKeys: () => ReadonlyArray<string>
  getRowKey: (id: string) => string
  getRowSections: () => {
    top: ReadonlyArray<string>
    center: ReadonlyArray<string>
    bottom: ReadonlyArray<string>
  }
  getDisplayItem: (key: string) => NativeDisplayItem
  getRootGroupKeys: () => ReadonlyArray<string>
  getGroup: (key: string) => NativeGroup
  createGroupView: (key: string) => NativeGroupView<T, TMeta>
  toggleAllGroupsExpanded: (expanded: boolean, depth?: number) => void
  getTotalValue: <V = unknown>(
    columnId: string,
    scope?: 'source' | 'filtered',
  ) => V | undefined
  getSourceIndex: (id: string) => number
  getDisplayIndex: (id: string) => number
  getValue: <V = unknown>(id: string, columnId: string) => V | undefined
  getColumn: (id: string) => NativeColumn<T, TMeta> | undefined
  getColumns: () => Array<NativeColumn<T, TMeta>>
  getVisibleColumns: () => Array<NativeColumn<T, TMeta>>
  getRow: (id: string) => NativeRow<T>
  /** Call inside the Solid scope that owns the rendered row. */
  createRowView: (id: string) => NativeRowView<T, TMeta>
}
