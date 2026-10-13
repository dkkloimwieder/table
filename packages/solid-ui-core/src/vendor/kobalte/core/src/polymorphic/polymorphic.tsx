import { Dynamic } from '@solidjs/web'
import { omit, untrack } from 'solid-js'
import {
  nativeEventProps,
  ownedElementEvents,
} from '../../../../../ownedEvents.ts'
import type { ComponentProps, JSX, ValidComponent } from '@solidjs/web'

/* -------------------------------------------------------------------------------------------------
 * Polymorphic
 * -----------------------------------------------------------------------------------------------*/

/**
 * Allows for extending a set of props (`Source`) by an overriding set of props (`Override`),
 * ensuring that any duplicates are overridden by the overriding set of props.
 */
export type OverrideProps<Source = {}, Override = {}> = Omit<
  Source,
  keyof Override
> &
  Override

/**
 * Allows for extending a set of `ComponentProps` by an overriding set of props,
 * ensuring that any duplicates are overridden by the overriding set of props.
 */
export type OverrideComponentProps<T extends ValidComponent, P> = OverrideProps<
  ComponentProps<T>,
  P
>

export type ElementOf<T> = T extends HTMLElement
  ? T
  : T extends keyof HTMLElementTagNameMap
    ? HTMLElementTagNameMap[T]
    : any

/**
 * Polymorphic attribute.
 */
export interface PolymorphicAttributes<T extends ValidComponent> {
  as?: T | keyof JSX.HTMLElementTags
}

/**
 * Props used by a polymorphic component.
 */
export type PolymorphicProps<
  T extends ValidComponent,
  Props extends {} = {},
> = OverrideProps<
  ComponentProps<T>, // Override props from custom/tag component with our own
  Props & // Accept custom props of our own component
    PolymorphicAttributes<T>
>

/**
 * Helper type to get the exact props in Polymnorphic `as` callback.
 */
export type PolymorphicCallbackProps<
  CustomProps extends {},
  Options extends {},
  RenderProps extends {},
> = Omit<CustomProps, keyof Options | keyof RenderProps> & RenderProps

/**
 * A utility component that render its `as` prop.
 */
export function Polymorphic<RenderProps>(
  props: RenderProps & PolymorphicAttributes<ValidComponent>,
): JSX.Element {
  const others = omit(props, 'as')

  if (!untrack(() => props.as)) {
    throw new Error('[kobalte]: Polymorphic is missing the required `as` prop.')
  }

  if (typeof untrack(() => props.as) !== 'string') {
    return <Dynamic {...others} component={props.as} />
  }
  const nativeProps = others as JSX.HTMLAttributes<HTMLElement>
  const attributes = omit(nativeProps, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(nativeProps)
  // Refs bind at element creation. Keep this one-time callback read explicit.
  const forwardedRef = untrack(() => nativeProps.ref)
  return (
    <Dynamic
      {...attributes}
      component={props.as}
      ref={[forwardedRef, events]}
    />
  )
}
