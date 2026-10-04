import { untrack } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

// Only the DOM events used by this fixed-choice Select fixture. Custom
// component props continue through Kobalte's Polymorphic unchanged.
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
] as const

export function ownedSelectEvents(props: Record<string, unknown>) {
  const keys = untrack(() => selectEventProps.filter((key) => key in props))
  const handlers = Object.fromEntries(
    keys.map((key) => [
      key.slice(2).toLowerCase(),
      (event: Event) =>
        // focus() can dispatch while an effect runs. Read the current event
        // callback once, without subscribing that effect to event state.
        untrack(() => {
          const handler = props[key]
          if (typeof handler === 'function') handler(event)
          else if (Array.isArray(handler)) handler[0](handler[1], event)
        }),
    ]),
  )
  return nativeEvents(handlers)
}
