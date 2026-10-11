import type { QueryResult, QuerySorting } from './types.ts'

type QueryRow = QueryResult['rows'][number]
export type QueryCacheConfiguration = {
  readonly maxBytes?: number
  readonly maxRows?: number
  readonly pageSize?: number
  readonly estimateRowBytes?: (row: QueryRow) => number
}

export function estimateQueryRowBytes(row: QueryRow): number {
  let bytes = 96 + row.id.length * 2
  for (const [key, value] of Object.entries(row.values))
    bytes +=
      48 + key.length * 2 + (typeof value === 'string' ? value.length * 2 : 8)
  return bytes
}

/** Application cache. Its byte estimate does not include the active view or runtime. */
export function createQueryPageCache(
  configuration: QueryCacheConfiguration = {},
) {
  const maxBytes = configuration.maxBytes ?? 16 * 1024 * 1024
  const maxRows = configuration.maxRows ?? 100_000
  const pageSize = configuration.pageSize ?? 1000
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 1000
  )
    throw new Error('Invalid query cache budget or page size')
  const estimate = configuration.estimateRowBytes ?? estimateQueryRowBytes
  const pages = new Map<number, { result: QueryResult; bytes: number }>()
  let scope = ''
  let bytes = 0
  let rows = 0
  const clear = () => {
    pages.clear()
    bytes = 0
    rows = 0
  }
  const remove = (offset: number) => {
    const entry = pages.get(offset)
    if (entry) {
      bytes -= entry.bytes
      rows -= entry.result.rows.length
      pages.delete(offset)
    }
  }
  return {
    pageSize,
    clear,
    scope: (key: string, sorting: QuerySorting) => {
      const next = JSON.stringify([key, sorting])
      if (scope !== next) {
        clear()
        scope = next
      }
    },
    put: (offset: number, result: QueryResult) => {
      for (let index = 0; index < result.rows.length; index += pageSize) {
        const position = offset + index
        const records = result.rows.slice(index, index + pageSize)
        let size = 128
        for (const row of records) {
          const value = estimate(row)
          if (!Number.isFinite(value) || value < 0)
            throw new Error('Invalid estimated row size')
          size += Math.ceil(value)
        }
        remove(position)
        if (size > maxBytes || records.length > maxRows) continue
        while (bytes + size > maxBytes || rows + records.length > maxRows) {
          const oldest = pages.keys().next().value
          if (oldest === undefined) break
          remove(oldest)
        }
        pages.set(position, {
          result: { ...result, rows: records },
          bytes: size,
        })
        bytes += size
        rows += records.length
      }
    },
    read: (offset: number, length: number): QueryResult | undefined => {
      const records: Array<QueryRow> = []
      let result: QueryResult | undefined
      while (records.length < length) {
        const position = offset + records.length
        const pageOffset = Math.floor(position / pageSize) * pageSize
        const entry = pages.get(pageOffset)
        if (!entry) return undefined
        const available = entry.result.rows.slice(
          position - pageOffset,
          position - pageOffset + length - records.length,
        )
        if (!available.length) return undefined
        pages.delete(pageOffset)
        pages.set(pageOffset, entry)
        result = entry.result
        records.push(...available)
        if (offset + records.length >= (result.totalRows ?? Infinity)) break
      }
      return result && { ...result, rows: records }
    },
    stats: () => ({
      pages: pages.size,
      rows,
      estimatedBytes: bytes,
      maxBytes,
      maxRows,
      pageSize,
    }),
  }
}
