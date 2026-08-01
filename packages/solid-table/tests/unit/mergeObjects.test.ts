import { describe, expect, test, vi } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import {
  createSortedRowModel,
  sortFns,
  stockFeatures,
} from '@tanstack/table-core'
import { createTable } from '../../src/createTable'
import { createTableHook } from '../../src/createTableHook'
import { flatMerge, mergeObjects } from '../../src/merge-objects'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/table-core'

type Data = { id: string; title: string }

const sortingFeatures = {
  ...stockFeatures,
  sortedRowModel: createSortedRowModel(),
  sortFns,
}

const columns: Array<ColumnDef<typeof sortingFeatures, Data>> = [
  { id: 'id', accessorKey: 'id' },
  { id: 'title', accessorKey: 'title' },
]

const data: Array<Data> = [
  { id: '1', title: 'Beta' },
  { id: '2', title: 'Alpha' },
]

/**
 * The wrapper pattern this whole helper exists for: an optional prop that the
 * caller never set, forwarded as `{ onSortingChange: props.onSortingChange }`.
 */
const wrapperProps: { onSortingChange?: OnChangeFn<SortingState> } = {}

function createTestRoot<T>(setup: () => T) {
  let dispose!: () => void
  const value = createRoot((rootDispose) => {
    dispose = rootDispose
    return setup()
  })
  return { dispose, value }
}

describe('merged table options', () => {
  test('an unset optional onSortingChange keeps the feature default handler', () => {
    const { dispose, value: table } = createTestRoot(() =>
      createTable({
        data,
        columns,
        features: sortingFeatures,
        getRowId: (row) => row.id,
        onSortingChange: wrapperProps.onSortingChange,
      }),
    )

    try {
      expect(table.options.onSortingChange).toEqual(expect.any(Function))
      expect(table.getRowModel().rows.map((row) => row.id)).toEqual(['1', '2'])

      table.setSorting([{ id: 'title', desc: false }])

      expect(table.store.get().sorting).toEqual([{ id: 'title', desc: false }])
      expect(table.getRowModel().rows.map((row) => row.id)).toEqual(['2', '1'])

      table.getColumn('title')!.toggleSorting(true)

      expect(table.store.get().sorting).toEqual([{ id: 'title', desc: true }])
      expect(table.getRowModel().rows.map((row) => row.id)).toEqual(['1', '2'])
    } finally {
      dispose()
    }
  })

  test('createAppTable keeps hook defaults an unset per-table option would erase', () => {
    const hookHandler = vi.fn<OnChangeFn<SortingState>>()
    const hook = createTableHook({
      features: sortingFeatures,
      getRowId: (row: Data) => row.id,
      onSortingChange: hookHandler,
    })
    const { dispose, value: table } = createTestRoot(() =>
      hook.createAppTable<Data>({
        data,
        columns,
        onSortingChange: wrapperProps.onSortingChange,
      }),
    )

    try {
      expect(table.options.onSortingChange).toBe(hookHandler)

      table.setSorting([{ id: 'title', desc: false }])

      expect(hookHandler).toHaveBeenCalledOnce()
    } finally {
      dispose()
    }
  })
})

describe('mergeObjects', () => {
  test('does not evaluate getters while merging and keeps reads live', () => {
    const [title, setTitle] = createSignal('first')
    const readTitle = vi.fn(() => title())
    const source = {
      get title() {
        return readTitle()
      },
    }

    const merged = mergeObjects({ id: 'id', title: 'default' }, source)

    expect(readTitle).not.toHaveBeenCalled()
    expect(merged.title).toBe('first')
    expect(readTitle).toHaveBeenCalledOnce()

    setTitle('second')

    expect(merged.title).toBe('second')
    expect(readTitle).toHaveBeenCalledTimes(2)
  })

  test('a present-but-undefined value never overrides an earlier source', () => {
    const defaultHandler = vi.fn<OnChangeFn<SortingState>>()
    const merged = mergeObjects(
      { enableSorting: true, onSortingChange: defaultHandler },
      { enableSorting: false, ...wrapperProps },
    )

    expect(merged.onSortingChange).toBe(defaultHandler)
    expect(merged.enableSorting).toBe(false)
  })

  test('leaves an all-undefined key off the result so spreads cannot re-apply it', () => {
    const merged: Record<string, unknown> = mergeObjects(
      { enableSorting: true },
      { onSortingChange: undefined },
    )

    expect(Object.hasOwn(merged, 'onSortingChange')).toBe(false)

    // `constructTable` spreads the options over the feature defaults, so an own
    // key holding `undefined` would erase the default handler right there even
    // though every merge along the way skips it.
    const spread = { onSortingChange: 'feature-default', ...merged }

    expect(spread.onSortingChange).toBe('feature-default')
  })
})

describe('flatMerge', () => {
  const SYNC_COUNT = 200

  test('caps the getter chain that repeated option syncs would grow', () => {
    let fallthroughReads = 0
    const featureDefaults = { onSortingChange: 'feature-default' }
    // Every sync merges the same shape back in: an optional callback that
    // resolves to `undefined`, so reads have to fall through to the defaults.
    const nextOptions = () => ({
      get onSortingChange() {
        fallthroughReads++
        return undefined
      },
    })

    let chained: Record<string, unknown> = featureDefaults
    for (let i = 0; i < SYNC_COUNT; i++) {
      chained = mergeObjects(chained, nextOptions())
    }
    fallthroughReads = 0

    expect(chained.onSortingChange).toBe('feature-default')
    // One getter hop per accumulated layer: the chain grows with every sync.
    expect(fallthroughReads).toBe(SYNC_COUNT)

    let flattened: Record<string, unknown> = featureDefaults
    for (let i = 0; i < SYNC_COUNT; i++) {
      flattened = flatMerge(flattened, nextOptions())
    }
    fallthroughReads = 0

    expect(flattened.onSortingChange).toBe('feature-default')
    expect(fallthroughReads).toBe(0)
    expect(
      Object.getOwnPropertyDescriptor(flattened, 'onSortingChange')?.get,
    ).toBeUndefined()
  })
})
