import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onSettled,
} from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'

/** Controlled width input. Pointer movement owns only a temporary preview. */
export function TableColumnResize(props: {
  label: string
  size: number
  min: number
  max: number
  onSizeChange: (size: number) => void
  onReset: () => void
  onActivity?: (
    event: 'start' | 'move' | 'end' | 'cancel' | 'commit',
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
  // A caller width change resets the override in the same reactive flush.
  const [preview, setPreview] = createSignal<number | undefined>(() => {
    configuration()
    return undefined
  })
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
      if (!disposed) setPreview(undefined)
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
      props.size !== drag.width ||
      props.min !== drag.min ||
      props.max !== drag.max
    ) {
      cancel()
      return
    }
    drag.lastX = x
    drag.next = clamp(
      drag.width +
        x -
        drag.x +
        (drag.scroll?.scrollLeft ?? 0) -
        drag.scrollLeft,
    )
    setPreview(drag.next)
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
    setPreview(props.size)
    window.addEventListener('blur', cancel)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('keydown', escape, true)
    scroller?.addEventListener('scroll', scroll)
    props.onActivity?.('start', 3 + Number(Boolean(scroller)))
  }
  function commit(size: number) {
    const next = clamp(size)
    if (next === props.size) return
    props.onSizeChange(next)
    props.onActivity?.('commit', 0)
  }
  function finish(event: PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return
    update(event.clientX)
    const current = removeDrag()
    if (current) {
      setPreview(undefined)
      props.onActivity?.('end', -(3 + Number(Boolean(current.scroll))))
      commit(current.next)
    }
  }
  function reset() {
    cancel()
    props.onReset()
  }
  // Reactive cancellation resets preview through the writable derivation above.
  // This effect only releases browser resources, without relaying state writes.
  createEffect(configuration, ([size, min, max]) => {
    if (drag && (size !== drag.width || min !== drag.min || max !== drag.max)) {
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
        aria-valuenow={preview() ?? props.size}
        aria-valuetext={`${preview() ?? props.size} pixels`}
        data-resizing={preview() !== undefined ? 'true' : undefined}
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
            dblclick: (event) => {
              event.preventDefault()
              reset()
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
                commit(value)
              }
            },
          }),
        ]}
      >
        <span class="resize-grip" aria-hidden="true" />
        <span
          class="resize-preview"
          hidden={preview() === undefined}
          style={{
            transform: `translateX(${(preview() ?? props.size) - props.size}px)`,
          }}
          aria-hidden="true"
        >
          <span>{preview()} px</span>
        </span>
      </div>
      <button
        type="button"
        class="column-reset"
        aria-label={`Reset ${props.label} width`}
        title={`Reset ${props.label} width`}
        ref={nativeEvents({ click: reset })}
      >
        <span aria-hidden="true">↺</span>
      </button>
      <span id={helpId} class="sr-only">
        Drag to preview, then release to resize. Left and Right change width by
        10 pixels, or 50 with Shift. Home and End select the limits. Escape
        cancels a drag. Double-click resets the width.
      </span>
    </>
  )
}
