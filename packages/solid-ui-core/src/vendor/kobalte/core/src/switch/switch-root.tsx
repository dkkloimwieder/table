/*
 * Portions of this file are based on code from react-spectrum.
 * Apache License Version 2.0, Copyright 2020 Adobe.
 *
 * Credits to the React Spectrum team:
 * https://github.com/adobe/react-spectrum/blob/3155e4db7eba07cf06525747ce0adb54c1e2a086/packages/@react-aria/switch/src/useSwitch.ts
 */

import { access } from '@solid-primitives/utils'
import {
  children,
  createMemo,
  createSignal,
  createUniqueId,
  merge,
  omit,
} from 'solid-js'
import { createNativeFormResetListener } from '../../../../../formReset.ts'
import { callHandler } from '../../../utils/src/index.ts'
import {
  FORM_CONTROL_PROP_NAMES,
  FormControlContext,
  createFormControl,
} from '../form-control/index.ts'
import { Polymorphic } from '../polymorphic/index.tsx'
import { createToggleState } from '../primitives/index.ts'
import { SwitchContext } from './switch-context.tsx'
import type { Accessor, Ref } from 'solid-js'
import type { ValidationState } from '../../../utils/src/index.ts'
import type { FormControlDataSet } from '../form-control/index.ts'
import type { JSX, ValidComponent } from '@solidjs/web'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { SwitchContextValue, SwitchDataSet } from './switch-context.tsx'

interface SwitchRootState {
  /** Whether the switch is checked or not. */
  checked: Accessor<boolean>
}

export interface SwitchRootOptions {
  /** The controlled checked state of the switch. */
  checked?: boolean

  /**
   * The default checked state when initially rendered.
   * Useful when you do not need to control the checked state.
   */
  defaultChecked?: boolean

  /** Event handler called when the checked state of the switch changes. */
  onChange?: (isChecked: boolean) => void

  /**
   * The value of the switch, used when submitting an HTML form.
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#htmlattrdefvalue).
   */
  value?: string

  /**
   * The name of the switch, used when submitting an HTML form.
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#htmlattrdefname).
   */
  name?: string

  /** Whether the switch should display its "valid" or "invalid" visual styling. */
  validationState?: ValidationState

  /** Whether the user must check the switch before the owning form can be submitted. */
  required?: boolean

  /** Whether the switch is disabled. */
  disabled?: boolean

  /** Whether the switch is read only. */
  readOnly?: boolean

  /**
   * The children of the switch.
   * Can be a `JSX.Element` or a _render prop_ for having access to the internal state.
   */
  children?: JSX.Element | ((state: SwitchRootState) => JSX.Element)
}

export interface SwitchRootCommonProps<T extends HTMLElement = HTMLElement> {
  id: string
  ref: Ref<T>
  onPointerDown: JSX.EventHandlerUnion<T, PointerEvent>
}

export interface SwitchRootRenderProps
  extends SwitchRootCommonProps, SwitchDataSet, FormControlDataSet {
  role: 'group'
  children: JSX.Element
}

export type SwitchRootProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = SwitchRootOptions & Partial<SwitchRootCommonProps<ElementOf<T>>>

/**
 * A control that allows users to choose one of two values: on or off.
 */
export function SwitchRoot<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, SwitchRootProps<T>>,
) {
  const [ref, setRef] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const defaultId = `switch-${createUniqueId()}`

  const mergedProps = merge(
    {
      value: 'on',
      id: defaultId,
    },
    props as SwitchRootProps,
  )

  const others = omit(
    mergedProps,
    'ref',
    'children',
    'value',
    'checked',
    'defaultChecked',
    'onChange',
    'onPointerDown',
    ...FORM_CONTROL_PROP_NAMES,
  )

  const [inputRef, setInputRef] = createSignal<HTMLInputElement | undefined>(
    undefined,
    { ownedWrite: true },
  )
  const [isFocused, setIsFocused] = createSignal(false)

  const { formControlContext } = createFormControl(mergedProps)

  const state = createToggleState({
    isSelected: () => mergedProps.checked,
    defaultIsSelected: () => mergedProps.defaultChecked,
    onSelectedChange: (selected) => mergedProps.onChange?.(selected),
    isDisabled: () => formControlContext.isDisabled(),
    isReadOnly: () => formControlContext.isReadOnly(),
  })

  createNativeFormResetListener(ref, () => {
    state.setIsSelected(mergedProps.defaultChecked ?? false)
    const node = inputRef()
    if (node) {
      node.checked = state.isSelected()
    }
  })

  const onPointerDown: JSX.EventHandlerUnion<HTMLElement, PointerEvent> = (
    e,
  ) => {
    callHandler(e, mergedProps.onPointerDown)

    // For consistency with native, prevent the input blurs on pointer down.
    if (isFocused()) {
      e.preventDefault()
    }
  }

  const dataset: Accessor<SwitchDataSet> = createMemo(() => ({
    'data-checked': state.isSelected() ? '' : undefined,
  }))

  const context: SwitchContextValue = {
    value: () => mergedProps.value,
    dataset,
    checked: () => state.isSelected(),
    inputRef,
    generateId: (suffix: string) => `${access(mergedProps.id)}-${suffix}`,
    toggle: () => state.toggle(),
    setIsChecked: (isChecked) => state.setIsSelected(isChecked),
    setIsFocused,
    setInputRef,
  }

  return (
    <FormControlContext value={formControlContext}>
      <SwitchContext value={context}>
        <Polymorphic<SwitchRootRenderProps>
          as="div"
          ref={[setRef, mergedProps.ref]}
          role="group"
          id={access(mergedProps.id)}
          onPointerDown={onPointerDown}
          {...formControlContext.dataset()}
          {...dataset()}
          {...others}
        >
          <SwitchRootChild state={context}>
            {mergedProps.children}
          </SwitchRootChild>
        </Polymorphic>
      </SwitchContext>
    </FormControlContext>
  )
}

interface SwitchRootChildProps extends Pick<SwitchRootOptions, 'children'> {
  state: SwitchRootState
}

function SwitchRootChild(props: SwitchRootChildProps) {
  const resolvedChildren = children(() => {
    const body = props.children
    return typeof body === 'function' ? body(props.state) : body
  })

  return <>{resolvedChildren()}</>
}
