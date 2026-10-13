import {
  callHandler,
  nativeEventProps,
  ownedElementEvents,
} from '@table/ui-core/events'
import {
  createContext,
  createSignal,
  createUniqueId,
  merge,
  omit,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js'
import type { JSX } from '@solidjs/web'

type FieldState = {
  controlId: () => string
  baseControlId: () => string
  disabled: () => boolean | undefined
  readonly: () => boolean | undefined
  required: () => boolean | undefined
  invalid: () => boolean | undefined
  describedBy: () => string | undefined
  registerControl: (id: () => string) => void
  registerDescription: (id: () => string, error: boolean) => void
}
const FieldContext = createContext<FieldState | null>(null)
export type FieldProps = JSX.HTMLAttributes<HTMLDivElement> & {
  controlId?: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  invalid?: boolean
}
export function Field(props: FieldProps) {
  const generated = `field-${createUniqueId()}`
  const [control, setControl] = createSignal<(() => string) | undefined>(
    undefined,
    { ownedWrite: true },
  )
  const [descriptions, setDescriptions] = createSignal<
    Array<{ id: () => string; error: boolean }>
  >([], { ownedWrite: true })
  const baseId = () => props.controlId ?? `${props.id || generated}-control`
  const state: FieldState = {
    controlId: () => control()?.() ?? baseId(),
    baseControlId: baseId,
    disabled: () => props.disabled,
    readonly: () => props.readonly,
    required: () => props.required,
    invalid: () => props.invalid,
    describedBy: () =>
      descriptions()
        .filter((entry) => !entry.error || props.invalid)
        .map((entry) => entry.id())
        .join(' ') || undefined,
    registerControl(id) {
      setControl(() => id)
      onCleanup(() => {
        if (untrack(control) === id) setControl(undefined)
      })
    },
    registerDescription(id, error) {
      const entry = { id, error }
      setDescriptions((old) => [...old, entry])
      onCleanup(() =>
        setDescriptions((old) => old.filter((item) => item !== entry)),
      )
    },
  }
  const attributes = omit(
    props,
    'controlId',
    'disabled',
    'readonly',
    'required',
    'invalid',
    'ref',
    ...nativeEventProps,
  )
  const events = ownedElementEvents(props)
  return (
    <FieldContext value={state}>
      <div
        {...attributes}
        id={props.id || generated}
        data-ui=""
        data-invalid={props.invalid ? '' : undefined}
        class={'ui-field ' + (props.class ?? '')}
        ref={[props.ref, events]}
      />
    </FieldContext>
  )
}

export type LabelProps = JSX.LabelHTMLAttributes<HTMLLabelElement>
export function Label(props: LabelProps) {
  const field = useContext(FieldContext)
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <label
      {...attributes}
      for={props.for ?? field?.controlId()}
      class={'ui-label ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type HelpTextProps = JSX.HTMLAttributes<HTMLDivElement>
export function HelpText(props: HelpTextProps) {
  const field = useContext(FieldContext)
  const generated = `help-${createUniqueId()}`
  const id = () => props.id || generated
  field?.registerDescription(id, false)
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      id={id()}
      class={'ui-help ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type FieldErrorProps = JSX.HTMLAttributes<HTMLDivElement>
export function FieldError(props: FieldErrorProps) {
  const field = useContext(FieldContext)
  const generated = `error-${createUniqueId()}`
  const id = () => props.id || generated
  field?.registerDescription(id, true)
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      id={id()}
      hidden={props.hidden ?? (field ? !field.invalid() : undefined)}
      class={'ui-field-error ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}

export type InputProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
  onValueChange?: (value: string, event: InputEvent) => void
}
export type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
  onValueChange?: (value: string, event: InputEvent) => void
}
type TextElement = HTMLInputElement | HTMLTextAreaElement
type TextProps<T extends TextElement> = JSX.HTMLAttributes<T> & {
  value?: InputProps['value'] | TextareaProps['value']
  disabled?: InputProps['disabled']
  readonly?: InputProps['readonly']
  required?: InputProps['required']
  invalid?: boolean
  onValueChange?: (value: string, event: InputEvent) => void
}
function textControl<T extends TextElement>(props: TextProps<T>) {
  const field = useContext(FieldContext)
  const generated = `input-${createUniqueId()}`
  const id = () => props.id || field?.baseControlId() || generated
  field?.registerControl(id)
  const attributes = omit(
    props,
    'ref',
    'invalid',
    'onValueChange',
    ...nativeEventProps,
  )
  const restoreValue = (element: T) => {
    const accepted = untrack(() => props.value)
    if (accepted != null && element.value !== String(accepted))
      element.value = String(accepted)
  }
  const events = ownedElementEvents(
    merge(props, {
      onInput(event: InputEvent & { currentTarget: T; target: T & Element }) {
        if (
          !callHandler(
            event,
            props.onInput as JSX.EventHandlerUnion<T, InputEvent>,
          )
        )
          props.onValueChange?.(event.currentTarget.value, event)
        if (props.onInput || props.onValueChange)
          restoreValue(event.currentTarget)
      },
      onChange(event: Event & { currentTarget: T; target: T & Element }) {
        callHandler(event, props.onChange as JSX.EventHandlerUnion<T, Event>)
        restoreValue(event.currentTarget)
      },
    }),
  )
  return {
    attributes,
    events,
    id,
    disabled: () => props.disabled ?? field?.disabled(),
    readonly: () => props.readonly ?? field?.readonly(),
    required: () => props.required ?? field?.required(),
    invalid: () => props.invalid ?? field?.invalid(),
    describedBy: () =>
      [field?.describedBy(), props['aria-describedby']]
        .filter(Boolean)
        .join(' ') || undefined,
  }
}
export function Input(props: InputProps) {
  const state = textControl<HTMLInputElement>(props)
  return (
    <input
      {...state.attributes}
      id={state.id()}
      disabled={state.disabled()}
      readonly={state.readonly()}
      required={state.required()}
      aria-invalid={
        props['aria-invalid'] ?? (state.invalid() ? 'true' : undefined)
      }
      aria-describedby={state.describedBy()}
      class={'ui-input ' + (props.class ?? '')}
      ref={[props.ref, state.events]}
    />
  )
}
export function Textarea(props: TextareaProps) {
  const state = textControl<HTMLTextAreaElement>(props)
  return (
    <textarea
      {...state.attributes}
      id={state.id()}
      disabled={state.disabled()}
      readonly={state.readonly()}
      required={state.required()}
      aria-invalid={
        props['aria-invalid'] ?? (state.invalid() ? 'true' : undefined)
      }
      aria-describedby={state.describedBy()}
      class={'ui-textarea ' + (props.class ?? '')}
      ref={[props.ref, state.events]}
    />
  )
}
export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>
export function Button(props: ButtonProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <button
      {...attributes}
      type={props.type ?? 'button'}
      class={'ui-button ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type IconButtonProps = ButtonProps & { 'aria-label': string }
export function IconButton(props: IconButtonProps) {
  return <Button {...props} class={'ui-icon-button ' + (props.class ?? '')} />
}
export type FieldSetProps = JSX.FieldsetHTMLAttributes<HTMLFieldSetElement>
export function FieldSet(props: FieldSetProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <fieldset
      {...attributes}
      data-ui=""
      class={'ui-field-set ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type InputGroupProps = JSX.HTMLAttributes<HTMLDivElement>
export function InputGroup(props: InputGroupProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      class={'ui-input-group ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
