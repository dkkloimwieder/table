import { Select } from '@table/ui/select'
import { createMemo, untrack } from 'solid-js'
import type { TableChoiceEditorProps } from '@table/ui/table'
import type { FieldChoice } from '../editing/fields'

export function PopupPriorityEditor(props: TableChoiceEditorProps) {
  const options = createMemo(() => [...props.choices])
  return (
    <Select
      options={options()}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      placeholder={props.placeholder}
      value={options().find((option) => option.value === props.value) ?? null}
      disabled={props.disabled}
      validationState={props.invalid ? 'invalid' : 'valid'}
      onChange={(option) => props.onValueChange(option?.value ?? '')}
      itemComponent={(item) => (
        <Select.Item item={item.item}>
          <Select.ItemLabel>{item.item.rawValue.label}</Select.ItemLabel>
          <Select.ItemIndicator aria-hidden="true">✓</Select.ItemIndicator>
        </Select.Item>
      )}
    >
      <Select.Trigger
        data-editor={props.editorId}
        aria-label={props.label}
        aria-describedby={props.describedBy}
        aria-invalid={props.invalid ? 'true' : undefined}
        onFocus={() => untrack(() => props.onFocus?.())}
      >
        <Select.Value<FieldChoice>>
          {(state) => state.selectedOption().label}
        </Select.Value>
        <span aria-hidden="true">▾</span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content data-table-editor-owner={props.ownerId}>
          <Select.Listbox />
        </Select.Content>
      </Select.Portal>
    </Select>
  )
}
