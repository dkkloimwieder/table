import type { QueryResult, QuerySorting } from './types.ts'

export const sales: QueryResult = {
  key: 'sales',
  columns: [
    { id: 'region', label: 'Region' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'active', label: 'Active' },
  ],
  rows: [
    { id: 'west', values: { region: 'West', revenue: 42, active: true } },
    { id: 'east', values: { region: 'East', revenue: 7, active: false } },
    { id: 'north', values: { region: 'North', revenue: null, active: true } },
  ],
}
export const inventory: QueryResult = {
  key: 'inventory',
  columns: [
    { id: 'product', label: 'Product' },
    { id: 'stock', label: 'In stock' },
  ],
  rows: [
    { id: 'item-1', values: { product: 'Desk', stock: 12 } },
    { id: 'item-2', values: { product: 'Lamp', stock: 0 } },
  ],
}
export function sortResult(
  result: QueryResult,
  sorting: QuerySorting,
): QueryResult {
  if (!sorting.length) return result
  const rows = [...result.rows].sort((left, right) => {
    for (const sort of sorting) {
      const a = Object.hasOwn(left.values, sort.id)
        ? left.values[sort.id]
        : undefined
      const b = Object.hasOwn(right.values, sort.id)
        ? right.values[sort.id]
        : undefined
      if (a == null || b == null) {
        if (a == null && b == null) continue
        return a == null ? 1 : -1
      }
      const value =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a) < String(b)
            ? -1
            : String(a) > String(b)
              ? 1
              : 0
      if (value) return sort.desc ? -value : value
    }
    return 0
  })
  return { ...result, rows }
}
