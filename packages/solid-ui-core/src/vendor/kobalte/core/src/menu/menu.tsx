/*
 * Portions of this file are based on code from radix-ui-primitives.
 * MIT Licensed, Copyright (c) 2022 WorkOS.
 *
 * Credits to the Radix UI team:
 * https://github.com/radix-ui/primitives/blob/81b25f4b40c54f72aeb106ca0e64e1e09655153e/packages/react/menu/src/Menu.tsx
 */

import { createHideOutside } from '@solid-primitives/interaction'

import { createPresence } from '@solid-primitives/presence'
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  merge,
  omit,
  onCleanup,
  untrack,
} from 'solid-js'
import { createListState } from '../list/index.ts'
import { useOptionalMenubarContext } from '../menubar/menubar-context.tsx'
import { useOptionalNavigationMenuContext } from '../navigation-menu/navigation-menu-context.tsx'
import { Popper } from '../popper/index.tsx'
import {
  createDomCollection,
  useOptionalDomCollectionContext,
} from '../primitives/create-dom-collection/index.ts'
import { createDisclosureState, createRegisterId } from '../primitives/index.ts'
import { MenuContext, useOptionalMenuContext } from './menu-context.tsx'
import { useMenuRootContext } from './menu-root-context.tsx'
import { isPointerInGraceArea } from './utils.ts'
import type { GraceIntent, Side } from './utils.ts'
import type { MenuContextValue, MenuDataSet } from './menu-context.tsx'
import type { CollectionItemWithRef } from '../primitives/index.ts'
import type { FocusStrategy } from '../selection/index.ts'
import type { Accessor, ParentProps } from 'solid-js'
import type { PopperRootOptions } from '../popper/index.tsx'
import type { Placement } from '../popper/utils.ts'

export interface MenuOptions extends Omit<
  PopperRootOptions,
  'anchorRef' | 'contentRef' | 'onCurrentPlacementChange'
> {
  /** The controlled open state of the menu. */
  open?: boolean

  /**
   * The default open state when initially rendered.
   * Useful when you do not need to control the open state.
   */
  defaultOpen?: boolean

  /** Event handler called when the open state of the menu changes. */
  onOpenChange?: (isOpen: boolean) => void
}

export interface MenuProps extends ParentProps<MenuOptions> {}

/**
 * Container for menu items and nested menu, provide context for its children.
 */
