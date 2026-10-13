import { createControllableBooleanSignal } from '@solid-primitives/controlled-signal'
import { createEffect, onCleanup, untrack } from 'solid-js'
import type { Accessor } from 'solid-js'

export type ToastDismissReason = 'timeout' | 'close' | 'escape'
export type ToastOptions = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onDismiss?: (reason: ToastDismissReason) => void
  duration?: number
  persistent?: boolean
  onCloseAutoFocus?: (event: Event) => void
}

export function createToastState(
  props: ToastOptions,
  element: Accessor<HTMLElement | undefined>,
) {
  const [open, setOpen] = createControllableBooleanSignal({
    value: () => props.open,
    defaultValue: () => props.defaultOpen ?? true,
    onChange: (value) => props.onOpenChange?.(value),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  let remaining = 0
  let started = 0
  let expired = false
  let disposed = false
  let wasOpen = false
  let origin: HTMLElement | undefined
  const paused = new Set<'pointer' | 'focus' | 'page'>()
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
  }
  const dismiss = (reason: ToastDismissReason) => {
    if (disposed || !open()) return
    clear()
    expired = true
    props.onDismiss?.(reason)
    setOpen(false)
  }
  const start = () => {
    clear()
    if (
      disposed ||
      !open() ||
      props.persistent ||
      remaining <= 0 ||
      paused.size ||
      expired
    )
      return
    started = performance.now()
    timer = setTimeout(() => untrack(() => dismiss('timeout')), remaining)
  }
  const pause = (reason: 'pointer' | 'focus' | 'page') => {
    if (paused.has(reason)) return
    if (timer !== undefined)
      remaining = Math.max(0, remaining - (performance.now() - started))
    clear()
    paused.add(reason)
  }
  const resume = (reason: 'pointer' | 'focus' | 'page') => {
    paused.delete(reason)
    if (
      remaining <= 0 &&
      !expired &&
      open() &&
      !props.persistent &&
      !paused.size
    )
      dismiss('timeout')
    else start()
  }
  const restoreFocus = () => {
    if (!paused.has('focus')) return
    const event = new Event('toast.closeAutoFocus', { cancelable: true })
    props.onCloseAutoFocus?.(event)
    if (!event.defaultPrevented && origin?.isConnected)
      origin.focus({ preventScroll: true })
  }
  createEffect(
    () => ({
      open: open(),
      duration: props.duration ?? 5000,
      persistent: props.persistent,
    }),
    (state) =>
      untrack(() => {
        clear()
        if (state.open) {
          if (!wasOpen && typeof document !== 'undefined')
            origin =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : undefined
          remaining = Number.isFinite(state.duration)
            ? Math.min(2_147_483_647, Math.max(0, state.duration))
            : 0
          expired = remaining === 0
          start()
        } else {
          if (wasOpen) restoreFocus()
          paused.clear()
          origin = undefined
        }
        wasOpen = state.open
      }),
  )
  createEffect(
    () => ({ node: element(), open: open() }),
    ({ node, open: isOpen }) => {
      if (!node || !isOpen) return
      const doc = node.ownerDocument
      const win = doc.defaultView
      const sync = () =>
        untrack(() => {
          if (doc.hidden) pause('page')
          else resume('page')
        })
      const blur = () => untrack(() => pause('page'))
      const focus = () =>
        untrack(() => {
          if (!doc.hidden) resume('page')
        })
      doc.addEventListener('visibilitychange', sync)
      win?.addEventListener('blur', blur)
      win?.addEventListener('focus', focus)
      if (doc.hidden) untrack(() => pause('page'))
      return () => {
        doc.removeEventListener('visibilitychange', sync)
        win?.removeEventListener('blur', blur)
        win?.removeEventListener('focus', focus)
      }
    },
  )
  onCleanup(() => {
    disposed = true
    clear()
    untrack(restoreFocus)
    paused.clear()
    origin = undefined
  })
  return { open, dismiss, pause, resume }
}
