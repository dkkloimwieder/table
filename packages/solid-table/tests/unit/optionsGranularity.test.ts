/**
 * Reactivity-granularity pin for the pull-based options store (design D14,
 * decision 65n.8).
 *
 * The merge laziness is load-bearing: `table.options` carries the caller's
 * live option getters unevaluated, so a computation reading one option key
 * tracks only that key's underlying signal. Flattening the merge (flatMerge)
 * anywhere in the options path would evaluate every getter inside one tracked
 * scope — after that, any single option change invalidates every
 * `table.options` reader (and flattening in the setOptions path would freeze
 * the getters outright). This file pins the per-key behavior so an
 * eager-resolution restructure cannot land silently; the read-cost tradeoff
 * of the lazy chain is benchmarked in mergeObjects.test.ts (the 200-layer
 * merge case).
 */
import { describe, expect, test, vi } from 'vitest'
import { createEffect, createSignal } from 'solid-js'
import { stockFeatures } from '@tanstack/table-core'
import { createTable } from '../../src/createTable'
import { createEffectTestRoot, settle } from '../utils/reactive'
import type { ColumnDef } from '@tanstack/table-core'

type Data = { id: string; title: string }

const columns: Array<ColumnDef<typeof stockFeatures, Data>> = [
  { id: 'id', accessorKey: 'id' },
  { id: 'title', accessorKey: 'title' },
]

describe('options-store reactivity granularity (65n.8)', () => {
  test('a change to one reactive option invalidates only that option key’s readers', () => {
    const { dispose, value } = createEffectTestRoot(() => {
      const [data, setData] = createSignal<Array<Data>>([
        { id: '1', title: 'One' },
      ])
      const [enableSorting, setEnableSorting] = createSignal(true)
      const table = createTable({
        features: stockFeatures,
        columns,
        get data() {
          return data()
        },
        get enableSorting() {
          return enableSorting()
        },
      })
      const dataReads = vi.fn<(rows: ReadonlyArray<Data>) => void>()
      const sortingReads = vi.fn<(flag: boolean | undefined) => void>()
      createEffect(
        () => table.options.data,
        (rows: ReadonlyArray<Data>) => {
          dataReads(rows)
        },
      )
      createEffect(
        () => table.options.enableSorting,
        (flag: boolean | undefined) => {
          sortingReads(flag)
        },
      )
      return { setData, setEnableSorting, dataReads, sortingReads }
    })

    try {
      settle()
      const dataBaseline = value.dataReads.mock.calls.length
      const sortingBaseline = value.sortingReads.mock.calls.length
      expect(dataBaseline).toBeGreaterThan(0)
      expect(sortingBaseline).toBeGreaterThan(0)

      value.setData([
        { id: '1', title: 'One' },
        { id: '2', title: 'Two' },
      ])
      settle()
      expect(value.dataReads.mock.calls.length).toBe(dataBaseline + 1)
      // The other option key's reader must not recompute — this is the
      // granularity flatMerge cannot preserve.
      expect(value.sortingReads.mock.calls.length).toBe(sortingBaseline)

      value.setEnableSorting(false)
      settle()
      expect(value.sortingReads.mock.calls.length).toBe(sortingBaseline + 1)
      expect(value.dataReads.mock.calls.length).toBe(dataBaseline + 1)
    } finally {
      dispose()
    }
  })
})
