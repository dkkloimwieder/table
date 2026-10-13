import {
  createFocusRestore,
  createFocusTrap,
  getFocusableTreeWalker,
} from '@solid-primitives/focus'
import { createHideOutside } from '@solid-primitives/interaction'

import { combineStyle } from '@solid-primitives/props'
import { createPreventScroll } from '@solid-primitives/scroll'
import {
  Show,
  createEffect,
  createSignal,
  merge,
  omit,
  untrack,
} from 'solid-js'
import { DismissableLayer } from '../dismissable-layer/index.ts'
import { Popper } from '../popper/index.tsx'
import { usePopoverContext } from './popover-context.tsx'
import type { PopoverDataSet } from './popover-context.tsx'
import type { Component, Ref } from 'solid-js'
import type { DismissableLayerRenderProps } from '../dismissable-layer/index.ts'
import type {
  FocusOutsideEvent,
  InteractOutsideEvent,
  PointerDownOutsideEvent,
} from '@solid-primitives/interaction'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { JSX, ValidComponent } from '@solidjs/web'

export interface PopoverContentOptions {
  /**
   * Event handler called when focus moves into the component after opening.
   * It can be prevented by calling `event.preventDefault`.
   */
  onOpenAutoFocus?: (event: Event) => void

  /**
   * Event handler called when focus moves to the trigger after closing.
   * It can be prevented by calling `event.preventDefault`.
   */
  onCloseAutoFocus?: (event: Event) => void

  /**
   * Event handler called when the escape key is down.
   * It can be prevented by calling `event.preventDefault`.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void

  /**
   * Event handler called when a pointer event occurs outside the bounds of the component.
   * It can be prevented by calling `event.preventDefault`.
   */
  onPointerDownOutside?: (event: PointerDownOutsideEvent) => void

  /**
   * Event handler called when the focus moves outside the bounds of the component.
   * It can be prevented by calling `event.preventDefault`.
   */
  onFocusOutside?: (event: FocusOutsideEvent) => void

  /**
   * Event handler called when an interaction (pointer or focus event) happens outside the bounds of the component.
   * It can be prevented by calling `event.preventDefault`.
   */
  onInteractOutside?: (event: InteractOutsideEvent) => void
}

export interface PopoverContentCommonProps<
  T extends HTMLElement = HTMLElement,
> {
  id: string
  ref: Ref<T>
  style?: JSX.CSSProperties | string
}

export interface PopoverContentRenderProps
  extends
    PopoverContentCommonProps,
    DismissableLayerRenderProps,
    PopoverDataSet {
  role: 'dialog'
  tabindex: -1
  'aria-labelledby': string | undefined
  'aria-describedby': string | undefined
}

export type PopoverContentProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = PopoverContentOptions & Partial<PopoverContentCommonProps<ElementOf<T>>>

/**
 * Contains the content to be rendered when the popover is open.
 */
