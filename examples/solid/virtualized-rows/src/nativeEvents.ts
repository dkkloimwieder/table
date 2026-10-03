import { getOwner, onSettled } from 'solid-js'

type Handlers<T extends HTMLElement> = {
  [K in keyof HTMLElementEventMap]?: (
    event: HTMLElementEventMap[K] & { currentTarget: T },
  ) => void
}

/** rc.13 workaround: release handlers even if a browser event retains the node. */
export function nativeEvents<T extends HTMLElement>(handlers: Handlers<T>) {
  if (!getOwner())
    throw new Error('Create native listeners inside a Solid owner')
  let element: T | undefined
  onSettled(() => {
    const node = element
    if (!node) return
    const entries = Object.entries(handlers) as Array<[string, EventListener]>
    for (const [name, handler] of entries) node.addEventListener(name, handler)
    return () => {
      for (const [name, handler] of entries)
        node.removeEventListener(name, handler)
      element = undefined
    }
  })
  return (node: T) => {
    element = node
  }
}
