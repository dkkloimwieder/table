import { createMemo, getOwner, mapArray } from 'solid-js'
import { createNativeState, resolveUpdater } from './native-state'
import { createNativeFiltering } from './native-filtering'
import { createNativeGrouping } from './native-grouping'
import { compareNativeValues } from './native-sorting'
import type {
  NativeCell,
  NativeCellContext,
  NativeColumn,
  NativeColumnDef,
  NativeGroupView,
  NativeRow,
  NativeRowView,
  NativeTable,
  NativeTableOptions,
} from './native-types'

/** A Solid-owned table over a caller-owned record collection. */
export function createNativeTable<T, TMeta = unknown>(
  options: NativeTableOptions<T, TMeta>,
): NativeTable<T, TMeta> {
  if (!getOwner())
    throw new Error('Create the native table inside a Solid owner')
  const { state, setters } = createNativeState(options)
  const definitions = createMemo(() => {
    const result = new Map<string, NativeColumnDef<T, TMeta>>()
    for (const column of options.columns) {
      if (!column.id || result.has(column.id))
        throw new Error('Native table requires unique nonempty column IDs')
      result.set(column.id, column)
    }
    return result
  })
  const ids = createMemo(() => {
    const result = Array.from(options.source.ids())
    const seen = new Set<string>()
    for (const id of result) {
      if (typeof id !== 'string' || !id || seen.has(id))
        throw new Error('Native table requires unique nonempty row IDs')
      seen.add(id)
    }
    return result
  })
  const sourceIndexes = createMemo(
    () => new Map(ids().map((id, index) => [id, index])),
    { lazy: true },
  )
  function getRecord(id: string) {
    const record = options.source.get(id)
    // Removed cell scopes can compute before their For owner disposes them.
    // Return no value for removal, but reject an inconsistent live source.
    if (record === undefined && ids().includes(id))
      throw new Error(`Missing record: ${id}`)
    return record
  }
  function access(record: T, column: NativeColumnDef<T, TMeta>) {
    return column.accessorFn
      ? column.accessorFn(record)
      : column.accessorKey === undefined
        ? undefined
        : record[column.accessorKey]
  }
  function getValue<V = unknown>(id: string, columnId: string): V | undefined {
    const record = getRecord(id)
    const column = definitions().get(columnId)
    return record === undefined || column === undefined
      ? undefined
      : (access(record, column) as V)
  }
  const { filteredIds, createFacets } = createNativeFiltering(
    options,
    state,
    ids,
    definitions,
    getRecord,
    access,
  )
  const sortedIds = createMemo(
    () => {
      const input = filteredIds()
      if (options.manualProcessing || options.manualSorting) return input
      const sorting = state.sorting.flatMap((sort) => {
        const column = definitions().get(sort.id)
        if (!column) return []
        if (!column.sortFn) throw new Error(`Missing sort function: ${sort.id}`)
        return [{ column, direction: sort.desc ? -1 : 1 }]
      })
      if (!sorting.length) return input
      // Decorate this derivation once. No values survive in a row cache.
      const keyed = input.map((id, index) => {
        const record = getRecord(id)!
        return {
          id,
          index,
          values: sorting.map(({ column }) => access(record, column)),
        }
      })
      keyed.sort((a, b) => {
        for (let i = 0; i < sorting.length; i++) {
          const { column, direction } = sorting[i]!
          const order = compareNativeValues(
            column,
            a.values[i],
            b.values[i],
            direction,
          )
          if (order) return order
        }
        return a.index - b.index
      })
      return keyed.map(({ id }) => id)
    },
    { lazy: true },
  )
  const displayIndexes = createMemo(
    () => new Map(sortedIds().map((id, index) => [id, index])),
    { lazy: true },
  )
  const grouping = createNativeGrouping(
    options,
    state,
    setters,
    ids,
    filteredIds,
    sortedIds,
    definitions,
    getRecord,
    access,
  )
  const rowSections = createMemo(
    () => {
      const display = grouping.getDisplayKeys()
      const topIds = state.rowPinning.top
      const bottomIds = state.rowPinning.bottom
      if (!topIds.length && !bottomIds.length)
        return { top: [], center: display, bottom: [] }
      const keep = options.keepPinnedRows !== false
      const available = keep ? new Set(ids()) : new Set(display)
      const seen = new Set<string>()
      const select = (input: ReadonlyArray<string>) =>
        input.flatMap((id) => {
          const key = grouping.getRowKey(id)
          if (
            seen.has(key) ||
            !available.has(keep ? id : key) ||
            (keep && !grouping.isRowVisibleThroughGroups(id))
          )
            return []
          seen.add(key)
          return [key]
        })
      const top = select(topIds)
      const bottom = select(bottomIds)
      return { top, center: display.filter((key) => !seen.has(key)), bottom }
    },
    { lazy: true },
  )
  const columns = mapArray(
    () => Array.from(definitions().keys()),
    (id): NativeColumn<T, TMeta> =>
      Object.defineProperty(
        {
          id,
          ...createFacets(id),
          columnDef: undefined,
          getIsVisible: () =>
            definitions().has(id) && state.columnVisibility[id] !== false,
          toggleVisibility: (visible) => {
            if (definitions().get(id)?.enableHiding === false) return
            setters.setColumnVisibility((old) => ({
              ...old,
              [id]: visible ?? old[id] === false,
            }))
          },
          getIsPinned: () =>
            state.columnPinning.start.includes(id)
              ? 'start'
              : state.columnPinning.end.includes(id)
                ? 'end'
                : false,
          pin: (position) => {
            if (definitions().get(id)?.enablePinning === false) return
            setters.setColumnPinning((old) => ({
              start: [
                ...old.start.filter((key) => key !== id),
                ...(position === 'start' ? [id] : []),
              ],
              end: [
                ...old.end.filter((key) => key !== id),
                ...(position === 'end' ? [id] : []),
              ],
            }))
          },
          getSize: () => {
            const definition = definitions().get(id)
            const minimum = definition?.minSize ?? 20
            const maximum = Math.max(
              minimum,
              definition?.maxSize ?? Number.MAX_SAFE_INTEGER,
            )
            const configured = state.columnSizing[id]
            return Math.min(
              maximum,
              Math.max(
                minimum,
                Number.isFinite(configured)
                  ? configured!
                  : (definition?.size ?? 150),
              ),
            )
          },
          setSize: (size) => {
            if (!Number.isFinite(size))
              throw new Error('Column size must be finite')
            if (definitions().get(id)?.enableResizing === false) return
            setters.setColumnSizing((old) => ({ ...old, [id]: size }))
          },
          getFilterValue: () =>
            state.columnFilters.find((filter) => filter.id === id)?.value,
          setFilterValue: (updater) =>
            setters.setColumnFilters((old) => {
              const value = resolveUpdater(
                updater,
                old.find((filter) => filter.id === id)?.value,
              )
              const rest = old.filter((filter) => filter.id !== id)
              return value === undefined ? rest : [...rest, { id, value }]
            }),
          getIsSorted: () => {
            const sort = state.sorting.find((item) => item.id === id)
            return sort ? (sort.desc ? 'desc' : 'asc') : false
          },
          toggleSorting: (desc, multi = false) =>
            setters.setSorting((old) => {
              const current = old.find((sort) => sort.id === id)
              const rest = multi ? old.filter((sort) => sort.id !== id) : []
              if (desc === undefined && current?.desc) return rest
              const next = { id, desc: desc ?? current !== undefined }
              return multi && current
                ? old.map((sort) => (sort.id === id ? next : sort))
                : [...rest, next]
            }),
        } satisfies NativeColumn<T, TMeta>,
        'columnDef',
        {
          enumerable: true,
          configurable: true,
          // A literal getter can enter V8's allocation-template descriptor cache
          // and retain this table's closures after its owner is disposed.
          get: () => definitions().get(id),
        },
      ),
  )
  const columnLookup = createMemo(
    () => new Map(columns().map((column) => [column.id, column])),
  )
  const orderedColumns = createMemo(() => {
    const available = columnLookup()
    const seen = new Set<string>()
    const result: Array<NativeColumn<T, TMeta>> = []
    for (const id of [
      ...state.columnPinning.start,
      ...state.columnOrder,
      ...available.keys(),
    ]) {
      if (seen.has(id) || !available.has(id)) continue
      if (
        state.columnPinning.end.includes(id) &&
        !state.columnPinning.start.includes(id)
      )
        continue
      seen.add(id)
      result.push(available.get(id)!)
    }
    for (const id of state.columnPinning.end) {
      if (seen.has(id) || !available.has(id)) continue
      seen.add(id)
      result.push(available.get(id)!)
    }
    return result
  })
  const visibleColumns = createMemo(() =>
    orderedColumns().filter((column) => column.getIsVisible()),
  )
  function getRow(id: string): NativeRow<T> {
    return {
      id,
      get original() {
        return getRecord(id)
      },
      get index() {
        return sourceIndexes().get(id) ?? -1
      },
      getValue: (columnId) => getValue(id, columnId),
      getIsSelected: () => state.rowSelection[id] === true,
      toggleSelected: (selected) =>
        setters.setRowSelection((old) => ({
          ...old,
          [id]: selected ?? old[id] !== true,
        })),
      getIsExpanded: () => state.expanded[id] === true,
      toggleExpanded: (expanded) =>
        setters.setExpanded((old) => ({
          ...old,
          [id]: expanded ?? old[id] !== true,
        })),
      getIsPinned: () =>
        state.rowPinning.top.includes(id)
          ? 'top'
          : state.rowPinning.bottom.includes(id)
            ? 'bottom'
            : false,
      pin: (position) =>
        setters.setRowPinning((old) => ({
          top: [
            ...old.top.filter((key) => key !== id),
            ...(position === 'top' ? [id] : []),
          ],
          bottom: [
            ...old.bottom.filter((key) => key !== id),
            ...(position === 'bottom' ? [id] : []),
          ],
        })),
    }
  }
  function createRowView(id: string): NativeRowView<T, TMeta> {
    if (!getOwner())
      throw new Error('Create the row view inside its rendered Solid owner')
    const row = getRow(id)
    const cells = mapArray(visibleColumns, (column) => {
      const value = <V = unknown>() => row.getValue<V>(column.id)
      const cell: NativeCell<T, TMeta> = {
        id: JSON.stringify([id, column.id]),
        row,
        column,
        getValue: value,
        getContext: () => context,
      }
      const context: NativeCellContext<T, TMeta> = {
        table,
        row,
        column,
        cell,
        getValue: value,
      }
      return cell
    })
    // Preserve property getters on the row. Object spread would read them.
    return Object.assign(row, { getVisibleCells: cells })
  }
  const table: NativeTable<T, TMeta> = {
    options,
    state,
    ...setters,
    ...grouping,
    getRowSections: rowSections,
    createGroupView: (key): NativeGroupView<T, TMeta> => {
      if (!getOwner())
        throw new Error('Create the group view inside its rendered Solid owner')
      const group = grouping.getGroup(key)
      const cells = mapArray(visibleColumns, (column) => {
        const value = createMemo(() => group.getValue(column.id), {
          lazy: true,
        })
        return {
          id: JSON.stringify([key, column.id]),
          group,
          column,
          getValue: <V>() => value() as V | undefined,
        }
      })
      return Object.assign(group, { getVisibleCells: cells })
    },
    getSourceIds: ids,
    getFilteredRowIds: filteredIds,
    getRowIds: sortedIds,
    getSourceIndex: (id) => sourceIndexes().get(id) ?? -1,
    getDisplayIndex: (id) => displayIndexes().get(id) ?? -1,
    getValue,
    getColumn: (id) => columnLookup().get(id),
    getColumns: orderedColumns,
    getVisibleColumns: visibleColumns,
    getRow,
    createRowView,
  }
  return table
}
