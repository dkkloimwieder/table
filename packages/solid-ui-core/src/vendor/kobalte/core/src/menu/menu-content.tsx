import { createPreventScroll } from '@solid-primitives/scroll'
import { createSignal, omit } from 'solid-js'
import { MenuContentBase } from './menu-content-base.tsx'
import { useMenuContext } from './menu-context.tsx'
import { useMenuRootContext } from './menu-root-context.tsx'
import type {
  MenuContentBaseCommonProps,
  MenuContentBaseOptions,
  MenuContentBaseRenderProps,
} from './menu-content-base.tsx'
import type { Component } from 'solid-js'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface MenuContentOptions extends MenuContentBaseOptions {}

export interface MenuContentCommonProps<
  T extends HTMLElement = HTMLElement,
> extends MenuContentBaseCommonProps<T> {}

export interface MenuContentRenderProps
  extends MenuContentCommonProps, MenuContentBaseRenderProps {}

export type MenuContentProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = MenuContentOptions & Partial<MenuContentCommonProps<ElementOf<T>>>

export function MenuContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, MenuContentProps<T>>,
) {
  const [ref, setRef] = createSignal<HTMLElement | undefined>(undefined, {
    ownedWrite: true,
  })

  const rootContext = useMenuRootContext()
  const context = useMenuContext()

  const others = omit(props as MenuContentProps, 'ref')

  createPreventScroll({
    element: ref,
    enabled: () => context.isOpen() && rootContext.preventScroll(),
  })

  return (
    <MenuContentBase<
      Component<Omit<MenuContentRenderProps, keyof MenuContentBaseRenderProps>>
    >
      ref={[setRef, props.ref]}
      {...others}
    />
  )
}
