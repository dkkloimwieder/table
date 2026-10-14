import * as Core from '@table/ui-core/select'
import { callHandler } from '@table/ui-core/events'
import { Show, omit } from 'solid-js'
import { ChoiceScope, createChoiceScope, useChoiceScope } from './choiceScope'
import type { Component } from 'solid-js'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { ElementOf, PolymorphicProps } from '@table/ui-core/polymorphic'

export function SelectRoot<
  Option,
  OptGroup = never,
  T extends ValidComponent = 'div',
>(props: PolymorphicProps<T, Core.SelectRootProps<Option, OptGroup, T>>) {
  const scope = createChoiceScope({
    get open() {
      return props.open
    },
    get defaultOpen() {
      return props.defaultOpen
    },
    get disabled() {
      return props.disabled
    },
    onOpenChange: (value) => props.onOpenChange?.(value),
  })
  return (
    <ChoiceScope value={scope}>
      <Core.Root<Option, OptGroup, T>
        {...props}
        data-ui=""
        open={scope.open()}
        onOpenChange={scope.changeOpen}
      />
    </ChoiceScope>
  )
}

// Styled parts add HTML classes and slots at the polymorphic forwarding boundary.
// Keep JSX reference arrays direct. The compiler drops callbacks behind outer assertions.
export function SelectTrigger<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, Core.SelectTriggerProps<T> & { class?: string }>,
) {
  const Primitive = Core.Trigger as Component<typeof props>
  const scope = useChoiceScope()
  return (
    <Primitive
      {...props}
      class={'popup-trigger ' + (props.class ?? '')}
      ref={[scope.setControl, props.ref]}
    />
  )
}
export function SelectContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.SelectContentProps<T> & {
      class?: string
      children?: JSX.Element
      footer?: JSX.Element
      status?: JSX.Element
    }
  >,
) {
  const Primitive = Core.Content as Component<typeof props>
  const scope = useChoiceScope()
  const rest = omit(props, 'footer', 'status') as typeof props
  return (
    <Primitive
      {...rest}
      class={'popup-content ' + (props.class ?? '')}
      ref={[scope.setContent, props.ref]}
      onPointerDownOutside={(event) => {
        props.onPointerDownOutside?.(event)
        if (!event.defaultPrevented) scope.outside()
      }}
      onFocusOutside={(event) => {
        props.onFocusOutside?.(event)
        if (!event.defaultPrevented) scope.outside()
      }}
      onKeyDown={(
        event: KeyboardEvent & { currentTarget: ElementOf<T>; target: Element },
      ) => {
        callHandler(event, props.onKeyDown)
        scope.tab(event)
      }}
      onCloseAutoFocus={(event) => {
        props.onCloseAutoFocus?.(event)
        scope.closeAutoFocus(event)
      }}
    >
      {props.children}
      <Show when={props.status}>
        <div class="choice-status" role="status">
          {props.status}
        </div>
      </Show>
      <Show when={props.footer}>
        <div class="choice-footer">{props.footer}</div>
      </Show>
    </Primitive>
  )
}
export function SelectItem<T extends ValidComponent = 'li'>(
  props: PolymorphicProps<T, Core.SelectItemProps<T> & { class?: string }>,
) {
  const Primitive = Core.Item as Component<typeof props>
  return <Primitive {...props} class={'popup-option ' + (props.class ?? '')} />
}
export function SelectPortal(props: Core.SelectPortalProps) {
  const scope = useChoiceScope()
  return <Core.Portal {...props} mount={props.mount ?? scope.mount()} />
}

export function SelectListbox<
  Option = unknown,
  OptGroup = never,
  T extends ValidComponent = 'ul',
>(
  props: PolymorphicProps<
    T,
    Core.SelectListboxProps<Option, OptGroup, T> & { class?: string }
  >,
) {
  const Primitive = Core.Listbox as Component<typeof props>
  return <Primitive {...props} class={'popup-listbox ' + (props.class ?? '')} />
}

export const Select = /* @__PURE__ */ Object.assign(SelectRoot, {
  // Refresh proxies hide function keys. Copy named parts without enumerating them.
  Arrow: Core.Arrow,
  Description: Core.Description,
  ErrorMessage: Core.ErrorMessage,
  HiddenSelect: Core.HiddenSelect,
  Icon: Core.Icon,
  ItemDescription: Core.ItemDescription,
  ItemIndicator: Core.ItemIndicator,
  ItemLabel: Core.ItemLabel,
  Label: Core.Label,
  Section: Core.Section,
  Value: Core.Value,
  Root: SelectRoot,
  Trigger: SelectTrigger,
  Content: SelectContent,
  Item: SelectItem,
  Listbox: SelectListbox,
  Portal: SelectPortal,
})
export type * from '@table/ui-core/select'
