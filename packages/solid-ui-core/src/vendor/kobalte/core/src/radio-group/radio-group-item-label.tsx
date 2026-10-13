import { createEffect, merge } from 'solid-js'
import { Polymorphic } from '../polymorphic/index.tsx'
import { useRadioGroupItemContext } from './radio-group-item-context.tsx'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'

import type { RadioGroupItemDataSet } from './radio-group-item-context.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface RadioGroupItemLabelOptions {}

export interface RadioGroupItemLabelCommonProps<
  _T extends HTMLElement = HTMLElement,
> {
  id: string
}

export interface RadioGroupItemLabelRenderProps
  extends RadioGroupItemLabelCommonProps, RadioGroupItemDataSet {
  for: string | undefined
}

export type RadioGroupItemLabelProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = RadioGroupItemLabelOptions &
  Partial<RadioGroupItemLabelCommonProps<ElementOf<T>>>

/**
 * The label that gives the user information on the radio button.
 */
export function RadioGroupItemLabel<T extends ValidComponent = 'label'>(
  props: PolymorphicProps<T, RadioGroupItemLabelProps<T>>,
) {
  const context = useRadioGroupItemContext()

  const mergedProps = merge(
    {
      id: context.generateId('label'),
    },
    props as RadioGroupItemLabelProps,
  )

  createEffect(
    () => mergedProps.id,
    (id) => context.registerLabel(id),
  )

  return (
    <Polymorphic<RadioGroupItemLabelRenderProps>
      as="label"
      for={context.inputId()}
      {...context.dataset()}
      {...mergedProps}
    />
  )
}
