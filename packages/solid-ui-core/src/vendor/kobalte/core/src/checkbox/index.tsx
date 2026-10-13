import { CheckboxControl as Control } from './checkbox-control.tsx'
import { CheckboxDescription as Description } from './checkbox-description.tsx'
import { CheckboxErrorMessage as ErrorMessage } from './checkbox-error-message.tsx'
import { CheckboxIndicator as Indicator } from './checkbox-indicator.tsx'
import { CheckboxInput as Input } from './checkbox-input.tsx'
import { CheckboxLabel as Label } from './checkbox-label.tsx'
import { CheckboxRoot as Root } from './checkbox-root.tsx'
import type {
  CheckboxControlCommonProps,
  CheckboxControlOptions,
  CheckboxControlProps,
  CheckboxControlRenderProps,
} from './checkbox-control.tsx'
import type {
  CheckboxDescriptionCommonProps,
  CheckboxDescriptionOptions,
  CheckboxDescriptionProps,
  CheckboxDescriptionRenderProps,
} from './checkbox-description.tsx'
import type {
  CheckboxErrorMessageCommonProps,
  CheckboxErrorMessageOptions,
  CheckboxErrorMessageProps,
  CheckboxErrorMessageRenderProps,
} from './checkbox-error-message.tsx'
import type {
  CheckboxIndicatorCommonProps,
  CheckboxIndicatorOptions,
  CheckboxIndicatorProps,
  CheckboxIndicatorRenderProps,
} from './checkbox-indicator.tsx'
import type {
  CheckboxInputCommonProps,
  CheckboxInputOptions,
  CheckboxInputProps,
  CheckboxInputRenderProps,
} from './checkbox-input.tsx'
import type {
  CheckboxLabelCommonProps,
  CheckboxLabelOptions,
  CheckboxLabelProps,
  CheckboxLabelRenderProps,
} from './checkbox-label.tsx'
import type {
  CheckboxRootOptions,
  CheckboxRootProps,
} from './checkbox-root.tsx'

export type {
  CheckboxControlCommonProps,
  CheckboxControlOptions,
  CheckboxControlProps,
  CheckboxControlRenderProps,
  CheckboxDescriptionCommonProps,
  CheckboxDescriptionOptions,
  CheckboxDescriptionProps,
  CheckboxDescriptionRenderProps,
  CheckboxErrorMessageCommonProps,
  CheckboxErrorMessageOptions,
  CheckboxErrorMessageProps,
  CheckboxErrorMessageRenderProps,
  CheckboxIndicatorCommonProps,
  CheckboxIndicatorOptions,
  CheckboxIndicatorProps,
  CheckboxIndicatorRenderProps,
  CheckboxInputCommonProps,
  CheckboxInputOptions,
  CheckboxInputProps,
  CheckboxInputRenderProps,
  CheckboxLabelCommonProps,
  CheckboxLabelOptions,
  CheckboxLabelProps,
  CheckboxLabelRenderProps,
  CheckboxRootOptions,
  CheckboxRootProps,
}
export { Control, Description, ErrorMessage, Indicator, Input, Label, Root }

export const Checkbox = Object.assign(Root, {
  Control,
  Description,
  ErrorMessage,
  Indicator,
  Input,
  Label,
})

/**
 * API will most change
 */
export {
  type CheckboxContextValue,
  useCheckboxContext,
} from './checkbox-context.tsx'
