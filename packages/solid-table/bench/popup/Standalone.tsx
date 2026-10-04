import { createSignal, flush } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { PopupPriorityEditor } from './PopupPriorityEditor'

export function Standalone() {
  const [value, setValue] = createSignal('normal')
  const [disabled, setDisabled] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  let changes = 0
  window.popupFixture = {
    configure(next) {
      if ('value' in next) setValue(next.value!)
      if ('disabled' in next) setDisabled(next.disabled!)
      if ('invalid' in next) setInvalid(next.invalid!)
      flush()
    },
    read: () => ({
      value: value(),
      disabled: disabled(),
      invalid: invalid(),
      changes,
    }),
  }
  return (
    <main>
      <h1>Popup compatibility</h1>
      <div class="standalone-controls">
        <button>Before popup</button>
        <PopupPriorityEditor
          value={value()}
          disabled={disabled()}
          invalid={invalid()}
          label="Priority"
          editorId="standalone/priority"
          ownerId="standalone"
          describedBy="standalone-message"
          onFocus={() => undefined}
          onValueChange={(value) => {
            changes++
            setValue(value)
          }}
        />
        <button>After popup</button>
      </div>
      <p id="standalone-message">{invalid() ? 'Choose a priority.' : ''}</p>
      <output>{value() || '(empty)'}</output>
      <button ref={nativeEvents({ click: () => setValue('low') })}>
        Set Low externally
      </button>
    </main>
  )
}

declare global {
  interface Window {
    popupFixture:
      | {
          configure: (next: {
            value?: string
            disabled?: boolean
            invalid?: boolean
          }) => void
          read: () => {
            value: string
            disabled: boolean
            invalid: boolean
            changes: number
          }
        }
      | undefined
  }
}
