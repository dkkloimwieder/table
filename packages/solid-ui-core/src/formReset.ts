import { createEventListener } from '@solid-primitives/event-listener'
import { onCleanup, untrack } from 'solid-js'
import type { Accessor } from 'solid-js'

// Native reset applies default checked values after dispatching its event.
export function createNativeFormResetListener(
  element: Accessor<HTMLElement | undefined>,
  handler: () => void,
) {
  const pending = new Set<ReturnType<typeof setTimeout>>()
  const form = () => {
    const node = element()
    if (!node) return undefined
    if (node.matches('input, select, textarea, button'))
      return (node as HTMLInputElement).form ?? undefined
    return node.closest<HTMLFormElement>('form') ?? undefined
  }
  createEventListener(form, 'reset', (event) => {
    const timer = setTimeout(() => {
      pending.delete(timer)
      untrack(() => {
        if (!event.defaultPrevented && element()?.isConnected) handler()
      })
    }, 0)
    pending.add(timer)
  })
  onCleanup(() => {
    for (const timer of pending) clearTimeout(timer)
    pending.clear()
  })
}
