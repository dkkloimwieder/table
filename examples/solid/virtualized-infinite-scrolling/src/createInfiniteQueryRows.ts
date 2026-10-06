import { createMemo, deep, mapArray } from 'solid-js'
import type { Accessor } from 'solid-js'

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
