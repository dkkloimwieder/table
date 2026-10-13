import * as Core from '@table/ui-core/alert-dialog'
import { untrack } from 'solid-js'
import { Dialog, DialogRoot } from './Dialog'
import { useDialogScope } from './dialogScope'
import { Button } from './NativeFields'
import type { Component } from 'solid-js'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export type AlertDialogRootProps = Omit<Core.AlertDialogRootProps, 'modal'>
export function AlertDialogRoot(props: AlertDialogRootProps) {
  return <DialogRoot {...props} modal />
}
export function AlertDialogContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.AlertDialogContentProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Content as Component<typeof props>
  const scope = useDialogScope()
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-dialog-content ' + (props.class ?? '')}
      ref={[scope.setContent, untrack(() => props.ref)]}
      onOpenAutoFocus={(event) => {
        props.onOpenAutoFocus?.(event)
        scope.initialAlertFocus(event)
      }}
    />
  )
}
export function AlertDialogCancel<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<
    T,
    Core.AlertDialogCloseButtonProps<T> & {
      class?: string
      children?: JSX.Element
    }
  >,
) {
  const Primitive = Core.CloseButton as Component<typeof props>
  const scope = useDialogScope()
  return (
    <Primitive
      {...props}
      class={'ui-button ' + (props.class ?? '')}
      aria-label={
        props['aria-label'] ??
        (typeof props.children === 'string' ? props.children : 'Cancel')
      }
      ref={[scope.setCancel, untrack(() => props.ref)]}
    >
      {props.children ?? 'Cancel'}
    </Primitive>
  )
}
export const AlertDialog = /* @__PURE__ */ Object.assign(AlertDialogRoot, {
  ...Dialog,
  Root: AlertDialogRoot,
  Content: AlertDialogContent,
  Cancel: AlertDialogCancel,
  Action: Button,
})
export type * from '@table/ui-core/alert-dialog'
