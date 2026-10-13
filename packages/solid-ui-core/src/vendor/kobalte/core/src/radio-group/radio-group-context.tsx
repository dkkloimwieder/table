import { createContext, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'

export interface RadioGroupContextValue {
  ariaDescribedBy: Accessor<string | undefined>
  isDefaultValue: (value: string) => boolean
  isSelectedValue: (value: string) => boolean
  setSelectedValue: (value: string) => void
}

export const RadioGroupContext = createContext<RadioGroupContextValue>()

export function useRadioGroupContext() {
  const context = useContext(RadioGroupContext)

  if (context === undefined) {
    throw new Error(
      '[kobalte]: `useRadioGroupContext` must be used within a `RadioGroup` component',
    )
  }

  return context
}
