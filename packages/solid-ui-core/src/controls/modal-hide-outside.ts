import { createHideOutside } from '@solid-primitives/interaction'
import { createEffect, createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'

/** Hide the background only after the focus primitive or caller enters the modal. */
export function createModalHideOutside(options: {
  element: Accessor<HTMLElement | undefined>
  enabled: Accessor<boolean>
  targets?: Accessor<Array<Element>>
}) {
  const [entered, setEntered] = createSignal(false, { ownedWrite: true })
  const targets = () =>
    options.targets?.() ?? (options.element() ? [options.element()!] : [])
  createEffect(
    () => ({
      element: options.element(),
      enabled: options.enabled(),
      targets: targets(),
    }),
    ({ element, enabled, targets }) => {
      setEntered(false)
      if (!element || !enabled) return
      const document = element.ownerDocument
      const capture = () => {
        if (targets.some((target) => target.contains(document.activeElement)))
          setEntered(true)
      }
      capture()
      document.addEventListener('focusin', capture, true)
      return () => document.removeEventListener('focusin', capture, true)
    },
  )
  createHideOutside({
    disabled: () => !options.enabled() || !entered() || !options.element(),
    targets,
    alwaysVisibleSelector: '[data-kb-top-layer], [data-live-announcer]',
  })
}
