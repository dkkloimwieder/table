import * as Core from '@table/ui-core/radio-group'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export function RadioGroupRoot<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.RadioGroupRootProps<T> & { class?: string }>,
) {
  const Primitive = Core.Root as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-radio-group ' + (props.class ?? '')}
    />
  )
}

export function RadioGroupItem<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.RadioGroupItemProps<T> & { class?: string }>,
) {
  const Primitive = Core.Item as Component<typeof props>
  return <Primitive {...props} class={'ui-radio-item ' + (props.class ?? '')} />
}

export function RadioGroupItemInput<T extends ValidComponent = 'input'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupItemInputProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ItemInput as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-toggle-input ' + (props.class ?? '')} />
  )
}

export function RadioGroupItemControl<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupItemControlProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ItemControl as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-radio-control ' + (props.class ?? '')} />
  )
}

export function RadioGroupItemIndicator<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupItemIndicatorProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ItemIndicator as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-radio-indicator ' + (props.class ?? '')} />
  )
}

export function RadioGroupLabel<T extends ValidComponent = 'span'>(
  props: PolymorphicProps<T, Core.RadioGroupLabelProps<T> & { class?: string }>,
) {
  const Primitive = Core.Label as Component<typeof props>
  return <Primitive {...props} class={'ui-label ' + (props.class ?? '')} />
}

export function RadioGroupItemLabel<T extends ValidComponent = 'label'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupItemLabelProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ItemLabel as Component<typeof props>
  return <Primitive {...props} class={'ui-label ' + (props.class ?? '')} />
}

export function RadioGroupDescription<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupDescriptionProps & { class?: string }
  >,
) {
  const Primitive = Core.Description as Component<typeof props>
  return <Primitive {...props} class={'ui-help ' + (props.class ?? '')} />
}

export function RadioGroupItemDescription<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupItemDescriptionProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ItemDescription as Component<typeof props>
  return <Primitive {...props} class={'ui-help ' + (props.class ?? '')} />
}

export function RadioGroupErrorMessage<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.RadioGroupErrorMessageProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ErrorMessage as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-field-error ' + (props.class ?? '')} />
  )
}

export const RadioGroup = Object.assign(RadioGroupRoot, {
  Root: RadioGroupRoot,
  Item: RadioGroupItem,
  ItemInput: RadioGroupItemInput,
  ItemControl: RadioGroupItemControl,
  ItemIndicator: RadioGroupItemIndicator,
  Label: RadioGroupLabel,
  ItemLabel: RadioGroupItemLabel,
  Description: RadioGroupDescription,
  ItemDescription: RadioGroupItemDescription,
  ErrorMessage: RadioGroupErrorMessage,
})
