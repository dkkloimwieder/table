import { createFocusTrap } from '@solid-primitives/focus'

import { combineStyle } from '@solid-primitives/props'
import { createPreventScroll } from '@solid-primitives/scroll'
import { Show, createSignal, omit } from 'solid-js'
import { createModalHideOutside } from '../../../../../controls/modal-hide-outside.ts'
import { DismissableLayer } from '../dismissable-layer/index.ts'
import { Popper } from '../popper/index.tsx'
import { useComboboxContext } from './combobox-context.tsx'
import type { Component } from 'solid-js'
import type { ComboboxDataSet } from './combobox-context.tsx'
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

export interface ComboboxContentOptions {
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

export interface ComboboxContentCommonProps<
  T extends HTMLElement = HTMLElement,
> extends DismissableLayerCommonProps<T> {
  style?: JSX.CSSProperties | string
}

export interface ComboboxContentRenderProps
  extends
    ComboboxContentCommonProps,
    DismissableLayerRenderProps,
    ComboboxDataSet {}

export type ComboboxContentProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = ComboboxContentOptions & Partial<ComboboxContentCommonProps<ElementOf<T>>>

/**
 * The component that pops out when the combobox is open.
 */
export function ComboboxContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, ComboboxContentProps<T>>,
) {
  const [ref, setRef] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const context = useComboboxContext()

  const others = omit(
    props as ComboboxContentProps,
    'ref',
    'style',
    'onCloseAutoFocus',
    'onFocusOutside',
  )

  const dismiss = () => {
    context.resetInputValue(
      context.listState().selectionManager().selectedKeys(),
    )
    context.close()
    setTimeout(() => {
      context.close()
    })
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
      const excludedElements = []

      if (ref()) {
        excludedElements.push(ref()!)
      }

      const controlEl = context.controlRef()
      if (controlEl) {
        excludedElements.push(controlEl)
      }

      return excludedElements
    },
  })

  createPreventScroll({
    element: ref,
    enabled: () => context.contentPresent() && context.preventScroll(),
  })

  createFocusTrap({
    element: ref,
    enabled: () => context.isOpen() && context.isModal(),
    onInitialFocus: (e) => {
      // We prevent open autofocus because it's handled by the `Listbox`.
      e.preventDefault()
    },
    onFinalFocus: (e) => {
      props.onCloseAutoFocus?.(e)

      if (!e.defaultPrevented) {
        context.inputRef()?.focus({ preventScroll: true })
        e.preventDefault()
      }
    },
  })

  return (
    <Show when={context.contentPresent()}>
      <Popper.Positioner>
        <DismissableLayer<
          Component<
            Omit<ComboboxContentRenderProps, keyof DismissableLayerRenderProps>
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
          excludedElements={[context.controlRef]}
          style={combineStyle(
            {
              '--kb-combobox-content-transform-origin':
                'var(--kb-popper-content-transform-origin)',
              position: 'relative',
            },
            props.style,
          )}
          onFocusOutside={onFocusOutside}
          onDismiss={dismiss}
          {...context.dataset()}
          {...others}
        />
      </Popper.Positioner>
    </Show>
  )
}
