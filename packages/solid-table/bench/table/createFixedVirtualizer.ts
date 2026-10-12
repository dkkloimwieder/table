import { createMemo, createSignal, getOwner, onSettled } from 'solid-js'
import { fixedVirtualRange } from './fixedVirtualRange'
import type { VirtualWindow } from './virtualWindow'

export interface FixedVirtualizerOptions {
  readonly count: number
  readonly rowHeight: number
  getScrollElement: () => HTMLElement | null
  overscan?: number
  scrollMargin?: number
  observeElements?: () => ReadonlyArray<Element>
  initialHeight?: number
}

export function createFixedVirtualizer(
  options: FixedVirtualizerOptions,
): VirtualWindow<number> {
  if (!getOwner())
    throw new Error('Create the virtualizer inside a Solid owner')
  const count = createMemo(() => options.count)
  const [geometry, setGeometry] = createSignal(
    { offset: 0, height: options.initialHeight ?? 600, margin: 0 },
    { ownedWrite: true },
  )
  const range = createMemo(
    () => {
      const current = geometry()
      return fixedVirtualRange(
        count(),
        current.offset,
        current.height,
        options.rowHeight,
        current.margin,
        options.overscan,
      )
    },
    {
      equals: (a, b) =>
        a.start === b.start &&
        a.end === b.end &&
        a.top === b.top &&
        a.bottom === b.bottom,
    },
  )
  const keys = createMemo(() =>
    Array.from(
      { length: range().end - range().start },
      (_, index) => range().start + index,
    ),
  )
  onSettled(() => {
    const node = options.getScrollElement()
    if (!node) return
    const update = () =>
      setGeometry({
        offset: node.scrollTop,
        height: node.clientHeight,
        margin: options.scrollMargin ?? 0,
      })
    const observer = new ResizeObserver(update)
    observer.observe(node)
    for (const element of options.observeElements?.() ?? [])
      observer.observe(element)
    node.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', update)
    }
  })
  return {
    mode: 'fixed',
    getKeys: keys,
    getStart: () => range().top,
    getEnd: () => range().end * options.rowHeight,
    getTotalSize: () => count() * options.rowHeight,
    scrollToIndex: (index) => {
      const node = options.getScrollElement()
      if (node)
        node.scrollTop =
          Math.max(0, Math.min(index, count() - 1)) * options.rowHeight +
          (options.scrollMargin ?? 0)
    },
  }
}
