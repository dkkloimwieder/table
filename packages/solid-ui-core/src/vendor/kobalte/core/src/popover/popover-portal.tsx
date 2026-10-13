import { Portal } from '@solidjs/web'
import { Show } from 'solid-js'

import { usePopoverContext } from './popover-context.tsx'
import type { ComponentProps } from '@solidjs/web'

export interface PopoverPortalProps extends ComponentProps<typeof Portal> {}

/**
 * Portals its children into the `body` when the popover is open.
 */
export function PopoverPortal(props: PopoverPortalProps) {
  const context = usePopoverContext()

  return (
    <Show when={context.contentPresent()}>
      <Portal {...props} />
    </Show>
  )
}
