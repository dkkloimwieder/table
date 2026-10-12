import {
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  onSettled,
  untrack,
} from 'solid-js'
import {
  Virtualizer,
  elementScroll,
  observeElementOffset,
  observeElementRect,
} from './vendor/virtual-core/index'
import type { VirtualWindow } from './virtualWindow'
import type { VirtualItem } from './vendor/virtual-core/index'

type CommonOptions = {
  getScrollElement: () => HTMLElement | null
  overscan?: number
  scrollMargin?: number
  scrollPaddingEnd?: number
  initialRect?: { width: number; height: number }
  observeElements?: () => ReadonlyArray<Element>
}

export type TableVirtualizerOptions<Key extends string | number> =
  CommonOptions &
    (
      | {
          mode: 'measured'
          readonly keys: ReadonlyArray<Key>
          estimateSize: (key: Key, index: number) => number
          measurementVersion?: unknown
        }
      | {
          mode: 'fixed'
          readonly count: number
          rowHeight: number
          getItemKey: (index: number) => Key
          getIndexForKey?: (key: Key) => number | undefined
        }
    )

/** One Solid binding to the vendored engine. Data stays with the caller. */
export function createTableVirtualizer<Key extends string | number>(
  options: TableVirtualizerOptions<Key>,
) {
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
  const count = createMemo(() =>
    options.mode === 'fixed' ? options.count : options.keys.length,
  )
  const keys = createMemo(() =>
    options.mode === 'measured' ? options.keys : undefined,
  )
  const [layoutRevision, setLayoutRevision] = createSignal(0, {
    ownedWrite: true,
  })
  const configuration = createMemo(() => {
    layoutRevision()
    const sequence = keys()
    const fixedSize = options.mode === 'fixed' ? options.rowHeight : undefined
    const estimateSize =
      options.mode === 'measured' ? options.estimateSize : undefined
    return {
      keys: sequence,
      version:
        options.mode === 'measured' ? options.measurementVersion : undefined,
      count: count(),
      getItemKey:
        options.mode === 'fixed'
          ? options.getItemKey
          : (index: number) => sequence![index]!,
      estimateSize: (index: number) =>
        fixedSize ?? estimateSize!(sequence![index]!, index),
      fixedItemSize: fixedSize,
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
  let pendingAnchor: { key: Key; within: number; offset: number } | undefined
  let anchorFrame: number | undefined
  function restoreAnchor() {
    anchorFrame = undefined
    const anchor = pendingAnchor
    pendingAnchor = undefined
    if (!anchor || disposed) return
    const next = untrack(configuration)
    const index = next.keys?.indexOf(anchor.key) ?? -1
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
    if (changed && next.keys) {
      const current = new Set(next.keys)
      for (const key of instance.itemSizeCache.keys())
        if (!current.has(key as Key)) instance.itemSizeCache.delete(key)
    }
    if (mounted) {
      instance._willUpdate()
      if (anchor && !pendingAnchor) {
        pendingAnchor = {
          key: anchor.key as Key,
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
    const elements = options.observeElements?.() ?? []
    const observer = elements.length
      ? new ResizeObserver(() => setLayoutRevision((value) => value + 1))
      : undefined
    for (const element of elements) observer!.observe(element)
    return () => {
      observer?.disconnect()
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
  const visibleKeys = createMemo(() => items().map((item) => item.key as Key), {
    equals: (a, b) =>
      a.length === b.length && a.every((key, index) => key === b[index]),
  })
  const lookup = createMemo(
    () => new Map(items().map((item) => [item.key as Key, item])),
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
    mode: options.mode,
    getEnd: () =>
      (items().at(-1)?.end ?? options.scrollMargin ?? 0) -
      (options.scrollMargin ?? 0),
    getKeys: visibleKeys,
    getItems: items,
    getItem: (key: Key) => lookup().get(key),
    getTotalSize: () => window().total,
    getStart: () =>
      (items()[0]?.start ?? options.scrollMargin ?? 0) -
      (options.scrollMargin ?? 0),
    /** Call in the visible row owner. Set data-index before measuring. */
    observeRow: (element: () => HTMLElement | undefined, key: Key) => {
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
    scrollToKey: (key: Key) => {
      const index =
        options.mode === 'measured'
          ? options.keys.indexOf(key)
          : (options.getIndexForKey?.(key) ?? lookup().get(key)?.index ?? -1)
      if (index >= 0) instance.scrollToIndex(index, { align: 'auto' })
      return index >= 0
    },
    scrollToIndex: (index: number) =>
      instance.scrollToIndex(index, { align: 'start' }),
    /** Exposed for geometry diagnostics, never used to store Table records. */
    instance,
  } satisfies VirtualWindow<Key> & {
    getItems: () => Array<VirtualItem>
    getItem: (key: Key) => VirtualItem | undefined
    observeRow: (element: () => HTMLElement | undefined, key: Key) => void
    scrollToKey: (key: Key) => boolean
    instance: Virtualizer<HTMLElement, HTMLElement>
  }
}
