import { createMemo, deep, mapArray } from 'solid-js'
import type { Accessor } from 'solid-js'

export function getInfiniteQueryReconcileKey(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return undefined
  const item = value as { id?: unknown; data?: unknown }
  // This key matches the example's { data: Row[] } page shape.
  // Rows keep their IDs. Keyless pages keep their row array identity so
  // positional reconciliation cannot adopt a page into another page's proxy.
  return item.id ?? (Array.isArray(item.data) ? item.data : undefined)
}

export function createInfiniteQueryRows<TPage, TRow>(
  pages: Accessor<Array<TPage> | undefined>,
  readRows: (page: TPage) => Array<TRow>,
): Accessor<Array<TRow>> {
  // Position accessors follow reconciled page slots. mapArray owns their memos
  // and releases them when slots disappear or the caller's owner is disposed.
  const snapshots = mapArray(
    pages,
    (page) => createMemo(() => deep(readRows(page()))),
    { keyed: false },
  )
  return createMemo(() => snapshots().flatMap((read) => read()))
}
