import { DialogContent } from '../dialog/dialog-content.tsx'
import type {
  DialogContentCommonProps,
  DialogContentOptions,
  DialogContentRenderProps,
} from '../dialog/dialog-content.tsx'
import type { ValidComponent } from '@solidjs/web'
import type { Component } from 'solid-js'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'

export interface AlertDialogContentOptions extends DialogContentOptions {}

export interface AlertDialogContentCommonProps<
  T extends HTMLElement = HTMLElement,
> extends DialogContentCommonProps<T> {}

export interface AlertDialogContentRenderProps
  extends AlertDialogContentCommonProps, DialogContentRenderProps {
  role: 'alertdialog'
}

export type AlertDialogContentProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = AlertDialogContentOptions &
  Partial<AlertDialogContentCommonProps<ElementOf<T>>>

/**
 * Overrides the regular `Dialog.Content` with role="alertdialog" to interrupt the user.
 */
export function AlertDialogContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, AlertDialogContentProps<T>>,
) {
  return (
    <DialogContent<
      Component<
        Omit<
          AlertDialogContentRenderProps,
          Exclude<keyof DialogContentRenderProps, 'role'>
        >
      >
    >
      {...(props as AlertDialogContentProps)}
      role="alertdialog"
      onInteractOutside={(event) => {
        props.onInteractOutside?.(event)
        event.preventDefault()
      }}
    />
  )
}
