export type QueryValue = string | number | boolean | null
export type QueryRecord = Readonly<Record<string, QueryValue>>
export type QueryColumn = { readonly id: string; readonly label: string }
export type QueryResult = {
  /** An application-defined identity for this query, independent of its labels. */
  readonly key: string
  readonly columns: ReadonlyArray<QueryColumn>
  readonly rows: ReadonlyArray<{
    readonly id: string
    readonly values: QueryRecord
  }>
  readonly totalRows?: number
}
export type QueryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly result: QueryResult }

export type QuerySorting = ReadonlyArray<{
  readonly id: string
  readonly desc: boolean
}>
export type QueryBrowseRequest = {
  readonly queryKey: string
  readonly sorting: QuerySorting
}
export const DEFAULT_PREVIEW_LIMIT = 1000
export type QueryWindow = {
  readonly offset: number
  readonly totalRows: number
  readonly loading?: boolean
  readonly onRangeChange: (offset: number) => void
}

export type QueryExportRequest = QueryBrowseRequest & {
  readonly columns: ReadonlyArray<QueryColumn>
}

export type QueryExportProps = {
  readonly onExport?: (request: QueryExportRequest) => void
  readonly exportLabel?: string
  readonly exportDisabled?: boolean
}
