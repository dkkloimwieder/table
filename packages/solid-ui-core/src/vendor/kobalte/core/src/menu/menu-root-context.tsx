import { createContext, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { Orientation } from '../../../utils/src/index.ts'

export interface MenuRootContextValue {
  isModal: Accessor<boolean>
  preventScroll: Accessor<boolean>
  forceMount: Accessor<boolean>
  generateId: (part: string) => string
  orientation: Accessor<Orientation>

  /** Used for Menubar */
  value: Accessor<string | undefined>
}

export const MenuRootContext = createContext<MenuRootContextValue>()

export function useMenuRootContext() {
  const context = useContext(MenuRootContext)

  if (context === undefined) {
    throw new Error(
      '[kobalte]: `useMenuRootContext` must be used within a `MenuRoot` component',
    )
  }

  return context
}
