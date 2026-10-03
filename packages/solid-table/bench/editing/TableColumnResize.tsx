import { createEffect, createMemo, createUniqueId, onSettled } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

/** Controlled width input. Pointer movement updates the rendered column. */
export function TableColumnResize(props: {
  label: string
  size: number
  min: number
  max: number
  onSizeChange: (size: number) => void
  onActivity?: (
    event: 'start' | 'move' | 'end' | 'cancel' | 'change',
    listeners: number,
  ) => void
}) {
  const helpId = createUniqueId()
  let handle!: HTMLDivElement
  let disposed = false
  let drag:
    | {
        pointerId: number
        x: number
        width: number
        min: number
        max: number
        scroll: HTMLElement | null
        scrollLeft: number
        lastX: number
        next: number
      }
    | undefined
  const configuration = createMemo(
    () => [props.size, props.min, props.max] as const,
    {
      equals: (left, right) =>
        left.every((value, index) => value === right[index]),
    },
  )
  const clamp = (value: number) =>
    Math.min(props.max, Math.max(props.min, Math.round(value)))
  function removeDrag() {
    const current = drag
    if (!current) return
    drag = undefined
    window.removeEventListener('blur', cancel)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('keydown', escape, true)
    current.scroll?.removeEventListener('scroll', scroll)
    if (handle.hasPointerCapture(current.pointerId))
      handle.releasePointerCapture(current.pointerId)
    return current
  }
  function cancel() {
    const current = removeDrag()
    if (current) {
      props.onActivity?.('cancel', -(3 + Number(Boolean(current.scroll))))
    }
  }
  function visibility() {
    if (document.hidden) cancel()
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing || !drag) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
  function update(x: number) {
    if (!drag) return
    if (
      props.size !== drag.next ||
      props.min !== drag.min ||
      props.max !== drag.max
    ) {
      cancel()
      return
    }
    drag.lastX = x
    const next = clamp(
      drag.width +
        x -
        drag.x +
        (drag.scroll?.scrollLeft ?? 0) -
        drag.scrollLeft,
    )
    drag.next = next
    change(next)
  }
  function scroll() {
    if (drag) update(drag.lastX)
  }
  function start(event: PointerEvent) {
    if (disposed || drag || event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    event.stopPropagation()
    handle.focus({ preventScroll: true })
    handle.setPointerCapture(event.pointerId)
    const scroller = handle.closest<HTMLElement>('.table-scroll')
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      lastX: event.clientX,
      width: props.size,
      min: props.min,
      max: props.max,
      next: props.size,
      scroll: scroller,
      scrollLeft: scroller?.scrollLeft ?? 0,
    }
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('keydown', escape, true)
    scroller?.addEventListener('scroll', scroll)
    props.onActivity?.('start', 3 + Number(Boolean(scroller)))
  }
  function change(size: number) {
    const next = clamp(size)
    if (next === props.size) return
    props.onSizeChange(next)
    props.onActivity?.('change', 0)
  }
  function finish(event: PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return
    update(event.clientX)
    const current = removeDrag()
    if (current) {
      props.onActivity?.('end', -(3 + Number(Boolean(current.scroll))))
    }
  }
  // Observe caller changes and release a gesture whose width or bounds changed.
  createEffect(configuration, ([size, min, max]) => {
    if (drag && (size !== drag.next || min !== drag.min || max !== drag.max)) {
      const current = removeDrag()!
      props.onActivity?.('cancel', -(3 + Number(Boolean(current.scroll))))
    }
  })
  onSettled(() => () => {
    disposed = true
    cancel()
  })
  return (
    <>
      <div
        class="column-resize"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label={`Resize ${props.label} column`}
        aria-describedby={helpId}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={props.size}
        aria-valuetext={`${props.size} pixels`}
        ref={[
          (node) => {
            handle = node
          },
          nativeEvents<HTMLDivElement>({
            pointerdown: start,
            pointermove: (event) => {
              if (!drag || event.pointerId !== drag.pointerId) return
              update(event.clientX)
              props.onActivity?.('move', 0)
            },
            pointerup: finish,
            pointercancel: (event) => {
              if (event.pointerId === drag?.pointerId) cancel()
            },
            lostpointercapture: (event) => {
              if (event.pointerId === drag?.pointerId) cancel()
            },
            click: (event) => event.stopPropagation(),
            keydown: (event) => {
              if (drag || event.isComposing) return
              const step = event.shiftKey ? 50 : 10
              const value =
                event.key === 'ArrowLeft'
                  ? props.size - step
                  : event.key === 'ArrowRight'
                    ? props.size + step
                    : event.key === 'Home'
                      ? props.min
                      : event.key === 'End'
                        ? props.max
                        : undefined
              if (value !== undefined) {
                event.preventDefault()
                event.stopPropagation()
                change(value)
              }
            },
          }),
        ]}
      >
        <span class="resize-grip" aria-hidden="true" />
      </div>
      <span id={helpId} class="sr-only">
        Drag to resize the column. Left and Right change width by 10 pixels, or
        50 with Shift. Home and End select the limits. Escape ends a drag at the
        current width.
      </span>
    </>
  )
}
