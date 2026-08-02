/**
 * Local stand-in for `@tanstack/solid-virtual`'s `createVirtualizer`, built
 * directly on the framework-agnostic `@tanstack/virtual-core`. The wrapper
 * exists because solid-virtual currently supports Solid 1 only; swap the
 * import back once a Solid 2 release line exists.
 *
 * Reactivity model: virtual-core returns a brand-new array of brand-new
 * VirtualItem objects on every recompute. `<For>` keys by object reference, so
 * handing it that raw array disposes and reconstructs every visible row on
 * every scroll update — profiling a scroll charged ~624ms to `<For>`'s children
 * alone, plus ~711ms of style and layout as a consequence. The items therefore
 * go through a store and `reconcile` keyed on `index` (the same shape
 * @tanstack/solid-virtual uses), so rows that stay in the window keep their
 * identity and their DOM node and only entering/leaving rows are built.
 * `getTotalSize()` is not identity-sensitive and still rides the version signal.
 *
 * Solid 2 notes:
 * - `createStore`/`reconcile` now come from `solid-js` itself; the
 *   `solid-js/store` entrypoint no longer exists.
 * - `reconcile(value, key)` takes the key positionally and defaults it to
 *   `"id"`. VirtualItem has no `id`, so the key must be passed explicitly or it
 *   silently degrades to positional matching.
 * - Effects split into a tracked, pure compute half and an untracked effect
 *   half that may write, so options resolve in the compute half and the core is
 *   mutated in the effect half.
 * - Because items are now store proxies, any read of a VirtualItem outside a
 *   tracking scope (a `ref` callback, for instance) must be wrapped in
 *   `untrack` or Solid 2 logs STRICT_READ_UNTRACKED.
 */
import {
  createRenderEffect,
  createSignal,
  createStore,
  onSettled,
  reconcile,
} from 'solid-js'
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/virtual-core'
import type {
  PartialKeys,
  VirtualItem,
  VirtualizerOptions,
} from '@tanstack/virtual-core'

export function createVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element,
>(
  options: PartialKeys<
    VirtualizerOptions<TScrollElement, TItemElement>,
    'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
  >,
): Virtualizer<TScrollElement, TItemElement> {
  // ownedWrite: the initial run of the options render effect executes
  // synchronously inside the creating component's owned scope, and the effect
  // half bumps this signal — an intentional owned-scope write.
  const [version, setVersion] = createSignal(0, { ownedWrite: true })

  // Assigned once the store exists. The Virtualizer constructor can invoke
  // onChange before that line runs, so this must not sit in a temporal dead
  // zone — it is a no-op until the store is ready.
  let syncItems: () => void = () => {}

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
      syncItems()
      options.onChange?.(target, sync)
    },
  })

  const instance = new Virtualizer<TScrollElement, TItemElement>(
    resolveOptions(),
  )

  const [items, setItems] = createStore<Array<VirtualItem>>(
    instance.getVirtualItems(),
  )
  syncItems = () => {
    setItems(reconcile(instance.getVirtualItems(), 'index'))
  }

  // The examples pass live option getters (e.g. a `count` that grows as rows
  // load); spreading `options` inside the tracked compute half subscribes to
  // them, so the core re-receives fresh options whenever they change.
  createRenderEffect(
    () => resolveOptions(),
    (resolvedOptions) => {
      instance.setOptions(resolvedOptions)
      instance._willUpdate()
      setVersion((current) => current + 1)
      syncItems()
    },
  )

  onSettled(() => {
    const cleanup = instance._didMount()
    instance._willUpdate()
    syncItems()
    return cleanup
  })

  return new Proxy(instance, {
    get(target, property, receiver) {
      if (property === 'getVirtualItems') {
        return () => items
      }
      if (property === 'getTotalSize') {
        return () => {
          version()
          return target.getTotalSize()
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}
