/**
 * Local stand-in for `@tanstack/solid-virtual`'s `createVirtualizer`, built
 * directly on the framework-agnostic `@tanstack/virtual-core`. The wrapper
 * exists because solid-virtual currently supports Solid 1 only; swap the
 * import back once a Solid 2 release line exists.
 *
 * Reactivity model: one version signal is bumped by the core's onChange
 * callback (and whenever reactive options re-resolve), and the two
 * render-time reads — getVirtualItems() and getTotalSize() — subscribe to
 * it. Unlike solid-virtual there is no store/reconcile layer, so each change
 * hands fresh VirtualItem objects to <For>, which recreates the visible
 * items' DOM. That is fine here: the cells are plain text and the core's
 * measureElement is idempotent.
 */
import { createRenderEffect, createSignal, onCleanup, onMount } from 'solid-js'
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/virtual-core'
import type { PartialKeys, VirtualizerOptions } from '@tanstack/virtual-core'

export function createVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  options: PartialKeys<
    VirtualizerOptions<TScrollElement, TItemElement>,
    'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
  >,
): Virtualizer<TScrollElement, TItemElement> {
  const [version, setVersion] = createSignal(0)

  const resolveOptions = (): VirtualizerOptions<
    TScrollElement,
    TItemElement
  > => ({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options,
    onChange: (target, sync) => {
      target._willUpdate()
      setVersion((current) => current + 1)
      options.onChange?.(target, sync)
    },
  })

  const instance = new Virtualizer<TScrollElement, TItemElement>(
    resolveOptions(),
  )

  // The examples pass live option getters (e.g. a `count` that grows as rows
  // load); spreading `options` inside this tracked scope subscribes to them,
  // so the core re-receives fresh options whenever they change.
  createRenderEffect(() => {
    instance.setOptions(resolveOptions())
    instance._willUpdate()
    setVersion((current) => current + 1)
  })

  onMount(() => {
    const cleanup = instance._didMount()
    instance._willUpdate()
    onCleanup(cleanup)
  })

  return new Proxy(instance, {
    get(target, property, receiver) {
      if (property === 'getVirtualItems' || property === 'getTotalSize') {
        return () => {
          version()
          return target[property]()
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}
