import { DialogCloseButton as CloseButton } from './dialog-close-button.tsx'
import { DialogContent as Content } from './dialog-content.tsx'
import { DialogDescription as Description } from './dialog-description.tsx'
import { DialogOverlay as Overlay } from './dialog-overlay.tsx'
import { DialogPortal as Portal } from './dialog-portal.tsx'
import { DialogRoot as Root } from './dialog-root.tsx'
import { DialogTitle as Title } from './dialog-title.tsx'
import { DialogTrigger as Trigger } from './dialog-trigger.tsx'
import type {
  DialogCloseButtonCommonProps,
  DialogCloseButtonOptions,
  DialogCloseButtonProps,
  DialogCloseButtonRenderProps,
} from './dialog-close-button.tsx'
import type {
  DialogContentCommonProps,
  DialogContentOptions,
  DialogContentProps,
  DialogContentRenderProps,
} from './dialog-content.tsx'
import type {
  DialogDescriptionCommonProps,
  DialogDescriptionOptions,
  DialogDescriptionProps,
  DialogDescriptionRenderProps,
} from './dialog-description.tsx'
import type {
  DialogOverlayCommonProps,
  DialogOverlayOptions,
  DialogOverlayProps,
  DialogOverlayRenderProps,
} from './dialog-overlay.tsx'
import type { DialogPortalProps } from './dialog-portal.tsx'
import type { DialogRootOptions, DialogRootProps } from './dialog-root.tsx'
import type {
  DialogTitleCommonProps,
  DialogTitleOptions,
  DialogTitleProps,
  DialogTitleRenderProps,
} from './dialog-title.tsx'
import type {
  DialogTriggerCommonProps,
  DialogTriggerOptions,
  DialogTriggerProps,
  DialogTriggerRenderProps,
} from './dialog-trigger.tsx'

export type {
  DialogCloseButtonCommonProps,
  DialogCloseButtonOptions,
  DialogCloseButtonProps,
  DialogCloseButtonRenderProps,
  DialogContentCommonProps,
  DialogContentOptions,
  DialogContentProps,
  DialogContentRenderProps,
  DialogDescriptionCommonProps,
  DialogDescriptionOptions,
  DialogDescriptionProps,
  DialogDescriptionRenderProps,
  DialogOverlayCommonProps,
  DialogOverlayOptions,
  DialogOverlayProps,
  DialogOverlayRenderProps,
  DialogPortalProps,
  DialogRootOptions,
  DialogRootProps,
  DialogTitleCommonProps,
  DialogTitleOptions,
  DialogTitleProps,
  DialogTitleRenderProps,
  DialogTriggerCommonProps,
  DialogTriggerOptions,
  DialogTriggerProps,
  DialogTriggerRenderProps,
}

export {
  CloseButton,
  Content,
  Description,
  Overlay,
  Portal,
  Root,
  Title,
  Trigger,
}

export const Dialog = Object.assign(Root, {
  CloseButton,
  Content,
  Description,
  Overlay,
  Portal,
  Title,
  Trigger,
})

/**
 * API will most change
 */
export { type DialogContextValue, useDialogContext } from './dialog-context.tsx'
