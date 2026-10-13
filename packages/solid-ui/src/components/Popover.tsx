import * as Core from '@table/ui-core/popover'
import { untrack } from 'solid-js'
import { PopupScope, createPopupScope, usePopupScope } from './popupScope'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export function PopoverRoot(props: Core.PopoverRootProps) {
  const scope = createPopupScope()
  return (
    <PopupScope value={scope}>
      <Core.Root {...props} />
    </PopupScope>
  )
}
export function PopoverTrigger<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, Core.PopoverTriggerProps<T> & { class?: string }>,
) {
  const Primitive = Core.Trigger as Component<typeof props>
  const scope = usePopupScope()
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-button ' + (props.class ?? '')}
      ref={[scope.setTrigger, untrack(() => props.ref)]}
    />
  )
}
export function PopoverContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.PopoverContentProps<T> & { class?: string }>,
) {
  const Primitive = Core.Content as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-popover ' + (props.class ?? '')}
    />
  )
}
export function PopoverCloseButton<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<
    T,
    Core.PopoverCloseButtonProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.CloseButton as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-button ' + (props.class ?? '')}
    />
  )
}
export function PopoverTitle<T extends ValidComponent = 'h2'>(
  props: PolymorphicProps<T, Core.PopoverTitleProps<T> & { class?: string }>,
) {
  const Primitive = Core.Title as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-popup-title ' + (props.class ?? '')}
    />
  )
}
export function PopoverDescription<T extends ValidComponent = 'p'>(
  props: PolymorphicProps<
    T,
    Core.PopoverDescriptionProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Description as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-popup-description ' + (props.class ?? '')}
    />
  )
}
export function PopoverPortal(props: Core.PopoverPortalProps) {
  const scope = usePopupScope()
  return (
    <Core.Portal {...props} mount={props.mount ?? scope.mount()}>
      <div data-ui="" class="ui-popup-portal" style={{ display: 'contents' }}>
        {props.children}
      </div>
    </Core.Portal>
  )
}
export const Popover = /* @__PURE__ */ Object.assign(PopoverRoot, {
  ...Core.Popover,
  Root: PopoverRoot,
  Portal: PopoverPortal,
  Trigger: PopoverTrigger,
  Content: PopoverContent,
  CloseButton: PopoverCloseButton,
  Title: PopoverTitle,
  Description: PopoverDescription,
})
export type * from '@table/ui-core/popover'
