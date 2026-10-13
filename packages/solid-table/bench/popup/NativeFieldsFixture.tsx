import {
  Button,
  Field,
  FieldError,
  FieldSet,
  HelpText,
  IconButton,
  Input,
  InputGroup,
  Label,
  NativeSelect,
  Textarea,
  uiScope,
} from '@table/ui'
import { Show, createSignal, flush, onCleanup } from 'solid-js'
import { nativeEvents } from '@table/ui/events'

export function NativeFieldsFixture() {
  const [text, setText] = createSignal('Initial')
  const [choice, setChoice] = createSignal('alpha')
  const [preventChoice, setPreventChoice] = createSignal(false)
  const [notes, setNotes] = createSignal('Notes')
  const [blurText, setBlurText] = createSignal('Blur initial')
  const [disabled, setDisabled] = createSignal(false)
  const [readonly, setReadonly] = createSignal(false)
  const [invalid, setInvalid] = createSignal(false)
  const [help, setHelp] = createSignal(true)
  const [accept, setAccept] = createSignal(true)
  const [id, setId] = createSignal('account-name')
  let submits = 0
  let actions = 0
  let refs = 0
  let cleanups = 0
  let keyups = 0
  let compositions = 0
  let input: HTMLInputElement | undefined
  let textarea: HTMLTextAreaElement | undefined
  onCleanup(() => {
    cleanups++
  })
  window.nativeFieldFixture = {
    configure(next) {
      if ('choice' in next) setChoice(next.choice!)
      if ('preventChoice' in next) setPreventChoice(next.preventChoice!)
      if ('text' in next) setText(next.text!)
      if ('blurText' in next) setBlurText(next.blurText!)
      if ('disabled' in next) setDisabled(next.disabled!)
      if ('readonly' in next) setReadonly(next.readonly!)
      if ('invalid' in next) setInvalid(next.invalid!)
      if ('help' in next) setHelp(next.help!)
      if ('accept' in next) setAccept(next.accept!)
      if ('id' in next) setId(next.id!)
      flush()
    },
    read: () => ({
      choice: choice(),
      text: text(),
      notes: notes(),
      blurText: blurText(),
      submits,
      actions,
      refs,
      cleanups,
      keyups,
      compositions,
      refConnected: Boolean(input?.isConnected && textarea?.isConnected),
    }),
  }
  return (
    <main {...uiScope()}>
      <h1>Native fields</h1>
      <form
        ref={nativeEvents<HTMLFormElement>({
          submit: (event) => {
            event.preventDefault()
            submits++
          },
        })}
      >
        <FieldSet disabled={disabled()}>
          <legend>Account</legend>
          <Field invalid={invalid()} readonly={readonly()} required>
            <Label>Account name</Label>
            <InputGroup>
              <span aria-hidden="true">@</span>
              <Input
                id={id()}
                name="name"
                value={text()}
                aria-describedby="extra-help"
                onValueChange={(value) => {
                  if (accept()) setText(value)
                }}
                onKeyUp={() => {
                  keyups++
                }}
                onCompositionEnd={() => {
                  compositions++
                }}
                ref={(node) => {
                  input = node
                  refs++
                }}
              />
              <IconButton
                aria-label="Reset name"
                onClick={() => setText('Initial')}
              >
                ↺
              </IconButton>
            </InputGroup>
            <Show when={help()}>
              <HelpText id="name-help">Use a display name.</HelpText>
            </Show>
            <FieldError id="name-error">
              The application rejected this name.
            </FieldError>
          </Field>
          <Field readonly={readonly()}>
            <Label>Notes</Label>
            <Textarea
              name="notes"
              value={notes()}
              onValueChange={setNotes}
              rows={3}
              ref={(node) => {
                textarea = node
                refs++
              }}
            />
            <HelpText>Additional details.</HelpText>
          </Field>
          <Field>
            <Label>Uncontrolled</Label>
            <Input name="uncontrolled" defaultValue="Default" />
          </Field>
          <Field invalid={invalid()} required>
            <Label>Native choice</Label>
            <NativeSelect
              name="choice"
              value={choice()}
              onValueChange={(value) => {
                if (accept()) setChoice(value)
              }}
              onChange={(event) => {
                if (preventChoice()) event.preventDefault()
              }}
            >
              <option value="alpha">Alpha</option>
              <option value="beta">Beta</option>
              <option value="disabled" disabled>
                Disabled
              </option>
            </NativeSelect>
            <HelpText id="choice-help">Choose a value.</HelpText>
            <FieldError id="choice-error">
              The application rejected this value.
            </FieldError>
          </Field>
          <Input
            aria-label="Commit on blur"
            value={blurText()}
            onChange={(event) => {
              if (accept()) setBlurText(event.currentTarget.value)
            }}
          />
          <Button
            onClick={() => {
              actions++
            }}
          >
            Local action
          </Button>
          <Button type="submit">Submit form</Button>
        </FieldSet>
      </form>
      <p id="extra-help">Caller description.</p>
      <button
        type="button"
        ref={nativeEvents({ click: () => setHelp(!help()) })}
      >
        Toggle help
      </button>
    </main>
  )
}
declare global {
  interface Window {
    nativeFieldFixture: {
      configure: (next: {
        choice?: string
        preventChoice?: boolean
        text?: string
        blurText?: string
        disabled?: boolean
        readonly?: boolean
        invalid?: boolean
        help?: boolean
        accept?: boolean
        id?: string
      }) => void
      read: () => {
        choice: string
        text: string
        notes: string
        blurText: string
        submits: number
        actions: number
        refs: number
        cleanups: number
        keyups: number
        compositions: number
        refConnected: boolean
      }
      stop?: () => void
    }
  }
}
