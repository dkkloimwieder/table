/** Fixed geometry stores only the visible range, independent of total count. */
export function fixedVirtualRange(
  count: number,
  offset: number,
  height: number,
  rowHeight: number,
  scrollMargin = 0,
  overscan = 5,
) {
  const top = Math.max(0, offset - scrollMargin)
  const start = Math.min(
    count,
    Math.max(0, Math.floor(top / rowHeight) - overscan),
  )
  const end = Math.min(count, Math.ceil((top + height) / rowHeight) + overscan)
  return {
    start,
    end,
    top: start * rowHeight,
    bottom: (count - end) * rowHeight,
  }
}
