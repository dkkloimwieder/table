import type { NativeColumnDef } from './native-types'

export function compareNativeValues<T, TMeta>(
  column: NativeColumnDef<T, TMeta>,
  a: unknown,
  b: unknown,
  direction: number,
) {
  if (column.sortMissing !== false) {
    const missingA = a == null || Number.isNaN(a)
    const missingB = b == null || Number.isNaN(b)
    if (missingA !== missingB)
      return (missingA ? 1 : -1) * (column.sortMissing === 'first' ? -1 : 1)
    if (missingA) return 0
  }
  return column.sortFn!(a, b) * direction
}
