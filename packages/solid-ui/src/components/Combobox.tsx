import * as Core from '@table/ui-core/combobox'
import { callHandler } from '@table/ui-core/events'
import { Show, omit } from 'solid-js'
import { ChoiceScope, createChoiceScope, useChoiceScope } from './choiceScope'
import type { Component } from 'solid-js'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { ElementOf, PolymorphicProps } from '@table/ui-core/polymorphic'

export function ComboboxRoot<
  Option,
  OptGroup = never,
  T extends ValidComponent = 'div',
>(props: PolymorphicProps<T, Core.ComboboxRootProps<Option, OptGroup, T>>) {
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
    onOpenChange: (value, mode) => props.onOpenChange?.(value, mode),
  })
  return (
    <ChoiceScope value={scope}>
      <Core.Root<Option, OptGroup, T>
        {...props}
        data-ui=""
        open={scope.open()}
        onOpenChange={scope.changeOpen}
        allowsEmptyCollection={props.allowsEmptyCollection ?? true}
      />
    </ChoiceScope>
  )
}

// Styled parts add HTML classes and slots at the polymorphic forwarding boundary.
// Keep JSX reference arrays direct. The compiler drops callbacks behind outer assertions.
export function ComboboxTrigger<T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, Core.ComboboxTriggerProps<T> & { class?: string }>,
) {
  const Primitive = Core.Trigger as Component<typeof props>

  return <Primitive {...props} class={'choice-toggle ' + (props.class ?? '')} />
}
export function ComboboxContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.ComboboxContentProps<T> & {
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
export function ComboboxItem<T extends ValidComponent = 'li'>(
  props: PolymorphicProps<T, Core.ComboboxItemProps<T> & { class?: string }>,
) {
  const Primitive = Core.Item as Component<typeof props>
  return <Primitive {...props} class={'popup-option ' + (props.class ?? '')} />
}
export function ComboboxPortal(props: Core.ComboboxPortalProps) {
  const scope = useChoiceScope()
  return <Core.Portal {...props} mount={props.mount ?? scope.mount()} />
}

export function ComboboxListbox<
  Option = unknown,
  OptGroup = never,
  T extends ValidComponent = 'ul',
>(
  props: PolymorphicProps<
    T,
    Core.ComboboxListboxProps<Option, OptGroup, T> & { class?: string }
  >,
) {
  const Primitive = Core.Listbox as Component<typeof props>
  return <Primitive {...props} class={'popup-listbox ' + (props.class ?? '')} />
}
export function ComboboxInput<T extends ValidComponent = 'input'>(
  props: PolymorphicProps<T, Core.ComboboxInputProps<T> & { class?: string }>,
) {
  const Primitive = Core.Input as Component<typeof props>
  const scope = useChoiceScope()
  return (
    <Primitive
      {...props}
      class={'choice-input ' + (props.class ?? '')}
      ref={[scope.setControl, props.ref]}
      onKeyDown={(
        event: KeyboardEvent & { currentTarget: ElementOf<T>; target: Element },
      ) => {
        callHandler(event, props.onKeyDown)
        scope.enterContent(event)
      }}
    />
  )
}
export function ComboboxControl<Option, T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.ComboboxControlProps<Option, T> & { class?: string }
  >,
) {
  const Primitive = Core.Control as Component<typeof props>
  return (
    <Primitive {...props} class={'choice-control ' + (props.class ?? '')} />
  )
}

export const Combobox = /* @__PURE__ */ Object.assign(ComboboxRoot, {
  ...Core.Combobox,
  Root: ComboboxRoot,
  Trigger: ComboboxTrigger,
  Content: ComboboxContent,
  Item: ComboboxItem,
  Listbox: ComboboxListbox,
  Portal: ComboboxPortal,
  Input: ComboboxInput,
  Control: ComboboxControl,
})
export type * from '@table/ui-core/combobox'