export function Menu(props: MenuProps) {
  const rootContext = useMenuRootContext()
  const parentDomCollectionContext = useOptionalDomCollectionContext()
  const parentMenuContext = useOptionalMenuContext()
  const optionalMenubarContext = useOptionalMenubarContext()
  const optionalNavigationMenuContext = useOptionalNavigationMenuContext()

  const mergedProps = merge(
    {
      placement:
        rootContext.orientation() === 'horizontal'
          ? 'bottom-start'
          : 'right-start',
    } as const,
    props,
  )

  const others = omit(mergedProps, 'open', 'defaultOpen', 'onOpenChange')

  let pointerGraceTimeoutId = 0
  let pointerGraceIntent: GraceIntent | null = null
  let pointerDir: Side = 'right'

  const [triggerId, setTriggerId] = createSignal<string | undefined>(
    undefined,
    { ownedWrite: true },
  )
  const [contentId, setContentId] = createSignal<string | undefined>(
    undefined,
    { ownedWrite: true },
  )

  const [triggerRef, setTriggerRef] = createSignal<HTMLElement | undefined>(
    undefined,
    { ownedWrite: true },
  )
  const [contentRef, setContentRef] = createSignal<HTMLDivElement | undefined>(
    undefined,
    { ownedWrite: true },
  )

  const [focusStrategy, setFocusStrategy] = createSignal<
    FocusStrategy | boolean
  >(true)
  const [currentPlacement, setCurrentPlacement] = createSignal<Placement>(
    others.placement,
  )
  const [nestedMenus, setNestedMenus] = createSignal<Array<HTMLElement>>([])

  const [items, setItems] = createSignal<Array<CollectionItemWithRef>>([])

  const { DomCollectionProvider } = createDomCollection({
    items,
    onItemsChange: setItems,
  })

  const disclosureState = createDisclosureState({
    open: () => mergedProps.open,
    defaultOpen: () => mergedProps.defaultOpen,
    onOpenChange: (isOpen) => mergedProps.onOpenChange?.(isOpen),
  })

  const { isMounted: contentPresent } = createPresence(
    () => rootContext.forceMount() || disclosureState.isOpen() || undefined,
    { transitionDuration: 0 },
  )

  const listState = createListState({
    selectionMode: 'none',
    dataSource: items,
  })

  const open = (focusStrategy: FocusStrategy | boolean) => {
    setFocusStrategy(focusStrategy)
    disclosureState.open()
  }

  const close = (recursively = false) => {
    disclosureState.close()

    if (recursively && parentMenuContext) {
      parentMenuContext.close(true)
    }
  }

  const toggle = (focusStrategy: FocusStrategy | boolean) => {
    setFocusStrategy(focusStrategy)
    disclosureState.toggle()
  }

  const _focusContent = () => {
    const content = contentRef()

    if (content) {
      content.focus({ preventScroll: true })
      listState.selectionManager().setFocused(true)
      listState.selectionManager().setFocusedKey(undefined)
    }
  }

  let focusTimer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(focusTimer)
    clearTimeout(pointerGraceTimeoutId)
  })
  const focusContent = () => {
    if (optionalNavigationMenuContext != null)
      focusTimer = setTimeout(() => untrack(_focusContent))
    else _focusContent()
  }

  createEffect(
    () => ({
      node: contentRef(),
      open: disclosureState.isOpen(),
      strategy: focusStrategy(),
    }),
    ({ node, open, strategy }) => {
      if (!node || !open || !strategy) return
      const timer = setTimeout(
        () =>
          untrack(() => {
            _focusContent()
            const collection = listState.collection()
            const key =
              strategy === 'last'
                ? collection.getLastKey()
                : collection.getFirstKey()
            listState.selectionManager().setFocusedKey(key)
          }),
        0,
      )
      return () => clearTimeout(timer)
    },
  )

  const registerNestedMenu = (element: HTMLElement) => {
    setNestedMenus((prev) => [...prev, element])

    const parentUnregister = parentMenuContext?.registerNestedMenu(element)

    return () => {
      setNestedMenus((prev) => prev.filter((item) => item !== element))
      parentUnregister?.()
    }
  }

  const isPointerMovingToSubmenu = (e: PointerEvent) => {
    const isMovingTowards = pointerDir === pointerGraceIntent?.side
    return isMovingTowards && isPointerInGraceArea(e, pointerGraceIntent?.area)
  }

  const onItemEnter = (e: PointerEvent) => {
    if (isPointerMovingToSubmenu(e)) {
      e.preventDefault()
    }
  }

  const onItemLeave = (e: PointerEvent) => {
    if (isPointerMovingToSubmenu(e)) {
      return
    }

    focusContent()
  }

  const onTriggerLeave = (e: PointerEvent) => {
    if (isPointerMovingToSubmenu(e)) {
      e.preventDefault()
    }
  }

  // aria-hide everything except the content (better supported equivalent to setting aria-modal)
  createHideOutside({
    disabled: () =>
      !(
        parentMenuContext == null &&
        disclosureState.isOpen() &&
        rootContext.isModal()
      ),
    targets: () =>
      [contentRef(), ...nestedMenus()].filter(Boolean) as Array<Element>,
    alwaysVisibleSelector: '[data-kb-top-layer], [data-live-announcer]',
  })

  createEffect(
    () => contentRef(),
    (contentEl) => {
      if (!contentEl || !parentMenuContext) return
      const parentUnregister = parentMenuContext.registerNestedMenu(contentEl)
      return () => parentUnregister()
    },
  )

  createEffect(
    () => [rootContext.value(), contentRef(), nestedMenus()] as const,
    ([rootValue, contentEl, menus]) => {
      if (parentMenuContext !== undefined) return
      optionalMenubarContext?.registerMenu(rootValue!, [contentEl!, ...menus])
    },
  )

  createEffect(
    () => {
      if (
        parentMenuContext !== undefined ||
        optionalMenubarContext === undefined
      )
        return undefined
      return {
        menubarValue: optionalMenubarContext.value(),
        rootValue: rootContext.value()!,
        trigger: triggerRef(),
        autoFocus: optionalMenubarContext.autoFocusMenu(),
      }
    },
    (state) => {
      if (!state) return
      if (state.menubarValue === state.rootValue) {
        state.trigger?.focus()
        if (state.autoFocus) open('first')
      } else {
        close()
      }
    },
  )

  createEffect(
    () => {
      if (
        parentMenuContext !== undefined ||
        optionalMenubarContext === undefined
      )
        return undefined
      return {
        isOpen: disclosureState.isOpen(),
        rootValue: rootContext.value()!,
      }
    },
    (state) => {
      if (!state) return
      if (state.isOpen) optionalMenubarContext!.setValue(state.rootValue)
    },
  )

  onCleanup(() => {
    if (parentMenuContext !== undefined) return
    optionalMenubarContext?.unregisterMenu(rootContext.value()!)
  })

  const dataset: Accessor<MenuDataSet> = createMemo(() => ({
    'data-expanded': disclosureState.isOpen() ? '' : undefined,
    'data-closed': !disclosureState.isOpen() ? '' : undefined,
  }))

  const context: MenuContextValue = {
    dataset,
    isOpen: disclosureState.isOpen,
    contentPresent,
    nestedMenus,
    currentPlacement,
    pointerGraceTimeoutId: () => pointerGraceTimeoutId,
    autoFocus: focusStrategy,
    listState: () => listState,
    parentMenuContext: () => parentMenuContext,
    triggerRef,
    contentRef,
    triggerId,
    contentId,
    setTriggerRef,
    setContentRef,
    open,
    close,
    toggle,
    focusContent,
    onItemEnter,
    onItemLeave,
    onTriggerLeave,
    setPointerDir: (dir: Side) => (pointerDir = dir),
    setPointerGraceTimeoutId: (id: number) => (pointerGraceTimeoutId = id),
    setPointerGraceIntent: (intent: GraceIntent | null) =>
      (pointerGraceIntent = intent),
    registerNestedMenu,
    registerItemToParentDomCollection: parentDomCollectionContext?.registerItem,
    registerTriggerId: createRegisterId(setTriggerId),
    registerContentId: createRegisterId(setContentId),
  }

  return (
    <DomCollectionProvider>
      <MenuContext value={context}>
        <Show
          when={optionalNavigationMenuContext === undefined}
          fallback={others.children}
        >
          <Popper
            anchorRef={triggerRef}
            contentRef={contentRef}
            onCurrentPlacementChange={setCurrentPlacement}
            {...others}
          />
        </Show>
      </MenuContext>
    </DomCollectionProvider>
  )
}
