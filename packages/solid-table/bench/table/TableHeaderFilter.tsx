import {
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
} from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { TableFilter } from './TableFilter'
import type { TableFilterProps } from './TableFilter'

export function TableHeaderFilter(
  props: TableFilterProps & {
    columnId: string
    columnLabel: string
    triggerRef?: (node: HTMLButtonElement) => void
    onRemovalFocus?: () => void
  },
) {
  const popupId = createUniqueId()
  const statusId = createUniqueId()
  const [open, setOpen] = createSignal(false)
  let trigger: HTMLButtonElement | undefined
  let popup: HTMLDivElement | undefined
  let control: HTMLInputElement | HTMLSelectElement | undefined

  function position() {
    if (!trigger || !popup) return
    const anchor = trigger.getBoundingClientRect()
    const box = popup.getBoundingClientRect()
    popup.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8))}px`
    const top =
      anchor.bottom + 4 + box.height <= innerHeight - 8
        ? anchor.bottom + 4
        : anchor.top - box.height - 4
    popup.style.top = `${Math.max(8, Math.min(top, innerHeight - box.height - 8))}px`
  }
  function close(restoreFocus = false) {
    if (!popup?.matches(':popover-open')) return
    popup.hidePopover()
    if (restoreFocus && trigger && !trigger.disabled)
      trigger.focus({ preventScroll: true })
  }
  function toggle() {
    if (props.disabled || !popup || !control) return
    if (popup.matches(':popover-open')) close(true)
    else {
      popup.showPopover()
      position()
      control.focus({ preventScroll: true })
    }
  }
  createEffect(
    () => Boolean(props.disabled),
    (disabled) => {
      if (disabled) close()
    },
  )
  createEffect(open, (opened) => {
    if (!opened) return
    window.addEventListener('resize', position)
    document.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      document.removeEventListener('scroll', position, true)
    }
  })
  onCleanup(() => {
    if (!popup || !trigger) return
    if (
      popup.contains(document.activeElement) ||
      document.activeElement === trigger
    )
      props.onRemovalFocus?.()
  })
  return (
    <span class="header-filter">
      <button
        type="button"
        class="header-filter-trigger"
        data-header-filter={props.columnId}
        data-filtered={props.value ? 'true' : undefined}
        aria-label={`Filter ${props.columnLabel}`}
        aria-describedby={props.value ? statusId : undefined}
        aria-haspopup="dialog"
        aria-expanded={open() ? 'true' : 'false'}
        aria-controls={popupId}
        title={`Filter ${props.columnLabel}${props.value ? ' (active)' : ''}`}
        disabled={props.disabled}
        ref={[
          (node) => {
            trigger = node
            props.triggerRef?.(node)
          },
          nativeEvents<HTMLButtonElement>({ click: toggle }),
        ]}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 3h12L9 8v5l-2 1V8Z" />
        </svg>
      </button>
      <Show when={props.value}>
        <span id={statusId} class="sr-only">
          Filter active
        </span>
      </Show>
      <div
        ref={[
          (node) => {
            popup = node
          },
          nativeEvents<HTMLDivElement>({
            beforetoggle: (event) => {
              setOpen((event as ToggleEvent).newState === 'open')
            },
            keydown: (event) => {
              if (event.isComposing || event.keyCode === 229) return
              if (
                event.key === 'Escape' ||
                (event.key === 'Enter' &&
                  event.target instanceof HTMLInputElement)
              ) {
                event.preventDefault()
                event.stopPropagation()
                close(true)
              }
            },
            focusout: (event) => {
              const node = event.currentTarget
              if (
                event.relatedTarget instanceof Node &&
                node.contains(event.relatedTarget)
              )
                return
              queueMicrotask(() => {
                if (
                  !node.contains(document.activeElement) &&
                  document.activeElement !== trigger
                )
                  close()
              })
            },
          }),
        ]}
        id={popupId}
        data-header-filter-popup={props.columnId}
        class="header-filter-popup"
        popover="auto"
        role="dialog"
        aria-label={`Filter ${props.columnLabel}`}
      >
        <button
          type="button"
          class="header-filter-close"
          aria-label={`Close ${props.columnLabel} filter`}
          ref={nativeEvents({ click: () => close(true) })}
        >
          <span aria-hidden="true">×</span>
        </button>
        <TableFilter
          label={props.label}
          clearLabel={props.clearLabel}
          value={props.value}
          onValueChange={props.onValueChange}
          disabled={props.disabled}
          choices={props.choices}
          controlRef={(node) => {
            control = node
          }}
          onEscape={() => close(true)}
        />
      </div>
    </span>
  )
}
