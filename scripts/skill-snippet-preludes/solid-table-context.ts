// Shared context prepended to marked Solid skill snippets via
// `<!-- skill-snippet:check prelude=... -->`. It supplies the surrounding
// declarations (features, columns, data) that pattern fences assume from
// their prose, so the fences stay minimal while still compiling.
import { createSignal } from 'solid-js'
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  createTable,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/solid-table'
import type { SortingState } from '@tanstack/solid-table'

type Person = { name: string }

const features = tableFeatures({
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})
const helper = createColumnHelper<typeof features, Person>()
const columns = helper.columns([
  helper.accessor('name', { header: 'Name' }),
])
const [data, setData] = createSignal<Array<Person>>([{ name: 'Ada' }])
