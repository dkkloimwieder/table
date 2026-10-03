import { expect, test, vi } from 'vitest'
import { OBSERVE, createRoot, flush } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

test('native listener cleanup belongs to its component even when the ref runs without an owner', () => {
  const capture = OBSERVE!.diagnostics.capture()
  const clicked = vi.fn()
  const button = document.createElement('button')
  const h = createRoot((dispose) => ({
    ref: nativeEvents<HTMLButtonElement>({ click: clicked }),
    dispose,
  }))
  h.ref(button)
  flush()
  button.click()
  expect(clicked).toHaveBeenCalledTimes(1)
  h.dispose()
  button.click()
  expect(clicked).toHaveBeenCalledTimes(1)
  expect(capture.stop()).toEqual([])
})

test('disposal before settlement adds no native listeners', () => {
  const button = document.createElement('button')
  const add = vi.spyOn(button, 'addEventListener')
  const h = createRoot((dispose) => ({
    ref: nativeEvents<HTMLButtonElement>({ click: vi.fn() }),
    dispose,
  }))
  h.ref(button)
  h.dispose()
  flush()
  expect(add).not.toHaveBeenCalled()
})

test('native listener setup rejects an unowned lifetime', () => {
  expect(() => nativeEvents({ click: vi.fn() })).toThrow('inside a Solid owner')
})
