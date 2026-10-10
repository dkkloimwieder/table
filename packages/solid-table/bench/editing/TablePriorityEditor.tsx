import { For } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import type { FieldChoice } from './fields'

export type PriorityEditorProps = {
  value: string
  disabled: boolean
  invalid: boolean
  label: string
  choices: ReadonlyArray<FieldChoice>
  placeholder?: string
  editorId: string
  ownerId: string
  describedBy: string
  onValueChange: (value: string) => void
  onFocus: () => void
}

export function TablePriorityEditor(props: PriorityEditorProps) {
  return (
    <select
      data-editor={props.editorId}
      aria-label={props.label}
      aria-describedby={props.describedBy}
      aria-invalid={props.invalid ? 'true' : undefined}
      value={props.value}
      disabled={props.disabled}
      ref={nativeEvents<HTMLSelectElement>({
        focus: () => props.onFocus(),
        change: (event) => props.onValueChange(event.currentTarget.value),
      })}
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
    </select>
  )
}
