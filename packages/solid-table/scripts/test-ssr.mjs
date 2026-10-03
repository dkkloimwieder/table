import assert from 'node:assert/strict'
import { createComponent } from 'solid-js'
import { renderToString } from '@solidjs/web'
import { FlexRender, createTable, tableFeatures } from '@tanstack/solid-table'
import {
  createTable as createNativeTable,
  nativeAggregations,
} from '@tanstack/solid-table/native'

for (const entry of [
  'static-functions',
  'flex-render',
  'experimental-worker-plugin',
]) {
  await import(`@tanstack/solid-table/${entry}`)
}

const output = await renderToString(() => {
  const table = createTable({
    features: tableFeatures({}),
    columns: [{ accessorKey: 'name' }],
    data: [{ name: 'Ada' }],
  })
  return createComponent(FlexRender, {
    cell: table.getRowModel().rows[0].getAllCells()[0],
  })
})
assert.equal(output, 'Ada')
const nativeOutput = await renderToString(() => {
  const table = createNativeTable({
    source: { ids: () => ['a'], get: () => ({ name: 'Native Ada' }) },
    columns: [{ id: 'name', accessorKey: 'name' }],
  })
  return String(table.createRowView('a').getVisibleCells()[0].getValue())
})
assert.equal(nativeOutput, 'Native Ada')
const nativeFeatures = await renderToString(() => {
  const records = {
    a: { color: 'red', score: 20 },
    b: { color: 'blue', score: 10 },
    c: { color: 'red', score: 30 },
  }
  const table = createNativeTable({
    source: { ids: () => ['a', 'b', 'c'], get: (id) => records[id] },
    columns: [
      { id: 'color', accessorKey: 'color' },
      {
        id: 'score',
        accessorKey: 'score',
        filterFn: (value, minimum) => value >= minimum,
        sortFn: (a, b) => a - b,
      },
    ],
    initialState: {
      globalFilter: 'red',
      columnFilters: [{ id: 'score', value: 15 }],
      sorting: [{ id: 'score', desc: true }],
    },
  })
  const score = table.getColumn('score')
  return `${table.getRowIds()}|${[...score.getFacetedUniqueValues().keys()]}|${score.getFacetedMinMaxValues()}`
})
assert.equal(nativeFeatures, 'c,a|20,30|20,30')
const nativeGroups = await renderToString(() => {
  const records = {
    a: { region: 'east', amount: 20 },
    b: { region: 'east', amount: 30 },
    c: { region: 'west', amount: 10 },
  }
  const table = createNativeTable({
    source: { ids: () => Object.keys(records), get: (id) => records[id] },
    columns: [
      { id: 'region', accessorKey: 'region' },
      {
        id: 'amount',
        accessorKey: 'amount',
        aggregationFn: nativeAggregations.sum,
      },
    ],
    initialState: { grouping: ['region'] },
  })
  return (
    table
      .getRootGroupKeys()
      .map((key) =>
        table
          .createGroupView(key)
          .getVisibleCells()
          .map((cell) => cell.getValue())
          .join(':'),
      )
      .join('|') + `|${table.getTotalValue('amount')}`
  )
})
assert.equal(nativeGroups, 'east:50|west:10|60')
const manualOutput = await renderToString(() => {
  const table = createNativeTable({
    source: { ids: () => ['partial'], get: () => ({ amount: 10 }) },
    columns: [
      {
        id: 'amount',
        accessorKey: 'amount',
        aggregationFn: nativeAggregations.sum,
      },
    ],
    manualProcessing: true,
    initialState: { globalFilter: 'missing', grouping: ['amount'] },
  })
  return `${table.getRowIds()}|${table.getRootGroupKeys().length}|${table.getTotalValue('amount')}`
})
assert.equal(manualOutput, 'partial|0|undefined')
console.log('Solid package imports and server cell rendering passed.')
