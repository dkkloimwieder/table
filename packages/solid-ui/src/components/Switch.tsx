import * as Core from '@table/ui-core/switch'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export function SwitchRoot<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.SwitchRootProps<T> & { class?: string }>,
) {
  const Primitive = Core.Root as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-toggle ui-switch ' + (props.class ?? '')}
    />
  )
}

export function SwitchInput<T extends ValidComponent = 'input'>(
  props: PolymorphicProps<T, Core.SwitchInputProps<T> & { class?: string }>,
) {
  const Primitive = Core.Input as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-toggle-input ' + (props.class ?? '')} />
  )
}

export function SwitchControl<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.SwitchControlProps<T> & { class?: string }>,
) {
  const Primitive = Core.Control as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-switch-control ' + (props.class ?? '')} />
  )
}

export function SwitchThumb<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.SwitchThumbProps<T> & { class?: string }>,
) {
  const Primitive = Core.Thumb as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-switch-thumb ' + (props.class ?? '')} />
  )
}

export function SwitchLabel<T extends ValidComponent = 'label'>(
  props: PolymorphicProps<T, Core.SwitchLabelProps<T> & { class?: string }>,
) {
  const Primitive = Core.Label as Component<typeof props>
  return <Primitive {...props} class={'ui-label ' + (props.class ?? '')} />
}

export function SwitchDescription<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.SwitchDescriptionProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Description as Component<typeof props>
  return <Primitive {...props} class={'ui-help ' + (props.class ?? '')} />
}

export function SwitchErrorMessage<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.SwitchErrorMessageProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ErrorMessage as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-field-error ' + (props.class ?? '')} />
  )
}

export const Switch = Object.assign(SwitchRoot, {
  Root: SwitchRoot,
  Input: SwitchInput,
  Control: SwitchControl,
  Thumb: SwitchThumb,
  Label: SwitchLabel,
  Description: SwitchDescription,
  ErrorMessage: SwitchErrorMessage,
})
