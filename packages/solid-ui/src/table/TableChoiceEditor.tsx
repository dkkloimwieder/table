import { For } from 'solid-js'
import { NativeSelect } from '../components/NativeFields'

export type TableChoice = { value: string; label: string; disabled?: boolean }
export type TableChoiceEditorProps<Choice extends TableChoice = TableChoice> = {
  value: string
  disabled: boolean
  invalid: boolean
  label: string
  choices: ReadonlyArray<Choice>
  placeholder?: string
  editorId?: string
  ownerId?: string
  describedBy?: string
  onValueChange: (value: string) => void
  onFocus?: () => void
}
/** Presentation only. The application owns the edited value and its acceptance. */
export function TableChoiceEditor<Choice extends TableChoice = TableChoice>(
  props: TableChoiceEditorProps<Choice>,
) {
  return (
    <NativeSelect
      data-editor={props.editorId}
      aria-label={props.label}
      aria-describedby={props.describedBy}
      invalid={props.invalid}
      value={props.value}
      disabled={props.disabled}
      onFocus={() => props.onFocus?.()}
      onValueChange={props.onValueChange}
    >
      <option value="" disabled>
        {props.placeholder}
      </option>
      <For each={props.choices}>
        {(choice) => (
          <option value={choice.value} disabled={choice.disabled}>
            {choice.label}
          </option>
        )}
      </For>
    </NativeSelect>
  )
}
