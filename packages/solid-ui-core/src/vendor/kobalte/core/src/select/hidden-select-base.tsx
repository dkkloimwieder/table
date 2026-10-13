/*
 * Portions of this file are based on code from react-spectrum.
 * Apache License Version 2.0, Copyright 2020 Adobe.
 *
 * Credits to the React Spectrum team:
 * https://github.com/adobe/react-spectrum/blob/0a1d0cd4e1b2f77eed7c0ea08fce8a04f8de6921/packages/@react-aria/select/src/HiddenSelect.tsx
 */

import {
  For,
  createEffect,
  createSignal,
  omit,
  onCleanup,
  untrack,
} from 'solid-js'
import { callHandler, visuallyHiddenStyles } from '../../../utils/src/index.ts'
import { useFormControlContext } from '../form-control/index.ts'
import { isSameSelection } from '../selection/utils.ts'
import type { ComponentProps, JSX } from '@solidjs/web'

import type { Collection, CollectionNode } from '../primitives/index.ts'
import type { SelectionManager } from '../selection/index.ts'

// In Safari, the <select> cannot have `display: none` or `hidden` for autofill to work.
// In Firefox, there must be a <label> to identify the <select> whereas other browsers
// seem to identify it just by surrounding text.
// The solution is to use <VisuallyHidden> to hide the elements, which clips the elements to a
// 1px rectangle. In addition, we hide from screen readers with aria-hidden, and make the <select>
// non tabbable with tabIndex={-1}.
//
// In mobile browsers, there are next/previous buttons above the software keyboard for navigating
// between fields in a form. These only support native form inputs that are tabbable. In order to
// support those, an additional hidden input is used to marshall focus to the button. It is tabbable
// except when the button is focused, so that shift tab works properly to go to the actual previous
// input in the form. Using the <select> for this also works, but Safari on iOS briefly flashes
// the native menu on focus, so this isn't ideal. A font-size of 16px or greater is required to
// prevent Safari from zooming in on the input when it is focused.
//
// If the current interaction modality is null, then the user hasn't interacted with the page yet.
// In this case, we set the tabIndex to -1 on the input element so that automated accessibility
// checkers don't throw false-positives about focusable elements inside an aria-hidden parent.

export interface HiddenSelectBaseProps extends ComponentProps<'select'> {
  collection: Collection<CollectionNode>
  selectionManager: SelectionManager
  isOpen: boolean
  isMultiple: boolean
  isVirtualized: boolean
  focusTrigger: () => void
}

/**
 * Renders a hidden native `<select>` element, which can be used to support browser
 * form autofill, mobile form navigation, and native form submission.
 */
export function HiddenSelectBase(props: HiddenSelectBaseProps) {
  const [ref, setRef] = createSignal<HTMLSelectElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const others = omit(
    props,
    'ref',
    'onChange',
    'collection',
    'selectionManager',
    'isOpen',
    'isMultiple',
    'isVirtualized',
    'focusTrigger',
  )

  const formControlContext = useFormControlContext()

  let isInternalChangeEvent = false
  let disposed = false
  onCleanup(() => {
    disposed = true
  })

  const optionKeys = () => {
    const keys = props.isVirtualized
      ? []
      : [...props.collection.getKeys()].filter(
          (key) => props.collection.getItem(key)?.type === 'item',
        )
    return [...new Set([...props.selectionManager.selectedKeys(), ...keys])]
  }

  // Apply native selection after the browser processes replacement option nodes.
  createEffect(
    () => ({
      collection: props.collection,
      keys: props.selectionManager.selectedKeys(),
    }),
    ({ keys }, previous) => {
      const select = untrack(ref)
      if (!select) return
      const changed = previous && !isSameSelection(keys, previous.keys)
      queueMicrotask(() => {
        if (
          disposed ||
          !select.isConnected ||
          !untrack(() =>
            isSameSelection(keys, props.selectionManager.selectedKeys()),
          )
        )
          return
        for (const option of select.options)
          option.selected = keys.has(option.value)
        if (!keys.size && !select.multiple) select.value = ''
        if (!changed) return
        // Form listeners receive the new value. Internal events do not select it again.
        isInternalChangeEvent = true
        select.dispatchEvent(
          new Event('input', { bubbles: true, cancelable: true }),
        )
        select.dispatchEvent(
          new Event('change', { bubbles: true, cancelable: true }),
        )
      })
    },
  )

  // If virtualized, only render the selected options in the hidden <select> so the value can be submitted to a server.
  // Otherwise, render all options so that browser autofill will work.
  return (
    <div style={visuallyHiddenStyles} aria-hidden="true">
      <input
        type="text"
        tabindex={props.selectionManager.isFocused() || props.isOpen ? -1 : 0}
        style={{ 'font-size': '16px' }}
        required={formControlContext.isRequired()}
        disabled={formControlContext.isDisabled()}
        readonly={formControlContext.isReadOnly()}
        onFocus={() => props.focusTrigger()}
      />
      <select
        ref={[setRef, props.ref]}
        tabindex={-1}
        multiple={props.isMultiple}
        name={formControlContext.name()}
        required={formControlContext.isRequired()}
        disabled={formControlContext.isDisabled()}
        value={props.selectionManager.firstSelectedKey() ?? ''}
        onChange={(e) => {
          callHandler(
            e as Event & { currentTarget: HTMLSelectElement; target: Element },
            props.onChange as
              JSX.EventHandlerUnion<HTMLSelectElement, Event> | undefined,
          )

          // Prevent internally fired change event to update the selection
          // which would result in an infinite loop.
          if (!isInternalChangeEvent) {
            // enable form autofill
            props.selectionManager.setSelectedKeys(new Set([e.target.value]))
          }

          isInternalChangeEvent = false
        }}
        {...others}
      >
        <option />
        <For each={optionKeys()}>
          {(key) => (
            <option
              value={key}
              selected={props.selectionManager.isSelected(key)}
            >
              {props.collection.getItem(key)?.textValue ?? key}
            </option>
          )}
        </For>
      </select>
    </div>
  )
}
