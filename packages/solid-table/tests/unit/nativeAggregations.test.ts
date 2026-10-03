import { expect, test } from 'vitest'
import { nativeAggregations as aggregate } from '../../src/native'

function* input() {
  yield* [10, null, '20', NaN, -5, Infinity, undefined, 10, 1]
}

test('numeric aggregates consume a single-pass iterator and ignore invalid numbers', () => {
  expect(aggregate.sum(input())).toBe(16)
  expect(aggregate.min(input())).toBe(-5)
  expect(aggregate.max(input())).toBe(10)
  expect(aggregate.mean(input())).toBe(4)
  expect(aggregate.median(input())).toBe(5.5)
  expect(aggregate.range(input())).toEqual([-5, 10])
  expect(aggregate.span(input())).toBe(15)
  expect(aggregate.median([9, 1, 3])).toBe(3)
  expect(aggregate.median([Number.MAX_VALUE, Number.MAX_VALUE])).toBe(
    Number.MAX_VALUE,
  )
  const unchanged = [9, 1, 3]
  aggregate.median(unchanged)
  expect(unchanged).toEqual([9, 1, 3])
})

test('empty numerical summaries distinguish zero sum from missing statistics', () => {
  expect(aggregate.sum([null, NaN])).toBe(0)
  for (const fn of [
    aggregate.min,
    aggregate.max,
    aggregate.mean,
    aggregate.median,
    aggregate.range,
    aggregate.span,
  ]) {
    expect(fn([])).toBeUndefined()
    expect(fn([null, '3', Infinity])).toBeUndefined()
    expect(fn([0])).toEqual(fn === aggregate.range ? [0, 0] : 0)
  }
})

test('general counts preserve falsy values and define blank and distinct behavior', () => {
  const values = [null, undefined, '', '  ', 0, false, 'A', 'A', ' A ']
  expect(aggregate.filled(values)).toBe(5)
  expect(aggregate.empty(values)).toBe(4)
  expect(aggregate.distinct(values)).toBe(4)
  expect(aggregate.distinct([])).toBe(0)
  expect(aggregate.first(values, { count: values.length })).toBeNull()
  expect(aggregate.last(values, { count: values.length })).toBe(' A ')
  expect(aggregate.first([], { count: 0 })).toBeUndefined()
  expect(aggregate.last([], { count: 0 })).toBeUndefined()
  expect(aggregate.last([1, undefined], { count: 2 })).toBeUndefined()
})

test('date accessors can use epoch milliseconds without parsing or time-zone assumptions', () => {
  const values = [Date.UTC(2026, 9, 3), null, Date.UTC(2026, 9, 1), NaN]
  expect(aggregate.min(values)).toBe(Date.UTC(2026, 9, 1))
  expect(aggregate.max(values)).toBe(Date.UTC(2026, 9, 3))
  expect(aggregate.range(values)).toEqual([
    Date.UTC(2026, 9, 1),
    Date.UTC(2026, 9, 3),
  ])
  expect(aggregate.span(values)).toBe(2 * 86_400_000)
})
