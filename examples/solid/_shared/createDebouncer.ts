import { Debouncer } from '@tanstack/pacer/debouncer'
import { onCleanup } from 'solid-js'
import type { DebouncerOptions } from '@tanstack/pacer/debouncer'
import type { AnyFunction } from '@tanstack/pacer/types'

export function createDebouncer<T extends AnyFunction>(
  callback: T,
  options: DebouncerOptions<T>,
) {
  const debouncer = new Debouncer(callback, options)
  onCleanup(() => debouncer.cancel())
  return debouncer
}
