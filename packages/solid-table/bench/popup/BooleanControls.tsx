import { Button, Checkbox, RadioGroup, Switch, uiScope } from '@table/ui'
import { Show, createSignal, flush, onCleanup } from 'solid-js'
import { nativeEvents } from '@table/ui/events'

export function BooleanControls() {
  const [checked, setChecked] = createSignal(false)
  const [switched, setSwitched] = createSignal(false)
  const [selected, setSelected] = createSignal('a')
  const [accept, setAccept] = createSignal(true)
  const [disabled, setDisabled] = createSignal(false)
  const [readOnly, setReadOnly] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [indeterminate, setIndeterminate] = createSignal(false)
  const [help, setHelp] = createSignal(true)
  const [prevent, setPrevent] = createSignal(false)
  const [preventReset, setPreventReset] = createSignal(false)
  const [named, setNamed] = createSignal(true)
  let changes = 0
  let submits = 0
  let cleanups = 0
  let refs = 0
  onCleanup(() => {
    cleanups++
  })
  window.booleanFixture = {
    configure(next) {
      if ('checked' in next) setChecked(next.checked!)
      if ('switched' in next) setSwitched(next.switched!)
      if ('selected' in next) setSelected(next.selected!)
      if ('accept' in next) setAccept(next.accept!)
      if ('disabled' in next) setDisabled(next.disabled!)
      if ('readOnly' in next) setReadOnly(next.readOnly!)
      if ('invalid' in next) setInvalid(next.invalid!)
      if ('indeterminate' in next) setIndeterminate(next.indeterminate!)
      if ('help' in next) setHelp(next.help!)
      if ('prevent' in next) setPrevent(next.prevent!)
      if ('preventReset' in next) setPreventReset(next.preventReset!)
      if ('named' in next) setNamed(next.named!)
      flush()
    },
    read: () => ({
      checked: checked(),
      switched: switched(),
      selected: selected(),
      changes,
      submits,
      cleanups,
      refs,
    }),
  }
  const inputRef = () => {
    refs++
  }
  return (
    <main {...uiScope()}>
      <h1>Boolean and radio controls</h1>
      <form
        ref={nativeEvents<HTMLFormElement>({
          reset(event) {
            if (preventReset()) event.preventDefault()
          },
          submit(event) {
            event.preventDefault()
            submits++
          },
        })}
      >
        <Checkbox
          id="checkbox"
          name="choice"
          value="yes"
          checked={checked()}
          indeterminate={indeterminate()}
          disabled={disabled()}
          readOnly={readOnly()}
          validationState={invalid() ? 'invalid' : 'valid'}
          onChange={(value) => {
            changes++
            if (accept()) setChecked(value)
          }}
        >
          <Checkbox.Input ref={inputRef} />
          <Checkbox.Control
            data-control="checkbox"
            onClick={(event) => {
              if (prevent()) event.preventDefault()
            }}
          >
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Label>Include details</Checkbox.Label>
          <Show when={help()}>
            <Checkbox.Description id="checkbox-help">
              Include optional details.
            </Checkbox.Description>
          </Show>
          <Checkbox.ErrorMessage id="checkbox-error">
            Choose the required value.
          </Checkbox.ErrorMessage>
        </Checkbox>
        <Switch
          id="switch"
          name="enabled"
          value="yes"
          checked={switched()}
          disabled={disabled()}
          readOnly={readOnly()}
          validationState={invalid() ? 'invalid' : 'valid'}
          onChange={(value) => {
            changes++
            if (accept()) setSwitched(value)
          }}
        >
          <Switch.Input ref={inputRef} />
          <Switch.Control data-control="switch">
            <Switch.Thumb />
          </Switch.Control>
          <Switch.Label>Enable updates</Switch.Label>
          <Switch.Description id="switch-help">
            Receive updates.
          </Switch.Description>
          <Switch.ErrorMessage id="switch-error">
            The application rejected this choice.
          </Switch.ErrorMessage>
        </Switch>
        <RadioGroup
          id="radio"
          name={named() ? 'plan' : undefined}
          value={selected()}
          disabled={disabled()}
          readOnly={readOnly()}
          validationState={invalid() ? 'invalid' : 'valid'}
          onChange={(value) => {
            changes++
            if (accept()) setSelected(value)
          }}
        >
          <RadioGroup.Label>Plan</RadioGroup.Label>
          <RadioGroup.Description id="radio-help">
            Choose one plan.
          </RadioGroup.Description>
          <RadioGroup.ErrorMessage id="radio-error">
            Choose an available plan.
          </RadioGroup.ErrorMessage>
          <RadioGroup.Item value="a">
            <RadioGroup.ItemInput ref={inputRef} />
            <RadioGroup.ItemControl data-control="a">
              <RadioGroup.ItemIndicator />
            </RadioGroup.ItemControl>
            <RadioGroup.ItemLabel>Plan A</RadioGroup.ItemLabel>
            <RadioGroup.ItemDescription id="plan-a-help">
              First plan.
            </RadioGroup.ItemDescription>
          </RadioGroup.Item>
          <RadioGroup.Item value="disabled" disabled>
            <RadioGroup.ItemInput />
            <RadioGroup.ItemControl data-control="disabled">
              <RadioGroup.ItemIndicator />
            </RadioGroup.ItemControl>
            <RadioGroup.ItemLabel>Unavailable plan</RadioGroup.ItemLabel>
          </RadioGroup.Item>
          <RadioGroup.Item value="b">
            <RadioGroup.ItemInput />
            <RadioGroup.ItemControl data-control="b">
              <RadioGroup.ItemIndicator />
            </RadioGroup.ItemControl>
            <RadioGroup.ItemLabel>Plan B</RadioGroup.ItemLabel>
          </RadioGroup.Item>
        </RadioGroup>
        <Checkbox id="uncontrolled" name="default" defaultChecked>
          <Checkbox.Input />
          <Checkbox.Control>
            <Checkbox.Indicator>
              <span data-custom-checkbox-mark="">★</span>
            </Checkbox.Indicator>
          </Checkbox.Control>
          <Checkbox.Label>Default choice</Checkbox.Label>
        </Checkbox>
        <Button type="reset">Reset form</Button>
        <Button type="submit">Submit form</Button>
      </form>
    </main>
  )
}
declare global {
  interface Window {
    booleanFixture: {
      configure: (next: {
        checked?: boolean
        switched?: boolean
        selected?: string
        accept?: boolean
        disabled?: boolean
        readOnly?: boolean
        invalid?: boolean
        indeterminate?: boolean
        help?: boolean
        prevent?: boolean
        preventReset?: boolean
        named?: boolean
      }) => void
      read: () => {
        checked: boolean
        switched: boolean
        selected: string
        changes: number
        submits: number
        cleanups: number
        refs: number
      }
      stop?: () => void
    }
  }
}
