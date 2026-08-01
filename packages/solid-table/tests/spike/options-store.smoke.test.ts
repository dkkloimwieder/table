import { describe, expect, it, vi } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import { stockFeatures } from '@tanstack/table-core'
import { createTable } from '../../src/createTable'
import { mergeObjects } from '../../src/merge-objects'
import type { ColumnDef } from '@tanstack/table-core'

type Data = { id: string; title: string }

const columns: Array<ColumnDef<typeof stockFeatures, Data>> = [
  {
    id: 'id',
    header: 'Id',
    accessorKey: 'id',
    cell: (context) => context.getValue(),
  },
]

function makeData(length: number): Array<Data> {
  return Array.from({ length }, (_, index) => ({
    id: String(index),
    title: `Title ${index}`,
  }))
}

describe('options store as writable memo (D14)', () => {
  it('row models read current reactive data without a push-sync loop', () => {
    // Signal writes happen outside the root: user signals without `ownedWrite`
    // hard-throw inside owned scopes in the Solid 2 dev runtime (D11).
    let dispose!: () => void
    let setData!: (data: Array<Data>) => void
    let table!: ReturnType<typeof createTable<typeof stockFeatures, Data>>

    createRoot((rootDispose) => {
      dispose = rootDispose
      const [data, setDataSignal] = createSignal(makeData(2))
      setData = setDataSignal
      table = createTable({
        get data() {
          return data()
        },
        columns,
        features: stockFeatures,
        getRowId: (row) => row.id,
      })
    })

    expect(table.getRowModel().rows.map((row) => row.id)).toEqual(['0', '1'])

    setData(makeData(3))
    expect(table.getRowModel().rows.map((row) => row.id)).toEqual([
      '0',
      '1',
      '2',
    ])

    dispose()
  })

  it('setOptions persists and is immediately visible to imperative reads', () => {
    createRoot((dispose) => {
      const table = createTable({
        data: makeData(1),
        columns,
        features: stockFeatures,
      })

      expect(table.options.enableSorting).not.toBe(false)
      table.setOptions(
        (prev) => mergeObjects(prev, { enableSorting: false }) as typeof prev,
      )
      expect(table.options.enableSorting).toBe(false)

      dispose()
    })
  })

  it('a data change and a setOptions in the same tick are both visible', () => {
    let dispose!: () => void
    let setData!: (data: Array<Data>) => void
    let table!: ReturnType<typeof createTable<typeof stockFeatures, Data>>

    createRoot((rootDispose) => {
      dispose = rootDispose
      const [data, setDataSignal] = createSignal(makeData(2))
      setData = setDataSignal
      table = createTable({
        get data() {
          return data()
        },
        columns,
        features: stockFeatures,
        getRowId: (row) => row.id,
      })
    })

    setData(makeData(4))
    table.setOptions(
      (prev) => mergeObjects(prev, { enableSorting: false }) as typeof prev,
    )

    expect(table.getRowModel().rows).toHaveLength(4)
    expect(table.options.enableSorting).toBe(false)

    dispose()
  })

  it('warns in dev when constructed outside a reactive root (D17)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const table = createTable({
        data: makeData(1),
        columns,
        features: stockFeatures,
      })
      expect(table.getRowModel().rows).toHaveLength(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('outside a reactive root'),
      )
    } finally {
      warn.mockRestore()
    }
  })
})
