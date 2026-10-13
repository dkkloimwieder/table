import { omit } from 'solid-js'
import { Dialog, DialogContent } from './Dialog'
import type { DialogRootProps } from './Dialog'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { DialogContentProps } from '@table/ui-core/dialog'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export type SheetRootProps = DialogRootProps
export type SheetSide = 'left' | 'right' | 'top' | 'bottom'
export function SheetContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    DialogContentProps<T> & { class?: string; side?: SheetSide }
  >,
) {
  const rest = omit(props, 'side') as typeof props
  const Primitive = DialogContent as Component<typeof props>
  return (
    <Primitive
      {...rest}
      class={'ui-sheet ' + (props.class ?? '')}
      data-side={props.side ?? 'right'}
    />
  )
}
export function SheetRoot(props: SheetRootProps) {
  return <Dialog.Root {...props} />
}

export const Sheet = /* @__PURE__ */ Object.assign(SheetRoot, {
  ...Dialog,
  Root: SheetRoot,
  Content: SheetContent,
})
