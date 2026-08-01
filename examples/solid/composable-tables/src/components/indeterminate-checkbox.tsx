/**
 * Indeterminate checkbox used by the row-selection column
 * (both the select-all header and the per-row select cell).
 *
 * Solid handles reactivity natively, so `checked`/`indeterminate` are read
 * from props (kept reactive by the callers) and the indeterminate DOM property
 * is synced via a ref in createEffect: the tracked compute half reads the
 * props, the untracked effect half performs the DOM write.
 */
import { createEffect } from 'solid-js'

export function IndeterminateCheckbox(props: {
  indeterminate?: boolean
  class?: string
  checked?: boolean
  disabled?: boolean
  onChange?: (event: Event) => void
  onClick?: (event: MouseEvent) => void
}) {
  let ref: HTMLInputElement | undefined

  createEffect(
    () => ({ indeterminate: props.indeterminate, checked: props.checked }),
    ({ indeterminate, checked }) => {
      if (typeof indeterminate === 'boolean' && ref) {
        ref.indeterminate = !checked && indeterminate
      }
    },
  )

  return (
    <input
      type="checkbox"
      ref={ref}
      class={props.class ?? ''}
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
      onClick={props.onClick}
    />
  )
}
