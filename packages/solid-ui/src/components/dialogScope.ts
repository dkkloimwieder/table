import { createContext, onCleanup, useContext } from 'solid-js'

export function createDialogScope() {
  let trigger: HTMLElement | undefined
  let content: HTMLElement | undefined
  let cancel: HTMLElement | undefined
  let origin =
    typeof document === 'undefined'
      ? undefined
      : (document.activeElement as HTMLElement | null)
  onCleanup(() => {
    trigger = content = cancel = undefined
    origin = undefined
  })
  return {
    setTrigger: (node: HTMLElement) => {
      trigger = node
    },
    setContent: (node: HTMLElement) => {
      content = node
    },
    setCancel: (node: HTMLElement) => {
      cancel = node
    },
    initialAlertFocus: (event: Event) => {
      if (event.defaultPrevented) return
      event.preventDefault()
      ;(cancel ?? content)?.focus({ preventScroll: true })
    },
    mount: () => {
      const anchor = trigger ?? origin
      const scope = anchor?.closest<HTMLElement>('[data-ui]')
      return (
        anchor?.closest<HTMLElement>('[data-ui-portal-root]') ??
        scope?.parentElement?.closest<HTMLElement>('[data-ui]') ??
        scope ??
        undefined
      )
    },
  }
}
export const DialogScope = createContext<ReturnType<
  typeof createDialogScope
> | null>(null)
export function useDialogScope() {
  const scope = useContext(DialogScope)
  if (!scope) throw new Error('Use dialog parts inside Dialog.Root')
  return scope
}
