import { merge } from 'solid-js'

import { useFormControlContext } from '../form-control/index.ts'
import { Polymorphic } from '../polymorphic/index.tsx'
import { useSwitchContext } from './switch-context.tsx'
import type { FormControlDataSet } from '../form-control/index.ts'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { SwitchDataSet } from './switch-context.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface SwitchThumbOptions {}

export interface SwitchThumbCommonProps<_T extends HTMLElement = HTMLElement> {
  id: string
}

export interface SwitchThumbRenderProps
  extends SwitchThumbCommonProps, FormControlDataSet, SwitchDataSet {}

export type SwitchThumbProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = SwitchThumbOptions & Partial<SwitchThumbCommonProps<ElementOf<T>>>

/**
 * The thumb that is used to visually indicate whether the switch is on or off.
 */
export function SwitchThumb<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SwitchThumbProps<T>>,
) {
  const formControlContext = useFormControlContext()
  const context = useSwitchContext()

  const mergedProps = merge(
    {
      id: context.generateId('thumb'),
    },
    props as SwitchThumbProps,
  )

  return (
    <Polymorphic<SwitchThumbRenderProps>
      as="div"
      {...formControlContext.dataset()}
      {...context.dataset()}
      {...mergedProps}
    />
  )
}
