import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/virtual-core'
import { createEffect, createSignal, onSettled, untrack } from 'solid-js'
import type { PartialKeys, VirtualizerOptions } from '@tanstack/virtual-core'

export * from '@tanstack/virtual-core'

export function createVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  options: PartialKeys<
    VirtualizerOptions<TScrollElement, TItemElement>,
    'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
  >,
): Virtualizer<TScrollElement, TItemElement> {
  const [items, setItems] = createSignal<
    Array<import('@tanstack/virtual-core').VirtualItem>
  >([], { ownedWrite: true })
  const [size, setSize] = createSignal(0, { ownedWrite: true })
  const publish = () => {
    setItems(instance.getVirtualItems())
    setSize(instance.getTotalSize())
  }
  const resolveOptions = () => ({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options,
    onChange: (
      virtualizer: Virtualizer<TScrollElement, TItemElement>,
      sync: boolean,
    ) => {
      publish()
      options.onChange?.(virtualizer, sync)
    },
  })
  const instance = new Virtualizer<TScrollElement, TItemElement>(
    untrack(resolveOptions),
  )
  createEffect(resolveOptions, (nextOptions) => {
    instance.setOptions(nextOptions)
    instance._willUpdate()
    publish()
  })
  onSettled(() => {
    const cleanup = instance._didMount()
    instance._willUpdate()
    publish()
    return cleanup
  })
  return new Proxy(instance, {
    get(target, key, receiver) {
      if (key === 'getVirtualItems') return items
      if (key === 'getTotalSize') return size
      return Reflect.get(target, key, receiver)
    },
  })
}
