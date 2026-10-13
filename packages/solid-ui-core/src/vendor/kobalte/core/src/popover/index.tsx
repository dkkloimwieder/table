import { Arrow } from '../popper/index.tsx'
import { PopoverAnchor as Anchor } from './popover-anchor.tsx'
import { PopoverCloseButton as CloseButton } from './popover-close-button.tsx'
import { PopoverContent as Content } from './popover-content.tsx'
import { PopoverDescription as Description } from './popover-description.tsx'
import { PopoverPortal as Portal } from './popover-portal.tsx'
import { PopoverRoot as Root } from './popover-root.tsx'
import { PopoverTitle as Title } from './popover-title.tsx'
import { PopoverTrigger as Trigger } from './popover-trigger.tsx'
import type {
  PopperArrowCommonProps as PopoverArrowCommonProps,
  PopperArrowOptions as PopoverArrowOptions,
  PopperArrowProps as PopoverArrowProps,
  PopperArrowRenderProps as PopoverArrowRenderProps,
} from '../popper/index.tsx'
import type {
  PopoverAnchorCommonProps,
  PopoverAnchorOptions,
  PopoverAnchorProps,
  PopoverAnchorRenderProps,
} from './popover-anchor.tsx'
import type {
  PopoverCloseButtonCommonProps,
  PopoverCloseButtonOptions,
  PopoverCloseButtonProps,
  PopoverCloseButtonRenderProps,
} from './popover-close-button.tsx'
import type {
  PopoverContentCommonProps,
  PopoverContentOptions,
  PopoverContentProps,
  PopoverContentRenderProps,
} from './popover-content.tsx'
import type {
  PopoverDescriptionCommonProps,
  PopoverDescriptionOptions,
  PopoverDescriptionProps,
  PopoverDescriptionRenderProps,
} from './popover-description.tsx'
import type { PopoverPortalProps } from './popover-portal.tsx'
import type { PopoverRootOptions, PopoverRootProps } from './popover-root.tsx'
import type {
  PopoverTitleCommonProps,
  PopoverTitleOptions,
  PopoverTitleProps,
  PopoverTitleRenderProps,
} from './popover-title.tsx'
import type {
  PopoverTriggerCommonProps,
  PopoverTriggerOptions,
  PopoverTriggerProps,
  PopoverTriggerRenderProps,
} from './popover-trigger.tsx'

export type {
  PopoverAnchorCommonProps,
  PopoverAnchorOptions,
  PopoverAnchorProps,
  PopoverAnchorRenderProps,
  PopoverArrowCommonProps,
  PopoverArrowOptions,
  PopoverArrowProps,
  PopoverArrowRenderProps,
  PopoverCloseButtonCommonProps,
  PopoverCloseButtonOptions,
  PopoverCloseButtonProps,
  PopoverCloseButtonRenderProps,
  PopoverContentCommonProps,
  PopoverContentOptions,
  PopoverContentProps,
  PopoverContentRenderProps,
  PopoverDescriptionCommonProps,
  PopoverDescriptionOptions,
  PopoverDescriptionProps,
  PopoverDescriptionRenderProps,
  PopoverPortalProps,
  PopoverRootOptions,
  PopoverRootProps,
  PopoverTitleCommonProps,
  PopoverTitleOptions,
  PopoverTitleProps,
  PopoverTitleRenderProps,
  PopoverTriggerCommonProps,
  PopoverTriggerOptions,
  PopoverTriggerProps,
  PopoverTriggerRenderProps,
}

export {
  Anchor,
  Arrow,
  CloseButton,
  Content,
  Description,
  Portal,
  Root,
  Title,
  Trigger,
}

export const Popover = Object.assign(Root, {
  Anchor,
  Arrow,
  CloseButton,
  Content,
  Description,
  Portal,
  Title,
  Trigger,
})

/**
 * API will most change
 */
export {
  type PopoverContextValue,
  usePopoverContext,
} from './popover-context.tsx'
