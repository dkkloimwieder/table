import {
  AlertDialog,
  Button,
  Checkbox,
  Combobox,
  Field,
  FieldError,
  FieldSet,
  HelpText,
  InlineAlert,
  Input,
  Label,
  Switch,
  uiScope,
} from '@table/ui'
import { ReadOnlyTable } from '@table/ui/table'
import { nativeEvents } from '@table/ui/events'
import { Show, createSignal, flush, onCleanup, untrack } from 'solid-js'
import { createTable } from '@tanstack/solid-table/native'
import { createConsumerTransport } from './consumer-transport'
import type { Choice, SavedRecord, Submission } from './consumer-transport'

const initialChoice: Choice = { id: 'west', label: 'West' }
const textColumn = {
  filterFn: (value: unknown, filter: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .includes(String(filter).toLowerCase()),
  sortFn: (a: unknown, b: unknown) =>
    String(a ?? '').localeCompare(String(b ?? '')),
}

export function GenericConsumer() {
  const alternate = new URLSearchParams(location.search).has('alternate')
  const names = alternate
    ? {
        text: 'projectTitle',
        choice: 'teamId',
        boolean: 'archived',
        switch: 'notify',
      }
    : {
        text: 'displayName',
        choice: 'regionId',
        boolean: 'includeDetails',
        switch: 'enabled',
      }
  const labels = alternate
    ? {
        text: 'Project title',
        choice: 'Find team',
        boolean: 'Archive project',
        switch: 'Notify members',
      }
    : {
        text: 'Display name',
        choice: 'Find region',
        boolean: 'Include details',
        switch: 'Enable updates',
      }
  const transport = createConsumerTransport(
    new URLSearchParams(location.search).has('manual'),
  )
  const [name, setName] = createSignal('Desk')
  const [choice, setChoice] = createSignal<Choice | null>(initialChoice)
  const [query, setQuery] = createSignal('West')
  const [options, setOptions] = createSignal<Array<Choice>>([initialChoice])
  const [nextPage, setNextPage] = createSignal<number | null>(null)
  const [checked, setChecked] = createSignal(false)
  const [enabled, setEnabled] = createSignal(true)
  const [loading, setLoading] = createSignal(false)
  const [choiceError, setChoiceError] = createSignal('')
  const [formError, setFormError] = createSignal('')
  const [invalid, setInvalid] = createSignal(false)
  const [confirm, setConfirm] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [rows, setRows] = createSignal<Array<SavedRecord>>([
    {
      id: 'initial',
      name: 'Existing record',
      category: 'West',
      enabled: 'Yes',
    },
  ])
  let alive = true
  let cleanups = 0
  let epoch = 0
  let searchAbort: AbortController | undefined
  let saveAbort: AbortController | undefined
  let draft: Submission | undefined
  const table = createTable<SavedRecord>({
    source: {
      ids: () => rows().map((row) => row.id),
      get: (id) => rows().find((row) => row.id === id),
    },
    columns: [
      {
        ...textColumn,
        id: 'name',
        header: alternate ? 'Project' : 'Name',
        accessorKey: 'name',
      },
      {
        ...textColumn,
        id: 'category',
        header: alternate ? 'Team' : 'Region',
        accessorKey: 'category',
      },
      {
        ...textColumn,
        id: 'enabled',
        header: 'Enabled',
        accessorKey: 'enabled',
      },
    ],
  })
  const search = (text: string, page = 0) => {
    if (!alive || saving()) return
    searchAbort?.abort()
    const controller = new AbortController()
    searchAbort = controller
    const current = ++epoch
    setLoading(true)
    setChoiceError('')
    if (page === 0) {
      setOptions([])
      setNextPage(null)
    }
    void transport.choices(text, page, controller.signal).then(
      (result) =>
        untrack(() => {
          if (!alive || current !== epoch || controller.signal.aborted) return
          setOptions((old) =>
            page === 0
              ? result.options
              : [
                  ...old,
                  ...result.options.filter(
                    (option) => !old.some((item) => item.id === option.id),
                  ),
                ],
          )
          setNextPage(result.next)
          setLoading(false)
        }),
      (error) =>
        untrack(() => {
          if (!alive || current !== epoch || controller.signal.aborted) return
          setChoiceError(
            error instanceof Error ? error.message : 'Request failed.',
          )
          setLoading(false)
        }),
    )
  }
  const review = () => {
    if (!alive || saving()) return
    const valid = Boolean(name().trim() && choice())
    setInvalid(!valid)
    setFormError(valid ? '' : 'Enter a name and choose a result.')
    if (!valid) return
    draft = {
      [names.text]: name().trim(),
      [names.choice]: choice()!.id,
      [names.boolean]: checked(),
      [names.switch]: enabled(),
    }
    setConfirm(true)
  }
  const save = () => {
    if (!alive || saving() || !draft) return
    setSaving(true)
    setFormError('')
    searchAbort?.abort()
    setLoading(false)
    const controller = new AbortController()
    saveAbort = controller
    void transport.save({ ...draft }, controller.signal).then(
      (result) =>
        untrack(() => {
          if (!alive || controller.signal.aborted) return
          setRows((old) => [...old, result])
          setSaving(false)
          setConfirm(false)
          draft = undefined
        }),
      (error) =>
        untrack(() => {
          if (!alive || controller.signal.aborted) return
          setSaving(false)
          setFormError(error instanceof Error ? error.message : 'Save failed.')
        }),
    )
  }
  onCleanup(() => {
    alive = false
    cleanups++
    searchAbort?.abort()
    saveAbort?.abort()
    transport.dispose()
  })
  window.consumerFixture = {
    transport,
    read: () => ({
      name: name(),
      choice: choice()?.id ?? null,
      query: query(),
      checked: checked(),
      enabled: enabled(),
      loading: loading(),
      saving: saving(),
      confirm: confirm(),
      options: options().map((option) => option.id),
      rows: rows(),
      cleanups,
    }),
    configure(value) {
      if ('name' in value) setName(value.name!)
      if ('choice' in value) {
        setChoice(value.choice ?? null)
        setQuery(value.choice?.label ?? '')
      }
      if ('checked' in value) setChecked(value.checked!)
      if ('enabled' in value) setEnabled(value.enabled!)
      flush()
    },
  }
  return (
    <main
      {...uiScope()}
      data-ui-portal-root=""
      class="consumer-layout"
      data-layout={alternate ? 'stacked' : 'beside'}
    >
      <section aria-label="Record form">
        <h1>{alternate ? 'Project registration' : 'Record registration'}</h1>
        <form
          novalidate
          ref={nativeEvents<HTMLFormElement>({
            submit(event) {
              event.preventDefault()
            },
          })}
        >
          <FieldSet disabled={saving()}>
            <legend>Record details</legend>
            <Field invalid={invalid() && !name().trim()} required>
              <Label>{labels.text}</Label>
              <Input name={names.text} value={name()} onValueChange={setName} />
              <HelpText>Use a name for the saved record.</HelpText>
              <FieldError>Enter a name.</FieldError>
            </Field>
            <Combobox
              options={options()}
              value={choice()}
              inputValue={query()}
              name={names.choice}
              optionValue="id"
              optionTextValue="label"
              optionLabel="label"
              defaultFilter={() => true}
              disabled={saving()}
              validationState={invalid() && !choice() ? 'invalid' : 'valid'}
              onInputChange={(text) => {
                setQuery(text)
                search(text)
              }}
              onChange={(value) => {
                setChoice(value)
                setQuery(value?.label ?? '')
              }}
              itemComponent={(item) => (
                <Combobox.Item item={item.item}>
                  <Combobox.ItemLabel>
                    {item.item.rawValue.label}
                  </Combobox.ItemLabel>
                </Combobox.Item>
              )}
            >
              <Combobox.Label>{labels.choice}</Combobox.Label>
              <Combobox.HiddenSelect />
              <Combobox.Control>
                <Combobox.Input />
                <Combobox.Trigger aria-label="Show results">
                  Open
                </Combobox.Trigger>
              </Combobox.Control>
              <Combobox.Description>
                The application searches remote results.
              </Combobox.Description>
              <Combobox.ErrorMessage>Choose a result.</Combobox.ErrorMessage>
              <Combobox.Portal>
                <Combobox.Content
                  status={
                    <span role="status">
                      {loading()
                        ? 'Loading results'
                        : choiceError() ||
                          (!options().length ? 'No results' : '')}
                    </span>
                  }
                  footer={
                    <>
                      <Button
                        disabled={loading() || nextPage() === null}
                        onClick={() => search(query(), nextPage()!)}
                      >
                        More results
                      </Button>
                      <Show when={choiceError()}>
                        <Button onClick={() => search(query())}>
                          Retry search
                        </Button>
                      </Show>
                    </>
                  }
                >
                  <Combobox.Listbox />
                </Combobox.Content>
              </Combobox.Portal>
            </Combobox>
            <Checkbox
              name={names.boolean}
              checked={checked()}
              onChange={setChecked}
              disabled={saving()}
            >
              <Checkbox.Input />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>{labels.boolean}</Checkbox.Label>
            </Checkbox>
            <Switch
              name={names.switch}
              checked={enabled()}
              onChange={setEnabled}
              disabled={saving()}
            >
              <Switch.Input />
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.Label>{labels.switch}</Switch.Label>
            </Switch>
            <Button type="button" onClick={review}>
              Review record
            </Button>
          </FieldSet>
          <Show when={formError() && !confirm()}>
            <InlineAlert tone="error" announce="polite">
              {formError()}
            </InlineAlert>
          </Show>
        </form>
        <AlertDialog
          open={confirm()}
          onOpenChange={(value) => {
            if (!saving()) setConfirm(value)
          }}
        >
          <AlertDialog.Portal>
            <AlertDialog.Overlay />
            <AlertDialog.Content>
              <AlertDialog.Title>Save this record?</AlertDialog.Title>
              <AlertDialog.Description>
                The saved record will appear in the table.
              </AlertDialog.Description>
              <Show when={formError()}>
                <InlineAlert tone="error" announce="polite">
                  {formError()}
                </InlineAlert>
              </Show>
              <AlertDialog.Cancel as={Button} disabled={saving()}>
                Keep editing
              </AlertDialog.Cancel>
              <AlertDialog.Action disabled={saving()} onClick={save}>
                {saving() ? 'Saving record' : 'Save record'}
              </AlertDialog.Action>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog>
      </section>
      <section aria-label="Saved records">
        <ReadOnlyTable table={table} />
      </section>
    </main>
  )
}
declare global {
  interface Window {
    consumerFixture: {
      transport: ReturnType<typeof createConsumerTransport>
      read: () => {
        name: string
        choice: string | null
        query: string
        checked: boolean
        enabled: boolean
        loading: boolean
        saving: boolean
        confirm: boolean
        options: Array<string>
        rows: Array<SavedRecord>
        cleanups: number
      }
      configure: (value: {
        name?: string
        choice?: Choice | null
        checked?: boolean
        enabled?: boolean
      }) => void
      stop?: () => void
    }
  }
}
