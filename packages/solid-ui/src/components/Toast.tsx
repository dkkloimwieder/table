import { createToastState } from '@table/ui-core/toast'
import {
  callHandler,
  nativeEventProps,
  ownedElementEvents,
} from '@table/ui-core/events'
import {
  Show,
  createContext,
  createSignal,
  merge,
  omit,
  onCleanup,
  useContext,
} from 'solid-js'
import { Button } from './NativeFields'
import type { ToastOptions } from '@table/ui-core/toast'
import type { JSX } from '@solidjs/web'
import type { ButtonProps } from './NativeFields'

const ToastContext = createContext<ReturnType<typeof createToastState> | null>(
  null,
)
export type ToastRootProps = JSX.HTMLAttributes<HTMLDivElement> &
  ToastOptions & { priority?: 'polite' | 'assertive' }
export function ToastRoot(props: ToastRootProps) {
  const [node, setNode] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })
  const state = createToastState(props, node)
  return (
    <Show when={state.open()}>
      <ToastContext value={state}>
        <ToastSurface {...props} state={state} setNode={setNode} />
      </ToastContext>
    </Show>
  )
}
function ToastSurface(
  props: ToastRootProps & {
    state: ReturnType<typeof createToastState>
    setNode: (node: HTMLElement | undefined) => void
  },
) {
  const state = props.state
  onCleanup(() => props.setNode(undefined))
  const handlers = {
    onPointerEnter(
      event: PointerEvent & { currentTarget: HTMLDivElement; target: Element },
    ) {
      if (!callHandler(event, props.onPointerEnter)) state.pause('pointer')
    },
    onPointerLeave(
      event: PointerEvent & { currentTarget: HTMLDivElement; target: Element },
    ) {
      callHandler(event, props.onPointerLeave)
      state.resume('pointer')
    },
    onFocusIn(
      event: FocusEvent & { currentTarget: HTMLDivElement; target: Element },
    ) {
      callHandler(event, props.onFocusIn)
      state.pause('focus')
    },
    onFocusOut(
      event: FocusEvent & { currentTarget: HTMLDivElement; target: Element },
    ) {
      callHandler(event, props.onFocusOut)
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      )
        state.resume('focus')
    },
    onKeyDown(
      event: KeyboardEvent & { currentTarget: HTMLDivElement; target: Element },
    ) {
      if (!callHandler(event, props.onKeyDown) && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        state.dismiss('escape')
      }
    },
  }
  const attributes = omit(
    props,
    'open',
    'defaultOpen',
    'duration',
    'persistent',
    'onOpenChange',
    'onDismiss',
    'onCloseAutoFocus',
    'priority',
    'state',
    'setNode',
    'ref',
    ...nativeEventProps,
  )
  const events = ownedElementEvents(merge(props, handlers))
  return (
    <div
      {...attributes}
      role="status"
      aria-live={props.priority ?? 'polite'}
      aria-atomic="true"
      data-ui=""
      class={'ui-toast ' + (props.class ?? '')}
      ref={[props.setNode, props.ref, events]}
    />
  )
}
export type ToastRegionProps = JSX.HTMLAttributes<HTMLDivElement>
export function ToastRegion(props: ToastRegionProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      data-ui=""
      role="region"
      aria-label={props['aria-label'] ?? 'Notifications'}
      class={'ui-toast-region ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export function ToastTitle(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <h3
      {...attributes}
      class={'ui-toast-title ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export function ToastDescription(
  props: JSX.HTMLAttributes<HTMLParagraphElement>,
) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <p
      {...attributes}
      class={'ui-toast-description ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export function ToastCloseButton(props: ButtonProps) {
  const state = useContext(ToastContext)
  if (!state) throw new Error('Use Toast.CloseButton inside Toast.Root')
  return (
    <Button
      {...props}
      aria-label={props['aria-label'] ?? 'Dismiss notification'}
      onClick={(event) => {
        if (!callHandler(event, props.onClick)) state.dismiss('close')
      }}
    >
      {props.children ?? 'Close'}
    </Button>
  )
}
export const Toast = /* @__PURE__ */ Object.assign(ToastRoot, {
  Root: ToastRoot,
  Region: ToastRegion,
  Title: ToastTitle,
  Description: ToastDescription,
  CloseButton: ToastCloseButton,
})
export type { ToastDismissReason } from '@table/ui-core/toast'
