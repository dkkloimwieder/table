import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from '@tanstack/virtual-core'
import {
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  onSettled,
  untrack,
} from 'solid-js'
import type { VirtualItem } from '@tanstack/virtual-core'

export interface KeyedVirtualizerOptions {
  readonly keys: ReadonlyArray<string>
  getScrollElement: () => HTMLElement | null
  estimateSize: (key: string, index: number) => number
  overscan?: number
  scrollMargin?: number
  scrollPaddingEnd?: number
  /** Change when column layout makes prior heights obsolete. */
  measurementVersion?: unknown
  initialRect?: { width: number; height: number }
}

/** Geometry only. Record ownership and displayed membership stay with Table. */
export function createKeyedVirtualizer(options: KeyedVirtualizerOptions) {
  if (!getOwner())
    throw new Error('Create the virtualizer inside a Solid owner')
  // Audited ownedWrite: virtual-core can synchronously publish geometry from
  // a measured element or a lifecycle callback. This signal owns only its
  // output, never records, Table state, or the input key sequence.
  const [window, setWindow] = createSignal<{
    items: Array<VirtualItem>
    total: number
  }>({ items: [], total: 0 }, { ownedWrite: true })
  let mounted = false
  let disposed = false
  let cleanupQueued = false
  const publish = () => {
    if (!disposed)
      setWindow({
        items: instance.getVirtualItems(),
        total: instance.getTotalSize(),
      })
  }
  const configuration = createMemo(() => {
    const keys = options.keys
    const estimateSize = options.estimateSize
    return {
      keys,
      version: options.measurementVersion,
      count: keys.length,
      // A new function when the sequence changes invalidates core geometry
      // for same-count reorder, while stable keys retain applicable sizes.
      getItemKey: (index: number) => keys[index]!,
      estimateSize: (index: number) => estimateSize(keys[index]!, index),
      getScrollElement: options.getScrollElement,
      overscan: options.overscan ?? 5,
      scrollMargin: options.scrollMargin ?? 0,
      scrollPaddingStart: options.scrollMargin ?? 0,
      scrollPaddingEnd: options.scrollPaddingEnd ?? 0,
      initialRect: options.initialRect,
      observeElementRect,
      observeElementOffset,
      scrollToFn: elementScroll,
      onChange: publish,
    }
  })
  const instance = new Virtualizer<HTMLElement, HTMLElement>(
    untrack(configuration),
  )
  // Keep the first unobscured row in place when a measured row above it
  // changes height. Include sticky sections and ignore prior scroll direction.
  instance.shouldAdjustScrollPositionOnItemSizeChange = (
    item,
    _delta,
    current,
  ) =>
    item.end <=
    (current.scrollOffset ?? 0) +
      current.scrollAdjustments +
      current.options.scrollMargin
  let previous = untrack(configuration)
  let pendingAnchor: { key: string; within: number; offset: number } | undefined
  let anchorFrame: number | undefined
  function restoreAnchor() {
    anchorFrame = undefined
    const anchor = pendingAnchor
    pendingAnchor = undefined
    if (!anchor || disposed) return
    const next = untrack(configuration)
    const index = next.keys.indexOf(anchor.key)
    if (index >= 0) {
      const offset = instance.getOffsetForIndex(index, 'start')?.[0]
      if (offset !== undefined)
        instance.scrollToOffset(Math.max(0, offset + anchor.within))
    } else {
      const maximum = Math.max(
        0,
        (instance.scrollElement?.scrollHeight ?? 0) -
          (instance.scrollRect?.height ?? 0),
      )
      instance.scrollToOffset(Math.min(anchor.offset, maximum))
    }
  }
  createEffect(configuration, (next) => {
    const changed = next.keys !== previous.keys
    const visibleStart = (instance.scrollOffset ?? 0) + previous.scrollMargin
    const anchor =
      changed ||
      next.version !== previous.version ||
      next.scrollMargin !== previous.scrollMargin
        ? instance.getVirtualItems().find((item) => item.end > visibleStart)
        : undefined
    const offsetWithin = anchor ? visibleStart - anchor.start : 0
    instance.setOptions(next)
    if (next.version !== previous.version) instance.measure()
    if (changed) {
      const current = new Set(next.keys)
      for (const key of instance.itemSizeCache.keys())
        if (!current.has(String(key))) instance.itemSizeCache.delete(key)
    }
    if (mounted) {
      instance._willUpdate()
      if (anchor && !pendingAnchor) {
        pendingAnchor = {
          key: String(anchor.key),
          within: offsetWithin,
          offset: instance.scrollOffset ?? 0,
        }
        // Restore after Solid commits the new spacer and ResizeObserver has
        // measured the layout. Otherwise the browser clamps to the old extent.
        anchorFrame = requestAnimationFrame(restoreAnchor)
      }
    }
    previous = next
    publish()
  })
  onSettled(() => {
    if (disposed) return
    mounted = true
    const cleanup = instance._didMount()
    instance._willUpdate()
    publish()
    return () => {
      disposed = true
      mounted = false
      cleanup()
      if (anchorFrame !== undefined) cancelAnimationFrame(anchorFrame)
      pendingAnchor = undefined
      instance.elementsCache.clear()
      instance.itemSizeCache.clear()
    }
  })
  const items = createMemo(() => window().items)
  const visibleKeys = createMemo(
    () => items().map((item) => String(item.key)),
    {
      equals: (a, b) =>
        a.length === b.length && a.every((key, index) => key === b[index]),
    },
  )
  const lookup = createMemo(
    () => new Map(items().map((item) => [String(item.key), item])),
  )
  function releaseElement() {
    if (cleanupQueued || disposed) return
    cleanupQueued = true
    queueMicrotask(() => {
      cleanupQueued = false
      if (!disposed) instance.measureElement(null)
    })
  }
  return {
    getKeys: visibleKeys,
    getItems: items,
    getItem: (key: string) => lookup().get(key),
    getTotalSize: () => window().total,
    getStart: () =>
      (items()[0]?.start ?? options.scrollMargin ?? 0) -
      (options.scrollMargin ?? 0),
    /** Call in the visible row owner. Set data-index before measuring. */
    observeRow: (element: () => HTMLElement | undefined, key: string) => {
      createEffect(
        () => lookup().get(key)?.index,
        (index) => {
          const node = element()
          if (node && index !== undefined) {
            node.dataset.index = String(index)
            instance.measureElement(node)
          }
        },
      )
      onSettled(() => releaseElement)
    },
    scrollToKey: (key: string) => {
      const index = options.keys.indexOf(key)
      if (index >= 0) instance.scrollToIndex(index, { align: 'auto' })
      return index >= 0
    },
    scrollToIndex: (index: number) =>
      instance.scrollToIndex(index, { align: 'start' }),
    /** Exposed for geometry diagnostics, never used to store Table records. */
    instance,
  }
}
