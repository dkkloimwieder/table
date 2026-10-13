import { omit } from 'solid-js'

import { Polymorphic } from '../polymorphic/index.tsx'
import { usePopoverContext } from './popover-context.tsx'
import type { Ref } from 'solid-js'
import type { ElementOf, PolymorphicProps } from '../polymorphic/index.tsx'
import type { PopoverDataSet } from './popover-context.tsx'
import type { ValidComponent } from '@solidjs/web'

export interface PopoverAnchorOptions {}

export interface PopoverAnchorCommonProps<T extends HTMLElement = HTMLElement> {
  ref: Ref<T>
}

export interface PopoverAnchorRenderProps
  extends PopoverAnchorCommonProps, PopoverDataSet {}

export type PopoverAnchorProps<
  T extends ValidComponent | HTMLElement = HTMLElement,
> = PopoverAnchorOptions & Partial<PopoverAnchorCommonProps<ElementOf<T>>>

/**
 * An optional element to position the `Popover.Content` against.
 * If this part is not used, the content will position alongside the `Popover.Trigger`.
 */
export function PopoverAnchor<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, PopoverAnchorProps<T>>,
) {
  const context = usePopoverContext()

  const others = omit(props as PopoverAnchorProps, 'ref')

  return (
    <Polymorphic<PopoverAnchorRenderProps>
      as="div"
      ref={[context.setDefaultAnchorRef, (props as PopoverAnchorProps).ref]}
      {...context.dataset()}
      {...others}
    />
  )
}
