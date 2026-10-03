import { expect, test, vi } from 'vitest'
import { OBSERVE, createRoot, createSignal, flush } from 'solid-js'
import { createKeyedVirtualizer } from '../../../../examples/solid/_shared/createKeyedVirtualizer'

test('keyed geometry follows same-count reorder and preserves measured sizes by logical key', () => {
  const capture = OBSERVE!.diagnostics.capture()
  const h = createRoot((dispose) => {
    const [keys, setKeys] = createSignal(['a', 'b', 'c'])
    const virtualizer = createKeyedVirtualizer({
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
    const virtualizer = createKeyedVirtualizer({
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
    createKeyedVirtualizer({
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
