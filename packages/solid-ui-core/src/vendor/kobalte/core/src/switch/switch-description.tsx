import { FormControlDescription } from '../form-control/index.ts'
import { useSwitchContext } from './switch-context.tsx'
import type {
  FormControlDescriptionCommonProps,
  FormControlDescriptionOptions,
  FormControlDescriptionRenderProps,
} from '../form-control/index.ts'
import type { ValidComponent } from '@solidjs/web'
import type { Component } from 'solid-js'
import type { PolymorphicProps } from '../polymorphic/index.tsx'
import type { SwitchDataSet } from './switch-context.tsx'

export interface SwitchDescriptionOptions extends FormControlDescriptionOptions {}

export interface SwitchDescriptionCommonProps extends FormControlDescriptionCommonProps {}

export interface SwitchDescriptionRenderProps
  extends
    SwitchDescriptionCommonProps,
    FormControlDescriptionRenderProps,
    SwitchDataSet {}

export type SwitchDescriptionProps<
  _T extends ValidComponent | HTMLElement = HTMLElement,
> = SwitchDescriptionOptions & Partial<SwitchDescriptionCommonProps>

/**
 * The description that gives the user more information on the switch.
 */
export function SwitchDescription<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SwitchDescriptionProps<T>>,
) {
  const context = useSwitchContext()

  return (
    <FormControlDescription<
      Component<
        Omit<
          SwitchDescriptionRenderProps,
          keyof FormControlDescriptionRenderProps
        >
      >
    >
      {...context.dataset()}
      {...(props as SwitchDescriptionProps)}
    />
  )
}
