import { merge, omit } from 'solid-js'
import { callHandler } from '../../../utils/src/index.ts'

import { useFormControlContext } from '../form-control/index.ts'
import { Polymorphic } from '../polymorphic/index.tsx'
import { useSwitchContext } from './switch-context.tsx'
import type { FormControlDataSet } from '../form-control/index.ts'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { SwitchDataSet } from './switch-context.tsx'

export interface SwitchControlOptions {}

export interface SwitchControlCommonProps<T extends HTMLElement = HTMLElement> {
  id: string
  onClick: JSX.EventHandlerUnion<T, MouseEvent>
  onKeyDown: JSX.EventHandlerUnion<T, KeyboardEvent>
}

export interface SwitchControlRenderProps
  extends SwitchControlCommonProps, FormControlDataSet, SwitchDataSet {}

export type SwitchControlProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = SwitchControlOptions & Partial<SwitchControlCommonProps<ElementOf<T>>>

/**
 * The element that visually represents a switch.
 */
export function SwitchControl<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SwitchControlProps<T>>,
) {
  const formControlContext = useFormControlContext()
  const context = useSwitchContext()

  const mergedProps = merge(
    {
      id: context.generateId('control'),
    },
    props as SwitchControlProps,
  )

  const others = omit(mergedProps, 'onClick', 'onKeyDown')

  const onClick: JSX.EventHandlerUnion<any, MouseEvent> = (e) => {
    if (callHandler(e, mergedProps.onClick)) return

    context.toggle()
    context.inputRef()?.focus({ preventScroll: true })
  }

  const onKeyDown: JSX.EventHandlerUnion<any, KeyboardEvent> = (e) => {
    if (callHandler(e, mergedProps.onKeyDown)) return

    if (e.key === ' ') {
      e.preventDefault()
      context.toggle()
      context.inputRef()?.focus({ preventScroll: true })
    }
  }

  return (
    <Polymorphic<SwitchControlRenderProps>
      as="div"
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...formControlContext.dataset()}
      {...context.dataset()}
      {...others}
    />
  )
}
