import type { QueryValue } from './types'

function field(value: QueryValue | undefined): string {
  const text = value == null ? '' : String(value)
  // Preserve numeric negatives. Treat formula-like strings as spreadsheet text.
  const safe =
    typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value)
      ? "'" + text
      : text
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe
}

export function toCsv(
  headers: ReadonlyArray<string>,
  rows: Iterable<ReadonlyArray<QueryValue | undefined>>,
): string {
  return (
    [
      headers.map(field).join(','),
      ...Array.from(rows, (row) => row.map(field).join(',')),
    ].join('\r\n') + '\r\n'
  )
}

export function downloadCsv(csv: string) {
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }),
  )
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = 'analytics.csv'
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
