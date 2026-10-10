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
