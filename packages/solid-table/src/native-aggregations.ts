import type { NativeAggregationFn } from './native-types'

function* numbers(values: Iterable<unknown>) {
  for (const value of values)
    if (typeof value === 'number' && Number.isFinite(value)) yield value
}

/** Numeric functions ignore nonfinite and nonnumeric values. */
export const nativeAggregations = {
  count: (_values, { count }) => count,
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
