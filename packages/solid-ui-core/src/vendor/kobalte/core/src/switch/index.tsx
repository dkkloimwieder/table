import { SwitchControl as Control } from './switch-control.tsx'
import { SwitchDescription as Description } from './switch-description.tsx'
import { SwitchErrorMessage as ErrorMessage } from './switch-error-message.tsx'
import { SwitchInput as Input } from './switch-input.tsx'
import { SwitchLabel as Label } from './switch-label.tsx'
import { SwitchRoot as Root } from './switch-root.tsx'
import { SwitchThumb as Thumb } from './switch-thumb.tsx'
import type {
  SwitchControlCommonProps,
  SwitchControlOptions,
  SwitchControlProps,
  SwitchControlRenderProps,
} from './switch-control.tsx'
import type {
  SwitchDescriptionCommonProps,
  SwitchDescriptionOptions,
  SwitchDescriptionProps,
  SwitchDescriptionRenderProps,
} from './switch-description.tsx'
import type {
  SwitchErrorMessageCommonProps,
  SwitchErrorMessageOptions,
  SwitchErrorMessageProps,
  SwitchErrorMessageRenderProps,
} from './switch-error-message.tsx'
import type {
  SwitchInputCommonProps,
  SwitchInputOptions,
  SwitchInputProps,
  SwitchInputRenderProps,
} from './switch-input.tsx'
import type {
  SwitchLabelCommonProps,
  SwitchLabelOptions,
  SwitchLabelProps,
  SwitchLabelRenderProps,
} from './switch-label.tsx'
import type {
  SwitchRootCommonProps,
  SwitchRootOptions,
  SwitchRootProps,
  SwitchRootRenderProps,
} from './switch-root.tsx'
import type {
  SwitchThumbCommonProps,
  SwitchThumbOptions,
  SwitchThumbProps,
  SwitchThumbRenderProps,
} from './switch-thumb.tsx'

export type {
  SwitchControlCommonProps,
  SwitchControlOptions,
  SwitchControlProps,
  SwitchControlRenderProps,
  SwitchDescriptionCommonProps,
  SwitchDescriptionOptions,
  SwitchDescriptionProps,
  SwitchDescriptionRenderProps,
  SwitchErrorMessageCommonProps,
  SwitchErrorMessageOptions,
  SwitchErrorMessageProps,
  SwitchErrorMessageRenderProps,
  SwitchInputCommonProps,
  SwitchInputOptions,
  SwitchInputProps,
  SwitchInputRenderProps,
  SwitchLabelCommonProps,
  SwitchLabelOptions,
  SwitchLabelProps,
  SwitchLabelRenderProps,
  SwitchRootCommonProps,
  SwitchRootOptions,
  SwitchRootProps,
  SwitchRootRenderProps,
  SwitchThumbCommonProps,
  SwitchThumbOptions,
  SwitchThumbProps,
  SwitchThumbRenderProps,
}
export { Control, Description, ErrorMessage, Input, Label, Root, Thumb }

export const Switch = Object.assign(Root, {
  Control,
  Description,
  ErrorMessage,
  Input,
  Label,
  Thumb,
})

/**
 * API will most change
 */
export { type SwitchContextValue, useSwitchContext } from './switch-context.tsx'
