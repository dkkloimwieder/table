import { omit } from 'solid-js'
import { MenuContent } from '../menu/index.ts'
import { useMenuContext } from '../menu/menu-context.tsx'
import { useMenuRootContext } from '../menu/menu-root-context.tsx'
import type {
  MenuContentCommonProps,
  MenuContentOptions,
  MenuContentRenderProps,
} from '../menu/index.ts'
import type { Component } from 'solid-js'
import type { ValidComponent } from '@solidjs/web'
import type { InteractOutsideEvent } from '@solid-primitives/interaction'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'

export interface DropdownMenuContentOptions extends MenuContentOptions {}

export interface DropdownMenuContentCommonProps<
  T extends HTMLElement = HTMLElement,
> extends MenuContentCommonProps<T> {}

export interface DropdownMenuContentRenderProps
  extends DropdownMenuContentCommonProps, MenuContentRenderProps {}

export type DropdownMenuContentProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = DropdownMenuContentOptions &
  Partial<DropdownMenuContentCommonProps<ElementOf<T>>>

/**
 * Contains the content to be rendered when the dropdown menu is open.
 */
export function DropdownMenuContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, DropdownMenuContentProps<T>>,
) {
  const rootContext = useMenuRootContext()
  const context = useMenuContext()

  const others = omit(props, 'onCloseAutoFocus', 'onInteractOutside')

  let hasInteractedOutside = false

  const onCloseAutoFocus = (e: Event) => {
    props.onCloseAutoFocus?.(e)
    if (e.defaultPrevented) return

    if (!hasInteractedOutside) {
      context.triggerRef()?.focus({ preventScroll: true })
    }

    hasInteractedOutside = false

    // Always prevent autofocus because we either focus manually or want user agent focus
    e.preventDefault()
  }

  const onInteractOutside = (e: InteractOutsideEvent) => {
    props.onInteractOutside?.(e)

    if (!rootContext.isModal() || e.detail.isContextMenu) {
      hasInteractedOutside = true
    }
  }

  return (
    <MenuContent<
      Component<
        Omit<DropdownMenuContentRenderProps, keyof MenuContentRenderProps>
      >
    >
      onCloseAutoFocus={onCloseAutoFocus}
      onInteractOutside={onInteractOutside}
      {...others}
    />
  )
}
