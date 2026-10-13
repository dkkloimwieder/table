/*
 * Portions of this file are based on code from react-spectrum.
 * Apache License Version 2.0, Copyright 2020 Adobe.
 *
 * Credits to the React Spectrum team:
 * https://github.com/adobe/react-spectrum/blob/b35d5c02fe900badccd0cf1a8f23bb593419f238/packages/@react-aria/listbox/src/useOption.ts
 */

import { createEffect, merge, omit } from 'solid-js'

import { Polymorphic } from '../polymorphic/index.tsx'
import { useMenuItemContext } from './menu-item.context.tsx'
import type { Ref } from 'solid-js'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { MenuItemDataSet } from './menu-item.context.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface MenuItemLabelOptions {}

export interface MenuItemLabelCommonProps<T extends HTMLElement = HTMLElement> {
  id: string
  ref: Ref<T>
}

export interface MenuItemLabelRenderProps
  extends MenuItemLabelCommonProps, MenuItemDataSet {}

export type MenuItemLabelProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = MenuItemLabelOptions & Partial<MenuItemLabelCommonProps<ElementOf<T>>>

/**
 * An accessible label to be announced for the menu item.
 * Useful for menu items that have more complex content (e.g. icons, multiple lines of text, etc.)
 */
export function MenuItemLabel<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, MenuItemLabelProps<T>>,
) {
  const context = useMenuItemContext()

  const mergedProps = merge(
    {
      id: context.generateId('label'),
    },
    props as MenuItemLabelProps,
  )

  const others = omit(mergedProps, 'ref', 'id')

  createEffect(
    () => mergedProps.id,
    (id) => context.registerLabel(id),
  )

  return (
    <Polymorphic<MenuItemLabelRenderProps>
      as="div"
      ref={[context.setLabelRef, mergedProps.ref]}
      id={mergedProps.id}
      {...context.dataset()}
      {...others}
    />
  )
}
