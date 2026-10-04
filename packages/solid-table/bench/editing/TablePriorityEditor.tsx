import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

export type PriorityEditorProps = {
  value: string
  disabled: boolean
  invalid: boolean
  label: string
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
        Choose priority
      </option>
      <option value="low">Low</option>
      <option value="normal">Normal</option>
      <option value="high">High</option>
    </select>
  )
}
