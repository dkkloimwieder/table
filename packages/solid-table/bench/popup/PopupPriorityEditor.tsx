import { Select } from '@kobalte/core/select'
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js'
import type { PriorityEditorProps } from '../editing/TablePriorityEditor'
import type { FieldChoice } from '../editing/fields'
import './style.css'

export function PopupPriorityEditor(props: PriorityEditorProps) {
  const options = createMemo(() => [...props.choices])
  let trigger: HTMLButtonElement | undefined
  let content: HTMLDivElement | undefined
  let disposed = false
  let restoreFocus = true
  const [open, setOpen] = createSignal(false)
  onCleanup(() => {
    disposed = true
  })
  createEffect(
    () => props.disabled,
    (disabled) => {
      if (disabled) setOpen(false)
    },
  )
  return (
    <Select
      options={options()}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      placeholder={props.placeholder}
      value={options().find((option) => option.value === props.value)}
      disabled={props.disabled}
      open={open()}
      validationState={props.invalid ? 'invalid' : 'valid'}
      onChange={(option) => props.onValueChange(option?.value ?? '')}
      onOpenChange={(value) => {
        if (value) restoreFocus = true
        setOpen(value)
      }}
      itemComponent={(item) => (
        <Select.Item item={item.item} class="popup-option">
          <Select.ItemLabel>{item.item.rawValue.label}</Select.ItemLabel>
          <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Trigger
        ref={(element) => {
          trigger = element
        }}
        class="popup-trigger"
        data-editor={props.editorId}
        aria-label={props.label}
        aria-describedby={props.describedBy}
        aria-invalid={props.invalid ? 'true' : undefined}
        onFocus={() => untrack(() => props.onFocus())}
      >
        <Select.Value<FieldChoice>>
          {(state) => state.selectedOption().label}
        </Select.Value>
        <span aria-hidden="true">▾</span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          ref={(element) => {
            content = element
          }}
          class="popup-content"
          data-table-editor-owner={props.ownerId}
          onPointerDownOutside={() => {
            restoreFocus = false
          }}
          onFocusOutside={() => {
            restoreFocus = false
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Tab') return
            restoreFocus = false
            setOpen(false)
            // Let the browser perform Tab from the trigger's position in the
            // document, rather than from the portal at the end of the body.
            trigger?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            // Closing a popup can dispatch focus from an effect cleanup.
            // This imperative event uses a snapshot and never subscribes.
            untrack(() => {
              if (
                disposed ||
                !restoreFocus ||
                !trigger?.isConnected ||
                trigger.disabled
              )
                return
              if (
                document.activeElement === document.body ||
                content?.contains(document.activeElement)
              )
                trigger.focus({ preventScroll: true })
            })
          }}
        >
          <Select.Listbox class="popup-listbox" />
        </Select.Content>
      </Select.Portal>
    </Select>
  )
}
