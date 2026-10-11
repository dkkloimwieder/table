import { createEffect, createUniqueId, onSettled } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

export type ColumnDestination = { id: string; side: 'before' | 'after' }

/** Move IDs without dropping hidden columns or changing their relative order. */
export function moveColumn(
  order: ReadonlyArray<string>,
  id: string,
  destination: ColumnDestination,
) {
  if (id === destination.id || !order.includes(destination.id)) return order
  const next = order.filter((key) => key !== id)
  const index = next.indexOf(destination.id)
  next.splice(index + Number(destination.side === 'after'), 0, id)
  return next.every((key, position) => key === order[position]) ? order : next
}

export function TableColumnMove(props: {
  id: string
  disabled?: boolean
  label: string
  ids: ReadonlyArray<string>
  onMove: (destination: ColumnDestination) => void
  onActivity?: (
    event: 'start' | 'move' | 'end' | 'cancel',
    listeners: number,
  ) => void
}) {
  const helpId = createUniqueId()
  const menuId = createUniqueId()
  let handle!: HTMLButtonElement
  let menu!: HTMLDivElement
  let disposed = false
  let suppressClick = false
  let frame = 0
  let marker: HTMLElement | undefined
  let drag:
    | {
        pointerId: number
        x: number
        lastX: number
        moved: boolean
        ids: ReadonlyArray<string>
        scroll: HTMLElement
        header: HTMLElement
        destination?: ColumnDestination
      }
    | undefined
  const index = () => props.ids.indexOf(props.id)
  const first = () => index() <= 0
  const last = () => index() >= props.ids.length - 1
  function clearMarker() {
    marker?.removeAttribute('data-column-drop')
    marker = undefined
  }
  function removeDrag() {
    const current = drag
    if (!current) return
    drag = undefined
    cancelAnimationFrame(frame)
    clearMarker()
    current.header.removeAttribute('data-column-moving')
    window.removeEventListener('blur', cancel)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('keydown', escape, true)
    current.scroll.removeEventListener('scroll', updateTarget)
    if (handle.hasPointerCapture(current.pointerId))
      handle.releasePointerCapture(current.pointerId)
    return current
  }
  function cancel() {
    if (removeDrag()) props.onActivity?.('cancel', -4)
  }
  function visibility() {
    if (document.hidden) cancel()
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing || !drag) return
    event.preventDefault()
    event.stopPropagation()
    suppressClick = true
    cancel()
  }
  function updateTarget() {
    if (!drag?.moved) return
    clearMarker()
    drag.destination = undefined
    const headers = Array.from(
      drag.header.parentElement!.querySelectorAll<HTMLElement>(
        '[data-column-header]',
      ),
    ).filter((node) => props.ids.includes(node.dataset.columnHeader!))
    // Only header geometry is read. The record collection is never visited.
    const target = headers.find((node, position) =>
      position === headers.length - 1
        ? true
        : drag!.lastX < node.getBoundingClientRect().right,
    )
    if (!target) return
    const box = target.getBoundingClientRect()
    const destination: ColumnDestination = {
      id: target.dataset.columnHeader!,
      side: drag.lastX < box.left + box.width / 2 ? 'before' : 'after',
    }
    if (moveColumn(props.ids, props.id, destination) === props.ids) return
    drag.destination = destination
    marker = target
    marker.dataset.columnDrop = destination.side
  }
  function autoScroll() {
    if (!drag?.moved) return
    const box = drag.scroll.getBoundingClientRect()
    const direction =
      drag.lastX < box.left + 28 ? -1 : drag.lastX > box.right - 28 ? 1 : 0
    if (!direction) return
    const previous = drag.scroll.scrollLeft
    drag.scroll.scrollLeft += direction * 12
    updateTarget()
    if (drag.scroll.scrollLeft !== previous)
      frame = requestAnimationFrame(autoScroll)
  }
  function start(event: PointerEvent) {
    if (
      props.disabled ||
      disposed ||
      drag ||
      props.ids.length < 2 ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
    menu.hidePopover()
    handle.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    const header = handle.closest<HTMLElement>('[data-column-header]')!
    const scroll = header.closest<HTMLElement>('.table-scroll')!
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      lastX: event.clientX,
      moved: false,
      ids: props.ids,
      scroll,
      header,
    }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('keydown', escape, true)
    scroll.addEventListener('scroll', updateTarget)
    props.onActivity?.('start', 4)
  }
  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (props.disabled || props.ids !== drag.ids) return cancel()
    drag.lastX = event.clientX
    drag.moved ||= Math.abs(event.clientX - drag.x) >= 5
    if (!drag.moved) return
    suppressClick = true
    drag.header.dataset.columnMoving = 'true'
    updateTarget()
    cancelAnimationFrame(frame)
    autoScroll()
    props.onActivity?.('move', 0)
  }
  function finish(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return
    move(event)
    const current = removeDrag()
    if (!current) return
    props.onActivity?.('end', -4)
    if (current.destination)
      if (!props.disabled) props.onMove(current.destination)
  }
  function keyboardMove(key: string) {
    if (props.disabled) return
    const position = index()
    const target =
      key === 'Home'
        ? 0
        : key === 'End'
          ? props.ids.length - 1
          : position + (key === 'ArrowLeft' ? -1 : 1)
    if (target < 0 || target >= props.ids.length || target === position) return
    menu.hidePopover()
    handle.focus({ preventScroll: true })
    props.onMove({
      id: props.ids[target]!,
      side: target < position ? 'before' : 'after',
    })
  }
  createEffect(
    () => props.ids,
    (ids) => {
      if (drag && ids !== drag.ids) cancel()
    },
  )
  createEffect(
    () => Boolean(props.disabled),
    (disabled) => {
      if (disabled) cancel()
    },
  )
  onSettled(() => () => {
    disposed = true
    cancel()
  })
  return (
    <>
      <button
        type="button"
        class="column-move"
        aria-label={`Move ${props.label} column`}
        aria-describedby={helpId}
        aria-controls={menuId}
        aria-expanded="false"
        disabled={props.disabled || props.ids.length < 2}
        ref={[
          (node) => {
            handle = node
          },
          nativeEvents<HTMLButtonElement>({
            pointerdown: start,
            pointermove: move,
            pointerup: finish,
            pointercancel: (event) => {
              if (event.pointerId === drag?.pointerId) cancel()
            },
            lostpointercapture: (event) => {
              if (event.pointerId === drag?.pointerId) cancel()
            },
            click: (event) => {
              event.stopPropagation()
              if (props.disabled || (suppressClick && event.detail !== 0))
                return
              const box = handle.getBoundingClientRect()
              menu.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - 188))}px`
              menu.style.top = `${Math.max(8, Math.min(box.bottom + 4, window.innerHeight - 190))}px`
              menu.togglePopover()
              if (menu.matches(':popover-open'))
                menu
                  .querySelector<HTMLButtonElement>('button:not(:disabled)')
                  ?.focus()
            },
            keydown: (event) => {
              if (
                event.isComposing ||
                drag ||
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return
              event.preventDefault()
              event.stopPropagation()
              keyboardMove(event.key)
            },
          }),
        ]}
      >
        <span class="column-move-dots" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      </button>
      <span id={helpId} class="sr-only">
        Drag to move the column. Left and Right move one place. Home and End
        move to the first and last available places. Escape cancels a drag.
        Activate for move buttons.
      </span>
      <div
        id={menuId}
        popover="auto"
        class="column-move-menu"
        role="group"
        aria-label={`Move ${props.label} column`}
        ref={[
          (node) => {
            menu = node
          },
          nativeEvents<HTMLDivElement>({
            beforetoggle: (event) => {
              handle.setAttribute(
                'aria-expanded',
                String(event.newState === 'open'),
              )
            },
          }),
        ]}
      >
        <button
          disabled={props.disabled || first()}
          ref={nativeEvents({ click: () => keyboardMove('Home') })}
        >
          Move first
        </button>
        <button
          disabled={props.disabled || first()}
          ref={nativeEvents({ click: () => keyboardMove('ArrowLeft') })}
        >
          Move left
        </button>
        <button
          disabled={props.disabled || last()}
          ref={nativeEvents({ click: () => keyboardMove('ArrowRight') })}
        >
          Move right
        </button>
        <button
          disabled={props.disabled || last()}
          ref={nativeEvents({ click: () => keyboardMove('End') })}
        >
          Move last
        </button>
      </div>
    </>
  )
}
