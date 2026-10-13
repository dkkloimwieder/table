/*
 * Portions of this file are based on code from radix-ui-primitives.
 * MIT Licensed, Copyright (c) 2022 WorkOS.
 *
 * Credits to the Radix UI team:
 * https://github.com/radix-ui/primitives/blob/81b25f4b40c54f72aeb106ca0e64e1e09655153e/packages/react/dismissable-layer/src/DismissableLayer.tsx
 *
 * Portions of this file are based on code from zag.
 * MIT Licensed, Copyright (c) 2021 Chakra UI.
 *
 * Credits to the Chakra UI team:
 * https://github.com/chakra-ui/zag/blob/d1dbf9e240803c9e3ed81ebef363739be4273de0/packages/utilities/dismissable/src/dismissable-layer.ts
 */

import { interactOutside } from '@solid-primitives/interaction'
import { createShortcut } from '@solid-primitives/keyboard'
import { createEffect, createMemo, createSignal, omit, untrack } from 'solid-js'
import { Polymorphic } from '../polymorphic/index.tsx'
import {
  DismissableLayerContext,
  useOptionalDismissableLayerContext,
} from './dismissable-layer-context.tsx'
import { layerStack } from './layer-stack.tsx'
import type { DismissableLayerContextValue } from './dismissable-layer-context.tsx'
import type { Accessor, Ref } from 'solid-js'
import type {
  FocusOutsideEvent,
  InteractOutsideEvent,
  PointerDownOutsideEvent,
} from '@solid-primitives/interaction'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { JSX, ValidComponent } from '@solidjs/web'

export interface DismissableLayerOptions {
  /** Whether this layer participates in dismissal and document locks. */
  enabled?: boolean

  /**
   * When `true`, hover/focus/click interactions will be disabled on elements outside
   * the layer. Users will need to click twice on outside elements to
   * interact with them: once to close the layer, and again to trigger the element.
   */
  disableOutsidePointerEvents?: boolean

  /** A list of elements that should not dismiss the layer when interacted with. */
  excludedElements?: Array<Accessor<HTMLElement | undefined>>

  /**
   * Event handler called when the escape key is down.
   * Can be prevented.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void

  /**
   * Event handler called when a `pointerdown` event happens outside the layer.
   * Can be prevented.
   */
  onPointerDownOutside?: (event: PointerDownOutsideEvent) => void

  /**
   * Event handler called when the focus moves outside the layer.
   * Can be prevented.
   */
  onFocusOutside?: (event: FocusOutsideEvent) => void

  /**
   * Event handler called when an interaction happens outside the layer.
   * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
   * Can be prevented.
   */
  onInteractOutside?: (event: InteractOutsideEvent) => void

  /** Handler called when the layer should be dismissed. */
  onDismiss?: () => void

  /** Whether to ignore the "top most layer" check on interact outside. */
  bypassTopMostLayerCheck?: boolean
}

export interface DismissableLayerCommonProps<
  T extends HTMLElement = HTMLElement,
> {
  ref: Ref<T>
}

export interface DismissableLayerRenderProps extends DismissableLayerCommonProps {}

export type DismissableLayerProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = DismissableLayerOptions & Partial<DismissableLayerCommonProps<ElementOf<T>>>

