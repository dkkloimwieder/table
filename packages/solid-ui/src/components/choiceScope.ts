import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js'
import { getFocusableTreeWalker } from '@solid-primitives/focus'
import type { ComboboxTriggerMode } from '@table/ui-core/combobox'

export function createChoiceScope(props: {
  open?: boolean
  defaultOpen?: boolean
  disabled?: boolean
  onOpenChange?: (open: boolean, mode?: ComboboxTriggerMode) => void
}) {
  const [localOpen, setLocalOpen] = createSignal(
    untrack(() => props.defaultOpen ?? false),
  )
  let control: HTMLElement | undefined
  let content: HTMLElement | undefined
  let disposed = false
  let restoreFocus = true
  onCleanup(() => {
    disposed = true
  })
  function changeOpen(value: boolean, mode?: ComboboxTriggerMode) {
    if (value) restoreFocus = true
    setLocalOpen(value)
    untrack(() => props.onOpenChange?.(value, mode))
  }
  createEffect(
    () => Boolean(props.disabled),
    (disabled) => {
      if (disabled && untrack(() => props.open ?? localOpen()))
        changeOpen(false)
    },
  )
  return {
    open: () => !props.disabled && (props.open ?? localOpen()),
    changeOpen,
    setControl: (node: HTMLElement) => {
      control = node
    },
    setContent: (node: HTMLElement) => {
      content = node
    },
    mount: () => {
      const scope = control?.closest<HTMLElement>('[data-ui]')
      return (
        control?.closest<HTMLElement>('[data-ui-portal-root]') ??
        scope?.parentElement?.closest<HTMLElement>('[data-ui]') ??
        scope ??
        undefined
      )
    },
    outside: () => {
      restoreFocus = false
    },
    enterContent: (event: KeyboardEvent) => {
      if (
        event.key !== 'Tab' ||
        event.shiftKey ||
        event.defaultPrevented ||
        !content
      )
        return
      const target = getFocusableTreeWalker(content, {
        tabbable: true,
      }).nextNode() as HTMLElement | null
      if (target) {
        event.preventDefault()
        target.focus({ preventScroll: true })
      }
    },
    tab: (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented || !control || !content)
        return
      const active = control.ownerDocument.activeElement
      const inside = getFocusableTreeWalker(content, { tabbable: true })
      if (active && content.contains(active)) inside.currentNode = active
      if (event.shiftKey ? inside.previousNode() : inside.nextNode()) return
      const outside = getFocusableTreeWalker(control.ownerDocument.body, {
        tabbable: true,
        accept: (node) => !content?.contains(node),
      })
      outside.currentNode = control
      const next = (
        event.shiftKey && active?.closest('.choice-footer')
          ? control
          : event.shiftKey
            ? outside.previousNode()
            : outside.nextNode()
      ) as HTMLElement | null
      restoreFocus = false
      changeOpen(false)
      if (next) {
        event.preventDefault()
        queueMicrotask(() => {
          if (disposed || !next.isConnected || next.matches(':disabled')) return
          const doc = next.ownerDocument
          if (
            doc.activeElement === doc.body ||
            doc.activeElement === control ||
            (doc.activeElement && content?.contains(doc.activeElement))
          )
            next.focus({ preventScroll: true })
        })
      } else control.focus({ preventScroll: true })
    },
    closeAutoFocus: (event: Event) => {
      if (event.defaultPrevented) return
      event.preventDefault()
      untrack(() => {
        if (
          disposed ||
          props.disabled ||
          !restoreFocus ||
          !control?.isConnected ||
          control.hasAttribute('disabled') ||
          control.getAttribute('aria-disabled') === 'true'
        )
          return
        const doc = control.ownerDocument
        if (
          doc.activeElement === doc.body ||
          (doc.activeElement && content?.contains(doc.activeElement))
        )
          control.focus({ preventScroll: true })
      })
    },
  }
}
export const ChoiceScope = createContext<
  ReturnType<typeof createChoiceScope> | undefined
>(undefined)
export function useChoiceScope() {
  const value = useContext(ChoiceScope)
  if (!value)
    throw new Error('Use choice parts inside their Select or Combobox root')
  return value
}
