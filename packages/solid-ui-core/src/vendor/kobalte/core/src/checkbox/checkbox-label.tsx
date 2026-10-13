import { FormControlLabel } from '../form-control/index.ts'
import { useCheckboxContext } from './checkbox-context.tsx'
import type {
  FormControlLabelCommonProps,
  FormControlLabelOptions,
  FormControlLabelRenderProps,
} from '../form-control/index.ts'
import type { ValidComponent } from '@solidjs/web'
import type { Component } from 'solid-js'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { CheckboxDataSet } from './checkbox-context.tsx'

export interface CheckboxLabelOptions extends FormControlLabelOptions {}

export interface CheckboxLabelCommonProps<
  T extends HTMLElement = HTMLElement,
> extends FormControlLabelCommonProps<T> {}

export interface CheckboxLabelRenderProps
  extends
    CheckboxLabelCommonProps,
    FormControlLabelRenderProps,
    CheckboxDataSet {}

export type CheckboxLabelProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = CheckboxLabelOptions & Partial<CheckboxLabelCommonProps<ElementOf<T>>>

/**
 * The label that gives the user information on the checkbox.
 */
export function CheckboxLabel<T extends ValidComponent = 'label'>(
  props: PolymorphicProps<T, CheckboxLabelProps<T>>,
) {
  const context = useCheckboxContext()

  return (
    <FormControlLabel<
      Component<
        Omit<CheckboxLabelRenderProps, keyof FormControlLabelRenderProps>
      >
    >
      {...context.dataset()}
      {...(props as CheckboxLabelProps)}
    />
  )
}
