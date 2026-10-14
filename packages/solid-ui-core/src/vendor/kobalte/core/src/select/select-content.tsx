import { createFocusTrap } from '@solid-primitives/focus'

import { combineStyle } from '@solid-primitives/props'
import { createPreventScroll } from '@solid-primitives/scroll'
import { Show, createEffect, createSignal, omit } from 'solid-js'
import { createModalHideOutside } from '../../../../../controls/modal-hide-outside.ts'
import { DismissableLayer } from '../dismissable-layer/index.ts'
import { Popper } from '../popper/index.tsx'
import { useSelectContext } from './select-context.tsx'
import type { Component } from 'solid-js'
import type { SelectDataSet } from './select-context.tsx'
import type {
  DismissableLayerCommonProps,
  DismissableLayerRenderProps,
} from '../dismissable-layer/index.ts'
import type {
  FocusOutsideEvent,
  InteractOutsideEvent,
  PointerDownOutsideEvent,
} from '@solid-primitives/interaction'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'

export interface SelectContentOptions {
  /**
   * Event handler called when focus moves to the trigger after closing.
   * It can be prevented by calling `event.preventDefault`.
   */
  onCloseAutoFocus?: (event: Event) => void

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

export interface SelectContentCommonProps<
  T extends HTMLElement = HTMLElement,
> extends DismissableLayerCommonProps<T> {
  style?: JSX.CSSProperties | string
}

export interface SelectContentRenderProps
  extends
    SelectContentCommonProps,
    SelectDataSet,
    DismissableLayerRenderProps {}

export type SelectContentProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = SelectContentOptions & Partial<SelectContentCommonProps<ElementOf<T>>>

/**
 * The component that pops out when the select is open.
 */
export function SelectContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SelectContentProps<T>>,
) {
  const [ref, setRef] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const context = useSelectContext()

  const others = omit(
    props as SelectContentProps,
    'ref',
    'style',
    'onCloseAutoFocus',
    'onFocusOutside',
  )

  const onEscapeKeyDown = (_e: KeyboardEvent) => {
    // `createSelectableList` prevent escape key down,
    // which prevent our `onDismiss` in `DismissableLayer` to run,
    // so we force "close on escape" here.
    context.close()
  }

  const onFocusOutside = (e: FocusOutsideEvent) => {
    props.onFocusOutside?.(e)

    // When focus is trapped (in modal mode), a `focusout` event may still happen.
    // We make sure we don't trigger our `onDismiss` in such case.
    if (context.isOpen() && context.isModal()) {
      e.preventDefault()
    }
  }

  // aria-hide everything except the content (better supported equivalent to setting aria-modal)
  createModalHideOutside({
    element: ref,
    enabled: () => context.isOpen() && context.isModal(),
    targets: () => {
      const el = ref()
      return el ? [el] : []
    },
  })

  createPreventScroll({
    element: ref,
    enabled: () => context.contentPresent() && context.preventScroll(),
  })

  const onFinalFocus = (e: Event) => {
    props.onCloseAutoFocus?.(e)

    if (!e.defaultPrevented) {
      context.triggerRef()?.focus({ preventScroll: true })
      e.preventDefault()
    }
  }

  createFocusTrap({
    element: ref,
    enabled: () => context.isOpen() && context.isModal(),
    onInitialFocus: (e) => {
      // We prevent open autofocus because it's handled by the `Listbox`.
      e.preventDefault()
    },
    onFinalFocus,
  })

  // `createFocusTrap`'s `enabled` flag gates both Tab-trapping AND focus
  // restoration behind modal mode, so a non-modal select (Select's default)
  // never gets `onFinalFocus`. Restore focus to the trigger ourselves when
  // content closes while non-modal.
  createEffect(
    () => context.contentPresent() && !context.isModal(),
    (isNonModalAndPresent) => {
      if (!isNonModalAndPresent) {
        return
      }

      return () => {
        onFinalFocus(
          new CustomEvent('selectCloseAutoFocus', {
            bubbles: false,
            cancelable: true,
          }),
        )
      }
    },
  )

  return (
    <Show when={context.contentPresent()}>
      <Popper.Positioner>
        <DismissableLayer<
          Component<
            Omit<SelectContentRenderProps, keyof DismissableLayerRenderProps>
          >
        >
          ref={[
            (el: HTMLElement) => {
              context.setContentRef(el)
              setRef(el)
            },
            props.ref,
          ]}
          disableOutsidePointerEvents={context.isModal() && context.isOpen()}
          excludedElements={[context.triggerRef]}
          style={combineStyle(
            {
              '--kb-select-content-transform-origin':
                'var(--kb-popper-content-transform-origin)',
              position: 'relative',
            },
            props.style,
          )}
          onEscapeKeyDown={onEscapeKeyDown}
          onFocusOutside={onFocusOutside}
          onDismiss={context.close}
          {...context.dataset()}
          {...others}
        />
      </Popper.Positioner>
    </Show>
  )
}
