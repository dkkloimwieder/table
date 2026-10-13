import { merge, omit } from 'solid-js'
import { callHandler } from '../../../utils/src/index.ts'

import { useFormControlContext } from '../form-control/index.ts'
import { Polymorphic } from '../polymorphic/index.tsx'
import { useCheckboxContext } from './checkbox-context.tsx'
import type { FormControlDataSet } from '../form-control/index.ts'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { CheckboxDataSet } from './checkbox-context.tsx'

export interface CheckboxControlOptions {}

export interface CheckboxControlCommonProps<
  T extends HTMLElement = HTMLElement,
> {
  id: string
  onClick: JSX.EventHandlerUnion<T, MouseEvent>
  onKeyDown: JSX.EventHandlerUnion<T, KeyboardEvent>
}

export interface CheckboxControlRenderProps
  extends CheckboxControlCommonProps, FormControlDataSet, CheckboxDataSet {}

export type CheckboxControlProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = CheckboxControlOptions & Partial<CheckboxControlCommonProps<ElementOf<T>>>

/**
 * The element that visually represents a checkbox.
 */
export function CheckboxControl<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, CheckboxControlProps<T>>,
) {
  const formControlContext = useFormControlContext()
  const context = useCheckboxContext()

  const mergedProps = merge(
    {
      id: context.generateId('control'),
    },
    props as CheckboxControlProps,
  )

  const others = omit(mergedProps, 'onClick', 'onKeyDown')

  const onClick: JSX.EventHandlerUnion<HTMLElement, MouseEvent> = (e) => {
    if (callHandler(e, mergedProps.onClick)) return

    context.toggle()
    context.inputRef()?.focus({ preventScroll: true })
  }

  const onKeyDown: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent> = (e) => {
    if (callHandler(e, mergedProps.onKeyDown)) return

    if (e.key === ' ') {
      e.preventDefault()
      context.toggle()
      context.inputRef()?.focus({ preventScroll: true })
    }
  }

  return (
    <Polymorphic<CheckboxControlRenderProps>
      as="div"
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...formControlContext.dataset()}
      {...context.dataset()}
      {...others}
    />
  )
}
