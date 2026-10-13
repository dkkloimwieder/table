import { getOwner, onSettled, untrack } from 'solid-js'

// Keep event ownership independent of a fixture or application model.
export const selectEventProps = [
  'onPointerDown',
  'onPointerUp',
  'onPointerMove',
  'onClick',
  'onKeyDown',
  'onMouseDown',
  'onFocus',
  'onBlur',
  'onFocusIn',
  'onFocusOut',
  'onInput',
  'onChange',
  'onTouchEnd',
] as const

export function ownedSelectEvents(source: object) {
  const props = source as Record<string, unknown>
  if (!getOwner())
    throw new Error('Create native listeners inside a Solid owner')
  const keys = untrack(() => selectEventProps.filter((key) => key in props))
  const handlers: Array<[string, EventListener]> = keys.map((key) => [
    key.slice(2).toLowerCase(),
    (event) =>
      untrack(() => {
        const handler = props[key]
        if (typeof handler === 'function') handler(event)
        else if (Array.isArray(handler)) handler[0](handler[1], event)
      }),
  ])
  let element: HTMLElement | undefined
  onSettled(() => {
    const node = element
    if (!node) return
    for (const [name, handler] of handlers) node.addEventListener(name, handler)
    return () => {
      for (const [name, handler] of handlers)
        node.removeEventListener(name, handler)
      element = undefined
    }
  })
  return (node: HTMLElement) => {
    element = node
  }
}
