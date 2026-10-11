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
}
export type QueryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly result: QueryResult }

export type QueryExportRequest = {
  readonly queryKey: string
  readonly columns: ReadonlyArray<QueryColumn>
  readonly sorting: ReadonlyArray<{
    readonly id: string
    readonly desc: boolean
  }>
  /** Ordered IDs from the supplied result, not a limit on a server export. */
  readonly rowIds: ReadonlyArray<string>
}

export type QueryExportProps = {
  readonly onExport?: (request: QueryExportRequest) => void
  readonly exportLabel?: string
  readonly exportDisabled?: boolean
}
