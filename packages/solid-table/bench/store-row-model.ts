// Experimental flat-row model. This file is not part of the published adapter.
import { constructRow } from '@tanstack/table-core'
import {
  createMemo,
  getOwner,
  mapArray,
  onCleanup,
  runWithOwner,
} from 'solid-js'
import type {
  Row,
  RowData,
  RowModel,
  TableFeatures,
} from '@tanstack/table-core'
import type { Accessor } from 'solid-js'

type InternalTable<F extends TableFeatures, D extends RowData> = Parameters<
  typeof constructRow<F, D>
>[0]

export interface KeyedRowSource<D> {
  ids: Accessor<ReadonlyArray<string>>
  get: (id: string) => D | undefined
}

export function createStoreRowModel<D extends RowData>(
  getId: (data: D) => string,
  source?: KeyedRowSource<D>,
) {
  const tableOwner = getOwner()
  if (!tableOwner)
    throw new Error('Create the store row model inside the table owner.')
  return <F extends TableFeatures>(
    table: InternalTable<F, D>,
  ): (() => RowModel<F, D>) =>
    runWithOwner(tableOwner, () => {
      if (table.options.getSubRows)
        throw new Error('The store prototype supports flat rows only.')
      function validateIds(idsToCheck: Iterable<string>) {
        const ids = new Set<string>()
        for (const id of idsToCheck) {
          if (!id || ids.has(id))
            throw new Error(
              `The store row model requires unique nonempty IDs: ${id}`,
            )
          ids.add(id)
        }
      }
      function createRow(
        id: string,
        read: Accessor<D | undefined>,
        index: Accessor<number>,
      ) {
        const owner = getOwner()!
        const item = () => {
          const value = read()
          if (value === undefined || getId(value) !== id)
            throw new Error(`Missing or mismatched record for ID: ${id}`)
          return value
        }
        const row = constructRow(table, id, item(), index(), 0)
        Object.defineProperties(row, {
          original: { enumerable: true, get: item },
          index: { enumerable: true, get: index },
        })
        const values = new Map<string, Accessor<unknown>>()
        const uniqueValues = new Map<string, Accessor<unknown>>()
        const getValue = (id: string) => {
          let value = values.get(id)
          if (!value) {
            value = runWithOwner(owner, () =>
              createMemo(
                () => {
                  const column = table.getColumn(id)
                  return column?.accessorFn?.(item(), index())
                },
                { lazy: true },
              ),
            )
            values.set(id, value)
          }
          return value()
        }
        row.getValue = getValue as typeof row.getValue
        row.getUniqueValues = ((id: string) => {
          let value = uniqueValues.get(id)
          if (!value) {
            value = runWithOwner(owner, () =>
              createMemo(
                () => {
                  const column = table.getColumn(id)
                  return (
                    column?.columnDef.getUniqueValues?.(item(), index()) ?? [
                      getValue(id),
                    ]
                  )
                },
                { lazy: true },
              ),
            )
            uniqueValues.set(id, value)
          }
          return value()
        }) as typeof row.getUniqueValues
        onCleanup(() => {
          values.clear()
          uniqueValues.clear()
        })
        return row
      }
      const rows = mapArray(
        () => {
          const ids = source ? source.ids() : table.options.data.map(getId)
          validateIds(ids)
          return ids
        },
        (id, index) =>
          createRow(
            id,
            () => (source ? source.get(id) : table.options.data[index()]),
            index,
          ),
      )
      return createMemo(() => flatModel(rows()))
    })
}

function flatModel<F extends TableFeatures, D extends RowData>(
  rows: Array<Row<F, D>>,
): RowModel<F, D> {
  return {
    rows,
    flatRows: rows,
    rowsById: Object.fromEntries(rows.map((row) => [row.id, row])),
  }
}

// Deliberately narrow feature factories for measuring invalidation. Full filter,
// sorting, faceting, grouping, and auto-reset behavior belongs to later issues.
export function createStoreFilteredRowModel() {
  const owner = getOwner()!
  return (table: InternalTable<any, any>) =>
    runWithOwner(owner, () =>
      createMemo(() => {
        const model = table.getPreFilteredRowModel()
        const filters = table.atoms.columnFilters.get()
        if (!filters.length) return model
        const resolved = filters.map((filter) => {
          const fn = table.getColumn(filter.id)?.columnDef.filterFn
          if (typeof fn !== 'function')
            throw new Error('The prototype requires explicit filter functions.')
          return { ...filter, fn }
        })
        return flatModel(
          model.rows.filter((row) =>
            resolved.every((filter) =>
              filter.fn(row, filter.id, filter.value, () => {}),
            ),
          ),
        )
      }),
    )
}

export function createStoreSortedRowModel() {
  const owner = getOwner()!
  return (table: InternalTable<any, any>) =>
    runWithOwner(owner, () =>
      createMemo(() => {
        const model = table.getPreSortedRowModel()
        const sorting = table.atoms.sorting.get()
        if (!sorting.length) return model
        const resolved = sorting.map((sort) => {
          const fn = table.getColumn(sort.id)?.columnDef.sortFn
          if (typeof fn !== 'function')
            throw new Error('The prototype requires explicit sort functions.')
          return { ...sort, fn }
        })
        const rows = model.rows.slice().sort((a, b) => {
          for (const sort of resolved) {
            const result = sort.fn(a, b, sort.id) * (sort.desc ? -1 : 1)
            if (result) return result
          }
          return a.index - b.index
        })
        return flatModel(rows)
      }),
    )
}
