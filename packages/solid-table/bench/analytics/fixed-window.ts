export const QUERY_ROW_HEIGHT = 48

/** Fixed-height geometry requires no array proportional to the result count. */
export function fixedRowRange(
  count: number,
  offset: number,
  height: number,
  headerHeight = 0,
) {
  const top = Math.max(0, offset - headerHeight)
  const start = Math.min(
    count,
    Math.max(0, Math.floor(top / QUERY_ROW_HEIGHT) - 5),
  )
  const end = Math.min(count, Math.ceil((top + height) / QUERY_ROW_HEIGHT) + 5)
  return {
    start,
    end,
    top: start * QUERY_ROW_HEIGHT,
    bottom: (count - end) * QUERY_ROW_HEIGHT,
  }
}
