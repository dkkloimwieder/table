import type { nativeAggregations } from '@tanstack/solid-table/native'

export type Summary = 'none' | keyof typeof nativeAggregations
export type ValueKind = 'text' | 'number' | 'date'
export type SummaryChoice = { value: Summary; label: string }
const common: Array<SummaryChoice> = [
  { value: 'none', label: 'None' },
  { value: 'count', label: 'Row count' },
  { value: 'filled', label: 'Filled count' },
  { value: 'empty', label: 'Empty count' },
  { value: 'distinct', label: 'Distinct count' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
]
const numeric: Array<SummaryChoice> = [
  { value: 'sum', label: 'Sum' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'mean', label: 'Average' },
  { value: 'median', label: 'Median' },
  { value: 'range', label: 'Range' },
  { value: 'span', label: 'Span' },
]
export const summaryChoices: Record<ValueKind, Array<SummaryChoice>> = {
  text: common,
  number: [...common, ...numeric],
  date: [
    ...common,
    { value: 'min', label: 'Earliest' },
    { value: 'max', label: 'Latest' },
    { value: 'range', label: 'Range' },
    { value: 'span', label: 'Span (days)' },
  ],
}
export const day = 86_400_000
const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 3,
})
export function formatValue(value: unknown, kind: ValueKind) {
  if (value == null || value === '') return '—'
  if (typeof value !== 'number') return String(value)
  if (!Number.isFinite(value)) return '—'
  return kind === 'date'
    ? new Date(value).toISOString().slice(0, 10)
    : numberFormat.format(value)
}
export function formatSummary(
  value: unknown,
  kind: ValueKind,
  summary: Summary,
) {
  if (value == null) return '—'
  if (Array.isArray(value))
    return value.map((part) => formatValue(part, kind)).join(' – ')
  if (['count', 'filled', 'empty', 'distinct'].includes(summary))
    return formatValue(value, 'number')
  if (kind === 'date' && summary === 'span')
    return `${formatValue(Number(value) / day, 'number')} days`
  return formatValue(value, kind)
}
export function sameSummary(previous: unknown, next: unknown) {
  return (
    Object.is(previous, next) ||
    (Array.isArray(previous) &&
      Array.isArray(next) &&
      previous.length === next.length &&
      previous.every((value, index) => Object.is(value, next[index])))
  )
}
export function compareValues(left: unknown, right: unknown): number {
  if (Array.isArray(left) && Array.isArray(right))
    return compareValues(left[0], right[0]) || compareValues(left[1], right[1])
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right))
}
