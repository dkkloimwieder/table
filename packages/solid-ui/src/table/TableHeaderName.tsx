import { Show, createSignal, onSettled } from 'solid-js'
import { nativeEvents } from '../utils/nativeEvents'
import { TableSort } from './TableSort'

export function TableHeaderName(props: {
  label: string
  sorted: 'asc' | 'desc' | false
  onSort: () => void
  onRename: (label: string) => void
  sortingDisabled?: boolean
}) {
  const [editing, setEditing] = createSignal(false)
  let rename!: HTMLButtonElement
  return (
    <>
      <Show
        when={editing()}
        fallback={
          <TableSort
            label={props.label}
            sorted={props.sorted}
            class="header-sort"
            accessibleLabel={'Sort ' + props.label}
            unsortedMark=""
            onSort={props.onSort}
            disabled={props.sortingDisabled}
          />
        }
      >
        <HeaderEditor
          label={props.label}
          done={(value, restoreFocus) => {
            if (value !== undefined) props.onRename(value)
            setEditing(false)
            if (restoreFocus)
              queueMicrotask(() => rename.focus({ preventScroll: true }))
          }}
        />
      </Show>
      <button
        type="button"
        class="header-rename"
        hidden={editing()}
        aria-label={'Rename ' + props.label + ' header'}
        title="Rename header"
        ref={[
          (node) => {
            rename = node
          },
          nativeEvents({ click: () => setEditing(true) }),
        ]}
      >
        ✎
      </button>
    </>
  )
}

function HeaderEditor(props: {
  label: string
  done: (value: string | undefined, restoreFocus: boolean) => void
}) {
  let input!: HTMLInputElement
  let finished = false
  function finish(value: string | undefined, restoreFocus = false) {
    if (finished) return
    finished = true
    props.done(value, restoreFocus)
  }
  onSettled(() => {
    input.focus({ preventScroll: true })
    input.select()
  })
  return (
    <input
      class="header-name"
      type="text"
      aria-label={'Header name for ' + props.label}
      value={props.label}
      ref={[
        (node) => {
          input = node
        },
        nativeEvents<HTMLInputElement>({
          blur: (event) => finish(event.currentTarget.value),
          keydown: (event) => {
            if (event.isComposing) return
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              finish(
                event.key === 'Enter' ? event.currentTarget.value : undefined,
                true,
              )
            }
          },
        }),
      ]}
    />
  )
}
