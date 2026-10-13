import { createEffect, merge, omit } from 'solid-js'

import { Polymorphic } from '../polymorphic/index.tsx'
import { useDialogContext } from './dialog-context.tsx'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface DialogDescriptionOptions {}

export interface DialogDescriptionCommonProps<
  _T extends HTMLElement = HTMLElement,
> {
  id: string
}

export interface DialogDescriptionRenderProps extends DialogDescriptionCommonProps {}

export type DialogDescriptionProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = DialogDescriptionOptions &
  Partial<DialogDescriptionCommonProps<ElementOf<T>>>

/**
 * An optional accessible description to be announced when the dialog is open.
 */
export function DialogDescription<T extends ValidComponent = 'p'>(
  props: PolymorphicProps<T, DialogDescriptionProps<T>>,
) {
  const context = useDialogContext()

  const mergedProps = merge(
    {
      id: context.generateId('description'),
    },
    props as DialogDescriptionProps,
  )

  const others = omit(mergedProps, 'id')

  createEffect(
    () => mergedProps.id,
    (id) => context.registerDescriptionId(id),
  )

  return (
    <Polymorphic<DialogDescriptionRenderProps>
      as="p"
      id={mergedProps.id}
      {...others}
    />
  )
}
