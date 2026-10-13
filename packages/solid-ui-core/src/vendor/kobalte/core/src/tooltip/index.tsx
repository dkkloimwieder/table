import { Arrow } from '../popper/index.tsx'
import { TooltipContent as Content } from './tooltip-content.tsx'
import { TooltipPortal as Portal } from './tooltip-portal.tsx'
import { TooltipRoot as Root } from './tooltip-root.tsx'
import { TooltipTrigger as Trigger } from './tooltip-trigger.tsx'
import type {
  PopperArrowCommonProps as TooltipArrowCommonProps,
  PopperArrowOptions as TooltipArrowOptions,
  PopperArrowProps as TooltipArrowProps,
  PopperArrowRenderProps as TooltipArrowRenderProps,
} from '../popper/index.tsx'
import type {
  TooltipContentCommonProps,
  TooltipContentOptions,
  TooltipContentProps,
  TooltipContentRenderProps,
} from './tooltip-content.tsx'
import type { TooltipPortalProps } from './tooltip-portal.tsx'
import type { TooltipRootOptions, TooltipRootProps } from './tooltip-root.tsx'
import type {
  TooltipTriggerCommonProps,
  TooltipTriggerOptions,
  TooltipTriggerProps,
  TooltipTriggerRenderProps,
} from './tooltip-trigger.tsx'

export type {
  TooltipArrowCommonProps,
  TooltipArrowOptions,
  TooltipArrowProps,
  TooltipArrowRenderProps,
  TooltipContentCommonProps,
  TooltipContentOptions,
  TooltipContentProps,
  TooltipContentRenderProps,
  TooltipPortalProps,
  TooltipRootOptions,
  TooltipRootProps,
  TooltipTriggerCommonProps,
  TooltipTriggerOptions,
  TooltipTriggerProps,
  TooltipTriggerRenderProps,
}

export { Arrow, Content, Portal, Root, Trigger }

export const Tooltip = Object.assign(Root, {
  Arrow,
  Content,
  Portal,
  Trigger,
})

/**
 * API will most change
 */
export {
  type TooltipContextValue,
  useTooltipContext,
} from './tooltip-context.tsx'
