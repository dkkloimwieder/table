import { uiScope } from '@table/ui'
import { Combobox } from '@table/ui-core/combobox'
import { createSignal } from 'solid-js'

const options = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta' },
  { id: 'gamma', label: 'Gamma' },
]

/** A source-wiring check, before the generic styled choice controls. */
export function ComboboxSmoke() {
  let input: HTMLInputElement | undefined
  const [value, setValue] = createSignal<(typeof options)[number] | null>(null)
  return (
    <main data-ui-portal-root="" {...uiScope()}>
      <h1>Combobox source</h1>
      <Combobox
        options={options}
        optionValue="id"
        optionTextValue="label"
        optionLabel="label"
        value={value()}
        onChange={setValue}
        itemComponent={(props) => (
          <Combobox.Item item={props.item} class="popup-option">
            <Combobox.ItemLabel>{props.item.rawValue.label}</Combobox.ItemLabel>
          </Combobox.Item>
        )}
      >
        <Combobox.Label>Category</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input
            ref={(node) => {
              input = node
            }}
          />
          <Combobox.Trigger aria-label="Show categories">Open</Combobox.Trigger>
        </Combobox.Control>
        <Combobox.Portal
          mount={
            input?.closest<HTMLElement>('[data-ui-portal-root]') ?? undefined
          }
        >
          <Combobox.Content class="popup-content">
            <Combobox.Listbox class="popup-listbox" />
          </Combobox.Content>
        </Combobox.Portal>
      </Combobox>
      <output aria-label="Selected category">{value()?.id ?? '(empty)'}</output>
      <button>After combobox</button>
    </main>
  )
}
