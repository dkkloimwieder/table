import { merge, omit } from 'solid-js'
import { callHandler } from '../../../utils/src/index.ts'

import { Polymorphic } from '../polymorphic/index.tsx'
import { useRadioGroupItemContext } from './radio-group-item-context.tsx'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { RadioGroupItemDataSet } from './radio-group-item-context.tsx'

export interface RadioGroupItemControlOptions {}

export interface RadioGroupItemControlCommonProps<
  T extends HTMLElement = HTMLElement,
> {
  id: string
  onClick: JSX.EventHandlerUnion<T, MouseEvent>
  onKeyDown: JSX.EventHandlerUnion<T, KeyboardEvent>
}

export interface RadioGroupItemControlRenderProps
  extends RadioGroupItemControlCommonProps, RadioGroupItemDataSet {}

export type RadioGroupItemControlProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = RadioGroupItemControlOptions &
  Partial<RadioGroupItemControlCommonProps<ElementOf<T>>>

/**
 * The element that visually represents a radio button.
 */
export function RadioGroupItemControl<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, RadioGroupItemControlProps<T>>,
) {
  const context = useRadioGroupItemContext()

  const mergedProps = merge(
    {
      id: context.generateId('control'),
    },
    props as RadioGroupItemControlProps,
  )

  const others = omit(mergedProps, 'onClick', 'onKeyDown')

  const onClick: JSX.EventHandlerUnion<any, MouseEvent> = (e) => {
    if (callHandler(e, mergedProps.onClick)) return

    context.select()
    context.inputRef()?.focus({ preventScroll: true })
  }

  const onKeyDown: JSX.EventHandlerUnion<any, KeyboardEvent> = (e) => {
    if (callHandler(e, mergedProps.onKeyDown)) return

    if (e.key === ' ') {
      e.preventDefault()
      context.select()
      context.inputRef()?.focus({ preventScroll: true })
    }
  }

  return (
    <Polymorphic<RadioGroupItemControlRenderProps>
      as="div"
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...context.dataset()}
      {...others}
    />
  )
}
