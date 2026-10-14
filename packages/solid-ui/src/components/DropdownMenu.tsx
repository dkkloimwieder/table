import * as Core from '@table/ui-core/dropdown-menu'
import { untrack } from 'solid-js'
import { PopupScope, createPopupScope, usePopupScope } from './popupScope'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export function DropdownMenuRoot(props: Core.DropdownMenuRootProps) {
  const scope = createPopupScope()
  return (
    <PopupScope value={scope}>
      <Core.Root {...props} />
    </PopupScope>
  )
}
export function DropdownMenuTrigger<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuTriggerProps<T> & { class?: string }
  >,
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
export function DropdownMenuContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuContentProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Content as Component<typeof props>
  return (
    <Primitive {...props} data-ui="" class={'ui-menu ' + (props.class ?? '')} />
  )
}
export function DropdownMenuSubContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuSubContentProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.SubContent as Component<typeof props>
  return (
    <Primitive {...props} data-ui="" class={'ui-menu ' + (props.class ?? '')} />
  )
}
export function DropdownMenuItem<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuItemProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Item as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-menu-item ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuCheckboxItem<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuCheckboxItemProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.CheckboxItem as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-menu-item ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuRadioItem<
  TValue = string,
  T extends ValidComponent = 'div',
>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuRadioItemProps<T, TValue> & { class?: string }
  >,
) {
  const Primitive = Core.RadioItem as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-menu-item ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuSubTrigger<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuSubTriggerProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.SubTrigger as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-menu-item ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuGroupLabel<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuGroupLabelProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.GroupLabel as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-menu-label ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuItemDescription<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuItemDescriptionProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ItemDescription as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-popup-description ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuSeparator<T extends ValidComponent = 'hr'>(
  props: PolymorphicProps<
    T,
    Core.DropdownMenuSeparatorProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Separator as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-menu-separator ' + (props.class ?? '')}
    />
  )
}
export function DropdownMenuPortal(props: Core.DropdownMenuPortalProps) {
  const scope = usePopupScope()
  return (
    <Core.Portal {...props} mount={props.mount ?? scope.mount()}>
      <div data-ui="" class="ui-popup-portal" style={{ display: 'contents' }}>
        {props.children}
      </div>
    </Core.Portal>
  )
}
export const DropdownMenu = /* @__PURE__ */ Object.assign(DropdownMenuRoot, {
  // Refresh proxies hide function keys. Copy named parts without enumerating them.
  Arrow: Core.Arrow,
  Group: Core.Group,
  Icon: Core.Icon,
  ItemIndicator: Core.ItemIndicator,
  ItemLabel: Core.ItemLabel,
  RadioGroup: Core.RadioGroup,
  Sub: Core.Sub,
  Root: DropdownMenuRoot,
  Portal: DropdownMenuPortal,
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  SubContent: DropdownMenuSubContent,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioItem: DropdownMenuRadioItem,
  SubTrigger: DropdownMenuSubTrigger,
  GroupLabel: DropdownMenuGroupLabel,
  ItemDescription: DropdownMenuItemDescription,
  Separator: DropdownMenuSeparator,
})
export type * from '@table/ui-core/dropdown-menu'
