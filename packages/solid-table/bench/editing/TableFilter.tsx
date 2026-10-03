import { For, Show, createUniqueId } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

export function TableFilter(props: {
  label: string
  clearLabel: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  search?: boolean
  hideLabel?: boolean
  choices?: ReadonlyArray<{ value: string; label: string }>
  inputRef?: (node: HTMLInputElement) => void
}) {
  const id = createUniqueId()
  let control!: HTMLInputElement | HTMLSelectElement
  function clear() {
    if (props.disabled) return
    control.focus({ preventScroll: true })
    props.onValueChange('')
  }
  return (
    <div class="table-filter">
      <label for={id} class={props.hideLabel ? 'sr-only' : undefined}>
        {props.label}
      </label>
      <div class="filter-input">
        <Show
          when={props.choices}
          fallback={
            <input
              id={id}
              type={props.search ? 'search' : 'text'}
              placeholder={props.search ? 'Search saved values…' : 'Contains…'}
              value={props.value}
              disabled={props.disabled}
              ref={[
                (node) => {
                  control = node
                  props.inputRef?.(node)
                },
                nativeEvents<HTMLInputElement>({
                  input: (event) => {
                    if (!props.disabled && !event.isComposing)
                      props.onValueChange(event.currentTarget.value)
                  },
                  compositionend: (event) => {
                    if (!props.disabled)
                      props.onValueChange(event.currentTarget.value)
                  },
                  keydown: (event) => {
                    if (event.key === 'Escape' && !event.isComposing) {
                      event.preventDefault()
                      event.stopPropagation()
                      clear()
                    }
                  },
                }),
              ]}
            />
          }
        >
          {(choices) => (
            <select
              id={id}
              value={props.value}
              disabled={props.disabled}
              ref={[
                (node) => {
                  control = node
                },
                nativeEvents<HTMLSelectElement>({
                  change: (event) => {
                    if (!props.disabled)
                      props.onValueChange(event.currentTarget.value)
                  },
                }),
              ]}
            >
              <option value="">All</option>
              <For each={choices()}>
                {(choice) => (
                  <option value={choice.value}>{choice.label}</option>
                )}
              </For>
            </select>
          )}
        </Show>
        <button
          type="button"
          class="clear-input"
          aria-label={props.clearLabel}
          title={props.clearLabel}
          disabled={props.disabled || !props.value}
          ref={nativeEvents({ click: clear })}
        >
          ×
        </button>
      </div>
    </div>
  )
}
