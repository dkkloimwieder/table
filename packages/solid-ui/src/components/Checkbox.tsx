import * as Core from '@table/ui-core/checkbox'
import type { Component } from 'solid-js'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { PolymorphicProps } from '@table/ui-core/polymorphic'

export function CheckboxRoot<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.CheckboxRootProps<T> & { class?: string }>,
) {
  const Primitive = Core.Root as Component<typeof props>
  return (
    <Primitive
      {...props}
      data-ui=""
      class={'ui-toggle ui-checkbox ' + (props.class ?? '')}
    />
  )
}

export function CheckboxInput<T extends ValidComponent = 'input'>(
  props: PolymorphicProps<T, Core.CheckboxInputProps<T> & { class?: string }>,
) {
  const Primitive = Core.Input as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-toggle-input ' + (props.class ?? '')} />
  )
}

export function CheckboxControl<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, Core.CheckboxControlProps<T> & { class?: string }>,
) {
  const Primitive = Core.Control as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-check-control ' + (props.class ?? '')} />
  )
}

export function CheckboxIndicator<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.CheckboxIndicatorProps<T> & { class?: string; children?: JSX.Element }
  >,
) {
  const Primitive = Core.Indicator as Component<typeof props>
  const context = Core.useCheckboxContext()
  return (
    <Primitive {...props} class={'ui-check-indicator ' + (props.class ?? '')}>
      {props.children ?? (
        <svg class="ui-check-mark" viewBox="0 0 16 16" aria-hidden="true">
          <path d={context.indeterminate() ? 'M3 8h10' : 'm2 8 4 4 8-9'} />
        </svg>
      )}
    </Primitive>
  )
}

export function CheckboxLabel<T extends ValidComponent = 'label'>(
  props: PolymorphicProps<T, Core.CheckboxLabelProps<T> & { class?: string }>,
) {
  const Primitive = Core.Label as Component<typeof props>
  return <Primitive {...props} class={'ui-label ' + (props.class ?? '')} />
}

export function CheckboxDescription<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.CheckboxDescriptionProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.Description as Component<typeof props>
  return <Primitive {...props} class={'ui-help ' + (props.class ?? '')} />
}

export function CheckboxErrorMessage<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<
    T,
    Core.CheckboxErrorMessageProps<T> & { class?: string }
  >,
) {
  const Primitive = Core.ErrorMessage as Component<typeof props>
  return (
    <Primitive {...props} class={'ui-field-error ' + (props.class ?? '')} />
  )
}

export const Checkbox = Object.assign(CheckboxRoot, {
  Root: CheckboxRoot,
  Input: CheckboxInput,
  Control: CheckboxControl,
  Indicator: CheckboxIndicator,
  Label: CheckboxLabel,
  Description: CheckboxDescription,
  ErrorMessage: CheckboxErrorMessage,
})
