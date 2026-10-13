import { useLocale } from '../i18n/index.tsx'
import { Menu } from './menu.tsx'
import type { MenuOptions } from './menu.tsx'
import type { ParentProps } from 'solid-js'

export interface MenuSubOptions extends Omit<
  MenuOptions,
  'placement' | 'flip' | 'sameWidth'
> {}

export interface MenuSubProps extends ParentProps<MenuSubOptions> {}

/**
 * Contains all the parts of a submenu.
 */
export function MenuSub(props: MenuSubProps) {
  const { direction } = useLocale()

  return (
    <Menu
      placement={direction() === 'rtl' ? 'left-start' : 'right-start'}
      flip
      {...props}
    />
  )
}
