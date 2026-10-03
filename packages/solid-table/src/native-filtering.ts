import { createMemo, onCleanup } from 'solid-js'
import { holdRowProcessing } from './native-processing'
import type {
  NativeColumnDef,
  NativeTableOptions,
  NativeTableState,
} from './native-types'

export function createNativeFiltering<T, TMeta>(
  options: NativeTableOptions<T, TMeta>,
  state: Readonly<NativeTableState>,
  ids: () => ReadonlyArray<string>,
  definitions: () => ReadonlyMap<string, NativeColumnDef<T, TMeta>>,
  getRecord: (id: string) => T | undefined,
  access: (record: T, column: NativeColumnDef<T, TMeta>) => unknown,
) {
  const filters = createMemo(
    () =>
      state.columnFilters.flatMap((filter) => {
        const column = definitions().get(filter.id)
        if (!column) return []
        if (!column.filterFn)
          throw new Error(`Missing filter function: ${filter.id}`)
        return [{ column, value: filter.value }]
      }),
    { lazy: true },
  )
  const search = createMemo(
    () => {
      const query = state.globalFilter.trim()
      if (!query) return undefined
      const columns = Array.from(definitions().values()).filter(
        (column) =>
          column.enableGlobalFilter !== false &&
          state.columnVisibility[column.id] !== false &&
          (column.accessorFn !== undefined || column.accessorKey !== undefined),
      )
      return {
        query,
        lower: query.toLowerCase(),
        columns,
        match: options.globalFilterFn,
      }
    },
    { lazy: true },
  )
  function createMatcher(conditions = filters()) {
    const term = search()
    if (!conditions.length && !term) return undefined
    return (record: T) => {
      for (const { column, value } of conditions) {
        if (!column.filterFn!(access(record, column), value)) return false
      }
      if (!term) return true
      return term.columns.some((column) => {
        const value = access(record, column)
        if (term.match) return term.match(value, term.query, column)
        const type = typeof value
        return (
          (type === 'string' || type === 'number' || type === 'bigint') &&
          String(value).toLowerCase().includes(term.lower)
        )
      })
    }
  }
  const filteredIds = createMemo(
    holdRowProcessing(options, () => {
      const input = ids()
      if (options.manualProcessing || options.manualFiltering) return input
      const matches = createMatcher()
      return matches ? input.filter((id) => matches(getRecord(id)!)) : input
    }),
    {
      lazy: true,
      equals: (left, right) =>
        left.length === right.length &&
        left.every((id, index) => id === right[index]),
    },
  )

  function createFacets(id: string) {
    let disposed = false
    onCleanup(() => {
      disposed = true
    })
    const otherFilters = createMemo(
      () => filters().filter(({ column }) => column.id !== id),
      {
        lazy: true,
        equals: (a, b) =>
          a.length === b.length &&
          a.every(
            (item, index) =>
              item.column === b[index]!.column &&
              Object.is(item.value, b[index]!.value),
          ),
      },
    )
    const uniqueValues = createMemo(
      () => {
        const definition = definitions().get(id)
        if (!definition) return undefined
        if (options.getFacetedUniqueValues)
          return options.getFacetedUniqueValues(id)
        if (options.manualProcessing || options.manualFiltering)
          return undefined
        const result = new Map<unknown, number>()
        const matches = createMatcher(otherFilters())
        const add = (value: unknown) =>
          result.set(value, (result.get(value) ?? 0) + 1)
        for (const rowId of ids()) {
          const record = getRecord(rowId)!
          if (matches && !matches(record)) continue
          if (definition.getUniqueValues) {
            for (const value of new Set(definition.getUniqueValues(record)))
              add(value)
          } else add(access(record, definition))
        }
        return result
      },
      { lazy: true },
    )
    const minMax = createMemo(
      () => {
        const values = uniqueValues()
        if (!values) return undefined
        let minimum = Infinity
        let maximum = -Infinity
        for (const [value, count] of values) {
          if (
            count <= 0 ||
            typeof value !== 'number' ||
            !Number.isFinite(value)
          )
            continue
          minimum = Math.min(minimum, value)
          maximum = Math.max(maximum, value)
        }
        return minimum === Infinity ? undefined : ([minimum, maximum] as const)
      },
      { lazy: true },
    )
    return {
      getFacetedUniqueValues: () => (disposed ? undefined : uniqueValues()),
      getFacetedMinMaxValues: () => (disposed ? undefined : minMax()),
    }
  }
  return { filteredIds, createFacets }
}
