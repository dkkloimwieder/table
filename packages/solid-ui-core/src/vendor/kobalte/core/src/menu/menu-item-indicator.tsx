import { Show, merge, omit } from 'solid-js'

import { Polymorphic } from '../polymorphic/index.tsx'
import { useMenuItemContext } from './menu-item.context.tsx'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { MenuItemDataSet } from './menu-item.context.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface MenuItemIndicatorOptions {
  /**
   * Used to force mounting when more control is needed.
   * Useful when controlling animation with SolidJS animation libraries.
   */
  forceMount?: boolean
}

export interface MenuItemIndicatorCommonProps<
  _T extends HTMLElement = HTMLElement,
> {
  id: string
}

export interface MenuItemIndicatorRenderProps
  extends MenuItemIndicatorCommonProps, MenuItemDataSet {}

export type MenuItemIndicatorProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = MenuItemIndicatorOptions &
  Partial<MenuItemIndicatorCommonProps<ElementOf<T>>>

/**
 * The visual indicator rendered when the parent menu `CheckboxItem` or `RadioItem` is checked.
 * You can style this element directly, or you can use it as a wrapper to put an icon into, or both.
 */
export function MenuItemIndicator<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, MenuItemIndicatorProps<T>>,
) {
  const context = useMenuItemContext()

  const mergedProps = merge(
    {
      id: context.generateId('indicator'),
    },
    props as MenuItemIndicatorProps,
  )

  const others = omit(mergedProps, 'forceMount')

  return (
    <Show when={mergedProps.forceMount || context.isChecked()}>
      <Polymorphic<MenuItemIndicatorRenderProps>
        as="div"
        {...context.dataset()}
        {...others}
      />
    </Show>
  )
}
