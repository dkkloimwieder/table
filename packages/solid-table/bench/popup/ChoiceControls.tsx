import { Combobox, Select, uiScope } from '@table/ui'
import { createSignal, flush, onCleanup } from 'solid-js'
import { nativeEvents } from '@table/ui/events'
import type { JSX } from '@solidjs/web'

type Option = { id: string; label: string; disabled?: boolean }
const initial: Array<Option> = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta', label: 'Beta', disabled: true },
  { id: 'gamma', label: 'Gamma' },
]
function CustomItem(
  props: JSX.HTMLAttributes<HTMLDivElement> & { marker: string },
) {
  return <div {...props} data-custom-item={props.marker} />
}
export function ChoiceControls() {
  const [options, setOptions] = createSignal(initial)
  const [value, setValue] = createSignal<Option | null>(initial[0]!)
  const [query, setQuery] = createSignal('Alpha')
  const [disabled, setDisabled] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [acceptSearch, setAcceptSearch] = createSignal(true)
  let changes = 0
  let searches = 0
  let pages = 0
  let cleanups = 0
  onCleanup(() => {
    cleanups++
  })
  const change = (next: Option | null) => {
    changes++
    setValue(next)
    setQuery(next?.label ?? '')
  }
  const nextPage = () => {
    pages++
    const id = pages === 1 ? 'delta' : `page-${pages}`
    const label = pages === 1 ? 'Delta' : `Result ${pages}`
    setOptions((old) =>
      old.some((option) => option.id === id) ? old : [...old, { id, label }],
    )
  }
  window.choiceFixture = {
    configure(next) {
      if (next.options) setOptions(next.options)
      if ('value' in next) setValue(next.value ?? null)
      if ('query' in next) setQuery(next.query!)
      if ('disabled' in next) setDisabled(next.disabled!)
      if ('invalid' in next) setInvalid(next.invalid!)
      if ('loading' in next) setLoading(next.loading!)
      if ('acceptSearch' in next) setAcceptSearch(next.acceptSearch!)
      flush()
    },
    read: () => ({
      value: value()?.id ?? null,
      optionKeys: options().map((option) => option.id),
      query: query(),
      changes,
      searches,
      pages,
      cleanups,
    }),
  }
  return (
    <main {...uiScope()} data-ui-portal-root="">
      <h1>Generic choices</h1>
      <form>
        <Select
          options={options()}
          value={value()}
          optionValue="id"
          optionTextValue="label"
          optionDisabled="disabled"
          onChange={change}
          disabled={disabled()}
          name="category"
          validationState={invalid() ? 'invalid' : 'valid'}
          itemComponent={(item) => (
            <Select.Item as={CustomItem} marker="select" item={item.item}>
              <Select.ItemLabel>{item.item.rawValue.label}</Select.ItemLabel>
            </Select.Item>
          )}
        >
          <Select.Label>Selected category</Select.Label>
          <Select.HiddenSelect />
          <Select.Trigger>
            <Select.Value<Option>>
              {(state) => state.selectedOption().label}
            </Select.Value>
          </Select.Trigger>
          <Select.Description>Choose a category.</Select.Description>
          <Select.ErrorMessage>Category is required.</Select.ErrorMessage>
          <Select.Portal>
            <Select.Content
              footer={
                <button type="button" ref={nativeEvents({ click: nextPage })}>
                  More select options
                </button>
              }
            >
              <Select.Listbox />
            </Select.Content>
          </Select.Portal>
        </Select>
        <Combobox
          options={options()}
          value={value()}
          inputValue={query()}
          onInputChange={(text) => {
            searches++
            if (acceptSearch()) setQuery(text)
          }}
          onChange={change}
          optionValue="id"
          optionTextValue="label"
          optionLabel="label"
          optionDisabled="disabled"
          defaultFilter={() => true}
          disabled={disabled()}
          validationState={invalid() ? 'invalid' : 'valid'}
          itemComponent={(item) => (
            <Combobox.Item as="div" item={item.item}>
              <Combobox.ItemLabel>
                {item.item.rawValue.label}
              </Combobox.ItemLabel>
            </Combobox.Item>
          )}
        >
          <Combobox.Label>Find category</Combobox.Label>
          <Combobox.Control>
            <Combobox.Input />
            <Combobox.Trigger aria-label="Show categories">
              Open
            </Combobox.Trigger>
          </Combobox.Control>
          <Combobox.Description>
            Results come from the application.
          </Combobox.Description>
          <Combobox.ErrorMessage>Choose a result.</Combobox.ErrorMessage>
          <Combobox.Portal>
            <Combobox.Content
              status={
                loading()
                  ? 'Loading results'
                  : !options().length
                    ? 'No results'
                    : undefined
              }
              footer={
                <button type="button" ref={nativeEvents({ click: nextPage })}>
                  More search options
                </button>
              }
            >
              <Combobox.Listbox />
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox>
        <button type="button" ref={nativeEvents({ click: () => change(null) })}>
          Clear selection
        </button>
        <button type="submit">Submit choices</button>
      </form>
      <output aria-label="Choice value">{value()?.id ?? '(empty)'}</output>
    </main>
  )
}
declare global {
  interface Window {
    choiceFixture: {
      configure: (next: {
        options?: Array<Option>
        value?: Option | null
        query?: string
        disabled?: boolean
        invalid?: boolean
        loading?: boolean
        acceptSearch?: boolean
      }) => void
      read: () => {
        value: string | null
        optionKeys: Array<string>
        query: string
        changes: number
        searches: number
        pages: number
        cleanups: number
      }
      stop?: () => void
    }
  }
}
