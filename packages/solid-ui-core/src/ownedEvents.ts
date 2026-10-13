import { getOwner, onSettled, untrack } from 'solid-js'
import type { JSX } from '@solidjs/web'

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

export const nativeEventProps = [
  ...selectEventProps,
  'onKeyUp',
  'onKeyPress',
  'onCompositionStart',
  'onCompositionUpdate',
  'onCompositionEnd',
  'onPaste',
  'onCopy',
  'onCut',
  'onDblClick',
  'onMouseUp',
  'onMouseEnter',
  'onMouseLeave',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerCancel',
  'onWheel',
  'onInvalid',
  'onBeforeInput',
  'onSelect',
  'onMouseMove',
  'onMouseOver',
  'onMouseOut',
  'onPointerOver',
  'onPointerOut',
  'onGotPointerCapture',
  'onLostPointerCapture',
  'onTouchStart',
  'onTouchMove',
  'onTouchCancel',
  'onContextMenu',
  'onAuxClick',
  'onDragStart',
  'onDragEnd',
  'onDragEnter',
  'onDragLeave',
  'onDragOver',
  'onDrop',
  'onScroll',
  'onScrollEnd',
  'onSubmit',
  'onReset',
] as const

export function ownedSelectEvents(source: object) {
  return ownedEvents(source, selectEventProps)
}

export function ownedElementEvents(source: object) {
  return ownedEvents(source, nativeEventProps)
}

function ownedEvents(source: object, eventProps: ReadonlyArray<string>) {
  const props = source as Record<string, unknown>
  if (!getOwner())
    throw new Error('Create native listeners inside a Solid owner')
  const keys = untrack(() => eventProps.filter((key) => key in props))
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

/** Call a JSX.EventHandlerUnion with the event. */
export function callHandler<T, E extends Event>(
  event: E & { currentTarget: T; target: Element },
  handler: JSX.EventHandlerUnion<T, E> | undefined,
) {
  if (handler) {
    if (typeof handler === 'function') {
      handler(event)
    } else {
      handler[0](handler[1], event)
    }
  }

  return event?.defaultPrevented
}
