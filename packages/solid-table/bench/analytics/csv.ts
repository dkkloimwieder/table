import type { QueryValue } from './types.ts'

function field(value: QueryValue | undefined): string {
  const text = value == null ? '' : String(value)
  // Preserve numeric negatives. Treat formula-like strings as spreadsheet text.
  const safe =
    typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)
      ? "'" + text
      : text
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe
}

export function csvLine(values: ReadonlyArray<QueryValue | undefined>): string {
  return values.map(field).join(',') + '\r\n'
}

export function toCsv(
  headers: ReadonlyArray<string>,
  rows: Iterable<ReadonlyArray<QueryValue | undefined>>,
): string {
  return csvLine(headers) + Array.from(rows, csvLine).join('')
}