export function DismissableLayer<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, DismissableLayerProps<T>>,
) {
  const [ref, setRef] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const parentContext = useOptionalDismissableLayerContext()
  const others = omit(
    props as DismissableLayerProps,
    'ref',
    'enabled',
    'disableOutsidePointerEvents',
    'excludedElements',
    'onEscapeKeyDown',
    'onPointerDownOutside',
    'onFocusOutside',
    'onInteractOutside',
    'onDismiss',
    'bypassTopMostLayerCheck',
  )
  const isPointerBlocking = createMemo(
    () => props.enabled !== false && props.disableOutsidePointerEvents,
  )
  const nestedLayers = new Set<Element>([])

  const registerNestedLayer = (element: Element) => {
    nestedLayers.add(element)

    const parentUnregister = parentContext?.registerNestedLayer(element)

    return () => {
      nestedLayers.delete(element)
      parentUnregister?.()
    }
  }

  const shouldExcludeElement = (element: Element) =>
    untrack(() => {
      if (!ref()) {
        return false
      }

      return (
        props.excludedElements?.some((node) => node()?.contains(element)) ||
        [...nestedLayers].some((layer) => layer.contains(element))
      )
    })

  const onPointerDownOutside = (e: PointerDownOutsideEvent) =>
    untrack(() => {
      if (untrack(() => props.enabled === false)) return
      if (!ref() || layerStack.isBelowPointerBlockingLayer(ref()!)) {
        return
      }

      if (
        !props.bypassTopMostLayerCheck &&
        !layerStack.isTopMostLayer(ref()!)
      ) {
        return
      }

      props.onPointerDownOutside?.(e)
      props.onInteractOutside?.(e)

      if (!e.defaultPrevented) {
        props.onDismiss?.()
      }
    })

  const onFocusOutside = (e: FocusOutsideEvent) =>
    untrack(() => {
      if (untrack(() => props.enabled === false)) return
      props.onFocusOutside?.(e)
      props.onInteractOutside?.(e)

      if (!e.defaultPrevented) {
        props.onDismiss?.()
      }
    })

  const interactOutsideRef = interactOutside({
    shouldExcludeElement,
    onPointerDownOutside,
    onFocusOutside,
  })
  createShortcut(
    ['Escape'],
    (e) => {
      if (
        untrack(() => props.enabled === false) ||
        !e ||
        !ref() ||
        !layerStack.isTopMostLayer(ref()!)
      ) {
        return
      }

      props.onEscapeKeyDown?.(e)

      if (!e.defaultPrevented && props.onDismiss) {
        e.preventDefault()
        props.onDismiss()
      }
    },
    { preventDefault: false },
  )

  createEffect(
    () => ({ node: ref(), enabled: props.enabled !== false }),
    ({ node, enabled }) => {
      if (!node || !enabled) return
      return untrack(() => {
        layerStack.addLayer({
          node,
          isPointerBlocking: isPointerBlocking(),
          dismiss: props.onDismiss,
        })
        const unregisterFromParentLayer =
          parentContext?.registerNestedLayer(node)
        layerStack.assignPointerEventToLayers()
        layerStack.disableBodyPointerEvents(node)
        return () => {
          layerStack.removeLayer(node)
          unregisterFromParentLayer?.()
          layerStack.assignPointerEventToLayers()
          layerStack.restoreBodyPointerEvents(node)
        }
      })
    },
  )

  createEffect(
    () => ({ ref: ref(), disabled: isPointerBlocking() }),
    ({ ref, disabled: disableOutsidePointerEvents }) => {
      if (!ref) return

      const layer = layerStack.find(ref)

      if (layer && layer.isPointerBlocking !== disableOutsidePointerEvents) {
        // Keep layer in sync with the prop.
        layer.isPointerBlocking = disableOutsidePointerEvents

        // Update layers pointer-events since this layer "isPointerBlocking" has changed.
        layerStack.assignPointerEventToLayers()
      }

      if (disableOutsidePointerEvents) {
        layerStack.disableBodyPointerEvents(ref)
      }

      return () => {
        layerStack.restoreBodyPointerEvents(ref)
      }
    },
    { defer: true },
  )

  const context: DismissableLayerContextValue = {
    registerNestedLayer,
  }

  const attributes = others as JSX.HTMLAttributes<HTMLElement>
  const forwardedRef = untrack(() => props.ref)
  return (
    <DismissableLayerContext value={context}>
      <Polymorphic<JSX.HTMLAttributes<HTMLElement>>
        {...attributes}
        data-kb-top-layer={props.enabled === false ? undefined : ''}
        as={props.as ?? 'div'}
        ref={[
          setRef,
          interactOutsideRef,
          forwardedRef as (element: HTMLElement) => void,
        ]}
      />
    </DismissableLayerContext>
  )
}
