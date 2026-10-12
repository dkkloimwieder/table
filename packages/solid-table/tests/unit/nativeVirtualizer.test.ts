import { expect, test, vi } from 'vitest'
import { OBSERVE, createRoot, createSignal, flush } from 'solid-js'
import { Virtualizer } from '../../bench/table/vendor/virtual-core/index'
import { createTableVirtualizer } from '../../bench/table/createVirtualizer'

test('keyed geometry follows same-count reorder and preserves measured sizes by logical key', () => {
  const capture = OBSERVE!.diagnostics.capture()
  const h = createRoot((dispose) => {
    const [keys, setKeys] = createSignal(['a', 'b', 'c'])
    const virtualizer = createTableVirtualizer({
      mode: 'measured',
      get keys() {
        return keys()
      },
      getScrollElement: () => null,
      estimateSize: () => 30,
      initialRect: { width: 200, height: 100 },
    })
    return { virtualizer, setKeys, dispose }
  })
  flush()
  h.virtualizer.instance.resizeItem(0, 60)
  flush()
  h.setKeys(['c', 'b', 'a'])
  flush()
  expect(h.virtualizer.instance.options.getItemKey(0)).toBe('c')
  expect(h.virtualizer.instance.itemSizeCache.get('a')).toBe(60)
  expect(h.virtualizer.getTotalSize()).toBe(120)
  h.setKeys(['c', 'b'])
  flush()
  expect(h.virtualizer.instance.itemSizeCache.has('a')).toBe(false)
  expect(h.virtualizer.getTotalSize()).toBe(60)
  h.dispose()
  expect(capture.stop()).toEqual([])
})

test('column layout revision clears stale height measurements without changing record keys', () => {
  const h = createRoot((dispose) => {
    const [version, setVersion] = createSignal(0)
    const virtualizer = createTableVirtualizer({
      mode: 'measured',
      keys: ['a', 'b'],
      getScrollElement: () => null,
      estimateSize: () => 30,
      get measurementVersion() {
        return version()
      },
    })
    return { virtualizer, setVersion, dispose }
  })
  flush()
  h.virtualizer.instance.resizeItem(0, 70)
  flush()
  expect(h.virtualizer.getTotalSize()).toBe(100)
  h.setVersion(1)
  flush()
  expect(h.virtualizer.getTotalSize()).toBe(60)
  h.dispose()
})

test('disposal before settlement attaches no DOM observers', () => {
  const element = document.createElement('div')
  const add = vi.spyOn(element, 'addEventListener')
  const dispose = createRoot((dispose) => {
    createTableVirtualizer({
      mode: 'measured',
      keys: ['a'],
      getScrollElement: () => element,
      estimateSize: () => 30,
    })
    return dispose
  })
  dispose()
  flush()
  expect(add).not.toHaveBeenCalled()
})

test('both row modes use the same vendored engine and fixed windows ignore page metadata', () => {
  const getItemKey = vi.fn((index: number) => index)
  const h = createRoot((dispose) => {
    const [page, setPage] = createSignal({ count: 1_000_000, offset: 0 })
    const fixed = createTableVirtualizer({
      mode: 'fixed',
      get count() {
        return page().count
      },
      rowHeight: 32,
      getItemKey,
      getScrollElement: () => null,
      initialRect: { width: 200, height: 600 },
    })
    const measured = createTableVirtualizer({
      mode: 'measured',
      keys: ['a', 'b'],
      estimateSize: () => 30,
      getScrollElement: () => null,
      initialRect: { width: 200, height: 600 },
    })
    return { fixed, measured, setPage, dispose }
  })
  flush()
  expect(h.fixed.instance).toBeInstanceOf(Virtualizer)
  expect(h.measured.instance).toBeInstanceOf(Virtualizer)
  expect(h.fixed.getTotalSize()).toBe(32_000_000)
  expect(h.fixed.getKeys().length).toBeLessThan(30)
  expect(getItemKey.mock.calls.length).toBeLessThan(100)
  expect(h.fixed.instance.itemSizeCache.size).toBe(0)
  expect(Object.keys(h.fixed.instance.measurementsCache)).toEqual([])
  const keys = h.fixed.getKeys()
  const calls = getItemKey.mock.calls.length
  h.setPage({ count: 1_000_000, offset: 500_000 })
  flush()
  expect(h.fixed.getKeys()).toBe(keys)
  expect(getItemKey.mock.calls.length).toBe(calls)
  h.measured.instance.resizeItem(0, 60)
  flush()
  expect(h.measured.getTotalSize()).toBe(90)
  h.dispose()
})

test('fixed geometry supports distant ranges, header offsets, overscan, and count changes', () => {
  const key = vi.fn((index: number) => index)
  const estimate = vi.fn(() => {
    throw new Error('Fixed rows must not be estimated individually')
  })
  const options = {
    count: 1_000_000,
    fixedItemSize: 40,
    getItemKey: key,
    estimateSize: estimate,
    initialOffset: 500_000 * 40 + 100,
    scrollMargin: 100,
    initialRect: { width: 200, height: 120 },
    overscan: 2,
    getScrollElement: () => null,
    observeElementRect: () => {},
    observeElementOffset: () => {},
    scrollToFn: () => {},
  }
  const instance = new Virtualizer<HTMLElement, HTMLElement>(options)
  const items = instance.getVirtualItems()
  expect(items[0]!.index).toBe(499998)
  expect(items.some((item) => item.index === 500000)).toBe(true)
  expect(items.length).toBeLessThan(10)
  expect(items[0]!.start).toBe(499998 * 40 + 100)
  expect(instance.getTotalSize()).toBe(40_000_000)
  expect(instance.getVirtualItemForOffset(750000 * 40 + 100)?.index).toBe(
    750000,
  )
  expect(key.mock.calls.length).toBeLessThan(100)
  expect(estimate).not.toHaveBeenCalled()
  instance.resizeItem(500000, 999)
  const element = document.createElement('div')
  element.dataset.index = '500000'
  instance.measureElement(element)
  expect(instance.elementsCache.size).toBe(0)
  expect(instance.itemSizeCache.size).toBe(0)
  expect(instance.getTotalSize()).toBe(40_000_000)
  instance.setOptions({ ...options, count: 2, initialOffset: 0 })
  expect(instance.getTotalSize()).toBe(80)
  expect(instance.measurementsCache[1]!.end).toBe(180)
  instance.setOptions({ ...options, count: 0 })
  expect(instance.getTotalSize()).toBe(0)
  expect(instance.getVirtualItems()).toEqual([])
  for (const fixedItemSize of [0, -1, NaN, Infinity]) {
    expect(() => instance.setOptions({ ...options, fixedItemSize })).toThrow(
      'Fixed item size',
    )
  }
  expect(() => instance.setOptions({ ...options, lanes: 2 })).toThrow(
    'one lane',
  )
})
