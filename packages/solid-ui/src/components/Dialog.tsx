import * as Core from '@table/ui-core/dialog'
import { untrack } from 'solid-js'
import { DialogScope, createDialogScope, useDialogScope } from './dialogScope'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export type DialogRootProps = Core.DialogRootProps
export function DialogRoot(props: DialogRootProps) {
  const scope = createDialogScope()
  return (
    <DialogScope value={scope}>
      <Core.Root {...props} />
    </DialogScope>
  )
}
export function DialogPortal(props: Core.DialogPortalProps) {
  const scope = useDialogScope()
  return (
    <Core.Portal {...props} mount={props.mount ?? scope.mount()}>
      <div data-ui="" style={{ display: 'contents' }}>
        <div class="ui-dialog-portal">{props.children}</div>
      </div>
    </Core.Portal>
  )
}

export function DialogTrigger<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, Core.DialogTriggerProps<T> & { class?: string }>,
) {
  const Primitive = Core.Trigger as Component<typeof props>
  const scope = useDialogScope()
  return (
    <Primitive
      {...props}
      class={'ui-button ' + (props.class ?? '')}
      ref={[scope.setTrigger, untrack(() => props.ref)]}
    />
  )
}

export function DialogCloseButton<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<
    T,
    Core.DialogCloseButtonProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.CloseButton as Component<typeof props>
  return <Primitive {...props} class={'ui-button ' + (props.class ?? '')} />
}

export function DialogOverlay<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.DialogOverlayProps<T> & { class?: string }>,
) {
  const Primitive = Core.Overlay as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-dialog-overlay ' + (props.class ?? '')} />
  )
}

export function DialogContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.DialogContentProps<T> & { class?: string }>,
) {
  const Primitive = Core.Content as Component<typeof props>
  const scope = useDialogScope()
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-dialog-content ' + (props.class ?? '')}
      ref={[scope.setContent, untrack(() => props.ref)]}
    />
  )
}

export function DialogTitle<T extends ValidComponent = 'h2'>(
  props: PolymorphicProps<T, Core.DialogTitleProps<T> & { class?: string }>,
) {
  const Primitive = Core.Title as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-dialog-title ' + (props.class ?? '')} />
  )
}

export function DialogDescription<T extends ValidComponent = 'p'>(
  props: PolymorphicProps<
    T,
    Core.DialogDescriptionProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Description as Component<typeof props>
  return (
    <Primitive
      {...props}
      class={'ui-dialog-description ' + (props.class ?? '')}
    />
  )
}

export const Dialog = /* @__PURE__ */ Object.assign(DialogRoot, {
  Root: DialogRoot,
  Portal: DialogPortal,
  Trigger: DialogTrigger,
  CloseButton: DialogCloseButton,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Title: DialogTitle,
  Description: DialogDescription,
})
export type * from '@table/ui-core/dialog'
