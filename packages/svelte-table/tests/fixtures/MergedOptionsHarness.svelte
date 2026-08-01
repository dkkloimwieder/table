<script lang="ts">
  import { untrack } from 'svelte'
  import {
    createSortedRowModel,
    sortFns,
    stockFeatures,
  } from '@tanstack/table-core'
  import { createTable } from '../../src/createTable.svelte'
  import type {
    ColumnDef,
    OnChangeFn,
    SortingState,
  } from '@tanstack/table-core'

  type Data = { id: string; title: string }

  interface Props {
    onSortingChange?: OnChangeFn<SortingState>
  }

  let { onSortingChange }: Props = $props()

  const features = {
    ...stockFeatures,
    sortedRowModel: createSortedRowModel(),
    sortFns,
  }
  const columns: Array<ColumnDef<typeof features, Data>> = [
    { id: 'id', accessorKey: 'id' },
    { id: 'title', accessorKey: 'title' },
  ]
  const data: Array<Data> = [
    { id: '1', title: 'Beta' },
    { id: '2', title: 'Alpha' },
  ]

  // The wrapper pattern this harness exists for: an optional prop the caller
  // never set, forwarded as a plain (non-getter) `onSortingChange` value.
  const table = createTable({
    data,
    columns,
    features,
    getRowId: (row) => row.id,
    onSortingChange: untrack(() => onSortingChange),
  })
</script>

<output aria-label="Sorting change handler"
  >{typeof table.options.onSortingChange}</output
>
<output aria-label="Sorted row ids"
  >{table
    .getRowModel()
    .rows.map((row) => row.id)
    .join(',')}</output
>
<output aria-label="Sorting state"
  >{JSON.stringify(table.store.get().sorting)}</output
>
<button onclick={() => table.setSorting([{ id: 'title', desc: false }])}>
  Sort title ascending
</button>
<button onclick={() => table.getColumn('title')!.toggleSorting(true)}>
  Sort title descending
</button>
