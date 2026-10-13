import {
  FormControlDescription as Description,
  FormControlErrorMessage as ErrorMessage,
} from '../form-control/index.ts'
import { RadioGroupItem as Item } from './radio-group-item.tsx'
import { RadioGroupItemControl as ItemControl } from './radio-group-item-control.tsx'
import { RadioGroupItemDescription as ItemDescription } from './radio-group-item-description.tsx'
import { RadioGroupItemIndicator as ItemIndicator } from './radio-group-item-indicator.tsx'
import { RadioGroupItemInput as ItemInput } from './radio-group-item-input.tsx'
import { RadioGroupItemLabel as ItemLabel } from './radio-group-item-label.tsx'
import { RadioGroupLabel as Label } from './radio-group-label.tsx'
import { RadioGroupRoot as Root } from './radio-group-root.tsx'
import type {
  FormControlDescriptionCommonProps as RadioGroupDescriptionCommonProps,
  FormControlDescriptionOptions as RadioGroupDescriptionOptions,
  FormControlDescriptionProps as RadioGroupDescriptionProps,
  FormControlDescriptionRenderProps as RadioGroupDescriptionRenderProps,
  FormControlErrorMessageCommonProps as RadioGroupErrorMessageCommonProps,
  FormControlErrorMessageOptions as RadioGroupErrorMessageOptions,
  FormControlErrorMessageProps as RadioGroupErrorMessageProps,
  FormControlErrorMessageRenderProps as RadioGroupErrorMessageRenderProps,
} from '../form-control/index.ts'
import type {
  RadioGroupItemCommonProps,
  RadioGroupItemOptions,
  RadioGroupItemProps,
  RadioGroupItemRenderProps,
} from './radio-group-item.tsx'
import type {
  RadioGroupItemControlCommonProps,
  RadioGroupItemControlOptions,
  RadioGroupItemControlProps,
  RadioGroupItemControlRenderProps,
} from './radio-group-item-control.tsx'
import type {
  RadioGroupItemDescriptionCommonProps,
  RadioGroupItemDescriptionOptions,
  RadioGroupItemDescriptionProps,
  RadioGroupItemDescriptionRenderProps,
} from './radio-group-item-description.tsx'
import type {
  RadioGroupItemIndicatorCommonProps,
  RadioGroupItemIndicatorOptions,
  RadioGroupItemIndicatorProps,
  RadioGroupItemIndicatorRenderProps,
} from './radio-group-item-indicator.tsx'
import type {
  RadioGroupItemInputCommonProps,
  RadioGroupItemInputOptions,
  RadioGroupItemInputProps,
  RadioGroupItemInputRenderProps,
} from './radio-group-item-input.tsx'
import type {
  RadioGroupItemLabelCommonProps,
  RadioGroupItemLabelOptions,
  RadioGroupItemLabelProps,
  RadioGroupItemLabelRenderProps,
} from './radio-group-item-label.tsx'
import type {
  RadioGroupLabelCommonProps,
  RadioGroupLabelOptions,
  RadioGroupLabelProps,
  RadioGroupLabelRenderProps,
} from './radio-group-label.tsx'
import type {
  RadioGroupRootCommonProps,
  RadioGroupRootOptions,
  RadioGroupRootProps,
  RadioGroupRootRenderProps,
} from './radio-group-root.tsx'

export type {
  RadioGroupDescriptionCommonProps,
  RadioGroupDescriptionOptions,
  RadioGroupDescriptionProps,
  RadioGroupDescriptionRenderProps,
  RadioGroupErrorMessageCommonProps,
  RadioGroupErrorMessageOptions,
  RadioGroupErrorMessageProps,
  RadioGroupErrorMessageRenderProps,
  RadioGroupItemCommonProps,
  RadioGroupItemControlCommonProps,
  RadioGroupItemControlOptions,
  RadioGroupItemControlProps,
  RadioGroupItemControlRenderProps,
  RadioGroupItemDescriptionCommonProps,
  RadioGroupItemDescriptionOptions,
  RadioGroupItemDescriptionProps,
  RadioGroupItemDescriptionRenderProps,
  RadioGroupItemIndicatorCommonProps,
  RadioGroupItemIndicatorOptions,
  RadioGroupItemIndicatorProps,
  RadioGroupItemIndicatorRenderProps,
  RadioGroupItemInputCommonProps,
  RadioGroupItemInputOptions,
  RadioGroupItemInputProps,
  RadioGroupItemInputRenderProps,
  RadioGroupItemLabelCommonProps,
  RadioGroupItemLabelOptions,
  RadioGroupItemLabelProps,
  RadioGroupItemLabelRenderProps,
  RadioGroupItemOptions,
  RadioGroupItemProps,
  RadioGroupItemRenderProps,
  RadioGroupLabelCommonProps,
  RadioGroupLabelOptions,
  RadioGroupLabelProps,
  RadioGroupLabelRenderProps,
  RadioGroupRootCommonProps,
  RadioGroupRootOptions,
  RadioGroupRootProps,
  RadioGroupRootRenderProps,
}

export {
  Description,
  ErrorMessage,
  Item,
  ItemControl,
  ItemDescription,
  ItemIndicator,
  ItemInput,
  ItemLabel,
  Label,
  Root,
}

export const RadioGroup = Object.assign(Root, {
  Description,
  ErrorMessage,
  Item,
  ItemControl,
  ItemDescription,
  ItemIndicator,
  ItemInput,
  ItemLabel,
  Label,
})

/**
 * API will most change
 */
export {
  type RadioGroupContextValue,
  useRadioGroupContext,
} from './radio-group-context.tsx'
