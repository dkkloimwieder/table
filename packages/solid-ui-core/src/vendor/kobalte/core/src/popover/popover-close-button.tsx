import { omit } from 'solid-js'
import { callHandler } from '../../../utils/src/index.ts'
import * as Button from '../button/index.tsx'
import { usePopoverContext } from './popover-context.tsx'
import type { Component } from 'solid-js'
import type { JSX, ValidComponent } from '@solidjs/web'

import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { PopoverDataSet } from './popover-context.tsx'

export interface PopoverCloseButtonOptions {}

export interface PopoverCloseButtonCommonProps<
  T extends HTMLElement = HTMLElement,
> {
  'aria-label': string
  onClick: JSX.EventHandlerUnion<T, MouseEvent>
}

export interface PopoverCloseButtonRenderProps
  extends
    PopoverCloseButtonCommonProps,
    Button.ButtonRootRenderProps,
    PopoverDataSet {}

export type PopoverCloseButtonProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = PopoverCloseButtonOptions &
  Partial<PopoverCloseButtonCommonProps<ElementOf<T>>>

/**
 * The button that closes the popover.
 */
export function PopoverCloseButton<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, PopoverCloseButtonProps<T>>,
) {
  const context = usePopoverContext()

  const p = props as PopoverCloseButtonProps
  const others = omit(p, 'aria-label', 'onClick')

  const onClick: JSX.EventHandlerUnion<HTMLElement, MouseEvent> = (e) => {
    if (callHandler(e, p.onClick)) return
    context.close()
  }

  return (
    <Button.Root<
      Component<
        Omit<PopoverCloseButtonRenderProps, keyof Button.ButtonRootRenderProps>
      >
    >
      aria-label={p['aria-label'] || context.translations().dismiss}
      onClick={onClick}
      {...context.dataset()}
      {...others}
    />
  )
}
