import type { NativeAggregationFn } from './native-types'

function* numbers(values: Iterable<unknown>) {
  for (const value of values)
    if (typeof value === 'number' && Number.isFinite(value)) yield value
}

function empty(value: unknown) {
  return value == null || (typeof value === 'string' && !value.trim())
}

function range(
  values: Iterable<unknown>,
): readonly [number, number] | undefined {
  let min: number | undefined
  let max: number | undefined
  for (const value of numbers(values)) {
    min = min === undefined ? value : Math.min(min, value)
    max = max === undefined ? value : Math.max(max, value)
  }
  return min === undefined ? undefined : [min, max!]
}

/** Numeric functions ignore nonfinite and nonnumeric values. */
export const nativeAggregations = {
  count: (_values, { count }) => count,
  filled: (values) => {
    let count = 0
    for (const value of values) if (!empty(value)) count++
    return count
  },
  empty: (values) => {
    let count = 0
    for (const value of values) if (empty(value)) count++
    return count
  },
  distinct: (values) => {
    const unique = new Set<unknown>()
    for (const value of values) if (!empty(value)) unique.add(value)
    return unique.size
  },
  first: (values, context) => {
    if (context.getFirstValue) return context.getFirstValue()
    for (const value of values) return value
    return undefined
  },
  last: (values, context) => {
    if (context.getLastValue) return context.getLastValue()
    let result: unknown
    for (const value of values) result = value
    return result
  },
  range,
  span: (values) => {
    const bounds = range(values)
    return bounds ? bounds[1] - bounds[0] : undefined
  },
  median: (values) => {
    const sorted = Array.from(numbers(values)).sort((a, b) => a - b)
    if (!sorted.length) return undefined
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2
      ? sorted[middle]
      : sorted[middle - 1]! / 2 + sorted[middle]! / 2
  },
  sum: (values) => {
    let total = 0
    for (const value of numbers(values)) total += value
    return total
  },
  min: (values) => {
    let result: number | undefined
    for (const value of numbers(values))
      result = result === undefined ? value : Math.min(result, value)
    return result
  },
  max: (values) => {
    let result: number | undefined
    for (const value of numbers(values))
      result = result === undefined ? value : Math.max(result, value)
    return result
  },
  mean: (values) => {
    let total = 0
    let count = 0
    for (const value of numbers(values)) {
      total += value
      count++
    }
    return count ? total / count : undefined
  },
} satisfies Record<string, NativeAggregationFn>
