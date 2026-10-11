import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createQueryPageCache, estimateQueryRowBytes } from './page-cache.ts'
import { fixedRowRange } from './fixed-window.ts'

const result = (start, count, text = 'small') => ({
  key: 'query',
  columns: [{ id: 'text', label: 'Text' }],
  totalRows: 10000,
  rows: Array.from({ length: count }, (_, index) => ({
    id: `row-${start + index}`,
    values: { text },
  })),
})

test('Byte budget retains more cheap rows than large rows', () => {
  const cheap = createQueryPageCache({ pageSize: 10, maxBytes: 12000 })
  const large = createQueryPageCache({ pageSize: 10, maxBytes: 12000 })
  for (let offset = 0; offset < 50; offset += 10) {
    cheap.put(offset, result(offset, 10))
    large.put(offset, result(offset, 10, 'x'.repeat(300)))
  }
  assert.equal(cheap.stats().rows, 50)
  assert.equal(large.stats().rows, 10)
  assert.ok(large.stats().estimatedBytes <= 12000)
  assert.ok(
    estimateQueryRowBytes(result(0, 1, 'x'.repeat(300)).rows[0]) >
      estimateQueryRowBytes(result(0, 1).rows[0]),
  )
})

test('Row cap evicts the least recently read page and reuses original records', () => {
  const cache = createQueryPageCache({ pageSize: 2, maxRows: 4 })
  const first = result(0, 2)
  cache.put(0, first)
  cache.put(2, result(2, 2))
  assert.equal(cache.read(0, 2).rows[0], first.rows[0])
  cache.put(4, result(4, 2))
  assert.equal(cache.read(2, 2), undefined)
  assert.equal(cache.stats().rows, 4)
  assert.ok(cache.read(0, 2))
})

test('Cache scopes separate queries and sorting and release records on clear', () => {
  const cache = createQueryPageCache()
  cache.scope('query', [])
  cache.put(0, result(0, 10))
  cache.scope('query', [])
  assert.ok(cache.read(0, 10))
  cache.scope('query', [{ id: 'text', desc: true }])
  assert.equal(cache.stats().rows, 0)
  cache.put(0, result(0, 10))
  cache.scope('other', [])
  assert.equal(cache.stats().rows, 0)
  cache.put(0, result(0, 10))
  cache.clear()
  assert.equal(cache.stats().estimatedBytes, 0)
})

test('Oversized pages bypass caching and custom estimators define retention', () => {
  const cache = createQueryPageCache({
    maxBytes: 500,
    pageSize: 2,
    estimateRowBytes: () => 100,
  })
  cache.put(0, result(0, 4))
  assert.equal(cache.stats().pages, 1)
  assert.equal(cache.stats().estimatedBytes, 328)
  const oversized = createQueryPageCache({ maxBytes: 10 })
  oversized.put(0, result(0, 10))
  assert.equal(oversized.stats().rows, 0)
  assert.equal(oversized.read(0, 10), undefined)
  assert.throws(
    () => createQueryPageCache({ maxBytes: -1 }),
    /Invalid query cache/,
  )
  assert.throws(
    () => createQueryPageCache({ pageSize: 1001 }),
    /Invalid query cache/,
  )
  assert.throws(
    () =>
      createQueryPageCache({ estimateRowBytes: () => NaN }).put(
        0,
        result(0, 1),
      ),
    /Invalid estimated row/,
  )
})

test('Partial preview pages remain misses until complete and the last page can be short', () => {
  const cache = createQueryPageCache({ pageSize: 3 })
  cache.put(0, result(0, 4))
  assert.equal(cache.read(0, 4).rows.length, 4)
  assert.equal(cache.read(3, 3), undefined)
  cache.put(3, { ...result(3, 2), totalRows: 5 })
  assert.equal(cache.read(3, 3).rows.length, 2)
})

test('Fixed geometry calculates distant ranges without full-query metadata', () => {
  assert.deepEqual(fixedRowRange(0, 0, 600), {
    start: 0,
    end: 0,
    top: 0,
    bottom: 0,
  })
  const middle = fixedRowRange(1_000_000, 500_000 * 32, 600)
  assert.equal(middle.start, 499995)
  assert.ok(middle.end - middle.start < 30)
  assert.equal(
    middle.top + (middle.end - middle.start) * 32 + middle.bottom,
    32_000_000,
  )
  const last = fixedRowRange(100005, 100005 * 32 - 600, 600)
  assert.equal(last.end, 100005)
  assert.equal(last.bottom, 0)
})