export function PopoverContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, PopoverContentProps<T>>,
) {
  const [ref, setRef] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const context = usePopoverContext()

  const mergedProps = merge(
    {
      id: context.generateId('content'),
    },
    props as PopoverContentProps,
  )

  const others = omit(
    mergedProps,
    'ref',
    'style',
    'onOpenAutoFocus',
    'onCloseAutoFocus',
    'onPointerDownOutside',
    'onFocusOutside',
    'onInteractOutside',
  )

  let isRightClickOutside = false
  let hasInteractedOutside = false
  let hasPointerDownOutside = false

  const onCloseAutoFocus = (e: Event) => {
    mergedProps.onCloseAutoFocus?.(e)
    if (e.defaultPrevented) return

    if (context.isModal()) {
      e.preventDefault()

      if (!isRightClickOutside) {
        context.triggerRef()?.focus({ preventScroll: true })
      }
    } else {
      if (!e.defaultPrevented) {
        if (!hasInteractedOutside) {
          context.triggerRef()?.focus({ preventScroll: true })
        }

        // Always prevent autofocus because we either focus manually or want user agent focus
        e.preventDefault()
      }

      hasInteractedOutside = false
      hasPointerDownOutside = false
    }
  }

  const onPointerDownOutside = (e: PointerDownOutsideEvent) => {
    mergedProps.onPointerDownOutside?.(e)

    if (context.isModal()) {
      isRightClickOutside = e.detail.isContextMenu
    }
  }

  const onFocusOutside = (e: FocusOutsideEvent) => {
    mergedProps.onFocusOutside?.(e)

    // When focus is trapped, a `focusout` event may still happen.
    // We make sure we don't trigger our `onDismiss` in such case.
    if (context.isOpen() && context.isModal()) {
      e.preventDefault()
    }
  }

  const onInteractOutside = (e: InteractOutsideEvent) => {
    mergedProps.onInteractOutside?.(e)

    if (context.isModal()) {
      return
    }

    // Non-modal behavior below

    if (!e.defaultPrevented) {
      hasInteractedOutside = true

      if (e.detail.originalEvent.type === 'pointerdown') {
        hasPointerDownOutside = true
      }
    }

    // Prevent dismissing when clicking the trigger.
    // As the trigger is already setup to close, without doing so would
    // cause it to close and immediately open.
    if (context.triggerRef()?.contains(e.target as HTMLElement)) {
      e.preventDefault()
    }

    // On Safari if the trigger is inside a container with tabIndex={0}, when clicked
    // we will get the pointer down outside event on the trigger, but then a subsequent
    // focus outside event on the container, we ignore any focus outside event when we've
    // already had a pointer down outside event.
    if (e.detail.originalEvent.type === 'focusin' && hasPointerDownOutside) {
      e.preventDefault()
    }
  }

  // aria-hide everything except the content (better supported equivalent to setting aria-modal)
  createHideOutside({
    disabled: () => !(context.isOpen() && context.isModal()),
    targets: () => {
      const el = ref()
      return el ? [el] : []
    },
    alwaysVisibleSelector: '[data-kb-top-layer], [data-live-announcer]',
  })

  createPreventScroll({
    element: ref,
    enabled: () => context.isOpen() && context.preventScroll(),
  })

  createFocusTrap({
    element: ref,
    enabled: () => context.isOpen() && context.isModal(),
    onInitialFocus: (event) =>
      untrack(() => mergedProps.onOpenAutoFocus?.(event)),
    onFinalFocus: (event) => untrack(() => onCloseAutoFocus(event)),
  })

  createFocusRestore({
    element: ref,
    enabled: () => context.isOpen() && !context.isModal(),
    onFinalFocus: (event) => untrack(() => onCloseAutoFocus(event)),
  })
  createEffect(
    () => ({ node: ref(), open: context.isOpen(), modal: context.isModal() }),
    ({ node, open, modal }) => {
      if (!node || !open || modal) return
      const timer = setTimeout(
        () =>
          untrack(() => {
            const event = new Event('popover.initialFocus', {
              cancelable: true,
            })
            mergedProps.onOpenAutoFocus?.(event)
            if (!event.defaultPrevented) {
              const target = getFocusableTreeWalker(node, {
                tabbable: true,
              }).nextNode() as HTMLElement | null
              ;(target ?? node).focus({ preventScroll: true })
            }
          }),
        0,
      )
      return () => clearTimeout(timer)
    },
  )

  createEffect(
    () => others.id,
    (id) => context.registerContentId(id),
  )

  return (
    <Show when={context.contentPresent()}>
      <Popper.Positioner>
        <DismissableLayer<
          Component<
            Omit<PopoverContentRenderProps, keyof DismissableLayerRenderProps>
          >
        >
          ref={[
            (el: HTMLElement) => {
              context.setContentRef(el)
              setRef(el)
            },
            mergedProps.ref,
          ]}
          role="dialog"
          aria-modal={context.isModal() ? true : undefined}
          tabindex={-1}
          enabled={context.isOpen()}
          disableOutsidePointerEvents={context.isOpen() && context.isModal()}
          excludedElements={[context.triggerRef]}
          style={combineStyle(
            {
              '--kb-popover-content-transform-origin':
                'var(--kb-popper-content-transform-origin)',
              position: 'relative',
            },
            mergedProps.style,
          )}
          aria-labelledby={context.titleId()}
          aria-describedby={context.descriptionId()}
          onPointerDownOutside={onPointerDownOutside}
          onFocusOutside={onFocusOutside}
          onInteractOutside={onInteractOutside}
          onDismiss={context.close}
          {...context.dataset()}
          {...others}
        />
      </Popper.Positioner>
    </Show>
  )
}
