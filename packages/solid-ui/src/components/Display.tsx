import { nativeEventProps, ownedElementEvents } from '@table/ui-core/events'
import { omit } from 'solid-js'
import type { JSX } from '@solidjs/web'

export type DisplayTone = 'neutral' | 'success' | 'warning' | 'error'
export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement> & {
  tone?: DisplayTone
}
export function Badge(props: BadgeProps) {
  const attributes = omit(props, 'tone', 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <span
      {...attributes}
      class={'ui-badge ' + (props.class ?? '')}
      data-tone={props.tone ?? 'neutral'}
      ref={[props.ref, events]}
    />
  )
}
export type CardProps = JSX.HTMLAttributes<HTMLDivElement>
export function Card(props: CardProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      class={'ui-card ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type SeparatorProps = JSX.HTMLAttributes<HTMLHRElement> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}
export function Separator(props: SeparatorProps) {
  const attributes = omit(
    props,
    'orientation',
    'decorative',
    'ref',
    ...nativeEventProps,
  )
  const events = ownedElementEvents(props)
  return (
    <hr
      {...attributes}
      role={props.decorative ? 'presentation' : 'separator'}
      aria-orientation={
        props.decorative ? undefined : (props.orientation ?? 'horizontal')
      }
      data-orientation={props.orientation ?? 'horizontal'}
      class={'ui-separator ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type InlineAlertProps = JSX.HTMLAttributes<HTMLDivElement> & {
  tone?: DisplayTone
  announce?: 'off' | 'polite' | 'assertive'
}
export function InlineAlert(props: InlineAlertProps) {
  const attributes = omit(props, 'tone', 'announce', 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      role={
        props.announce === 'assertive'
          ? 'alert'
          : props.announce === 'polite'
            ? 'status'
            : undefined
      }
      aria-live={props.announce ?? 'off'}
      aria-atomic={
        props.announce && props.announce !== 'off' ? 'true' : undefined
      }
      data-tone={props.tone ?? 'neutral'}
      class={'ui-inline-alert ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type EmptyStateProps = JSX.HTMLAttributes<HTMLDivElement>
export function EmptyState(props: EmptyStateProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      class={'ui-empty-state ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type SpinnerProps = JSX.HTMLAttributes<HTMLSpanElement>
export function Spinner(props: SpinnerProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <span
      {...attributes}
      role={props.role ?? (props['aria-label'] ? 'img' : undefined)}
      aria-hidden={props['aria-label'] ? undefined : 'true'}
      class={'ui-spinner ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type SkeletonProps = JSX.HTMLAttributes<HTMLDivElement>
export function Skeleton(props: SkeletonProps) {
  const attributes = omit(props, 'ref', ...nativeEventProps)
  const events = ownedElementEvents(props)
  return (
    <div
      {...attributes}
      aria-hidden="true"
      class={'ui-skeleton ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
export type ProgressProps = JSX.ProgressHTMLAttributes<HTMLProgressElement>
export function Progress(props: ProgressProps) {
  const attributes = omit(props, 'ref', 'value', 'max', ...nativeEventProps)
  const events = ownedElementEvents(props)
  const maximum = () =>
    (typeof props.max === 'number' || typeof props.max === 'string') &&
    Number.isFinite(Number(props.max)) &&
    Number(props.max) > 0
      ? Number(props.max)
      : 100
  const value = () =>
    (typeof props.value !== 'number' && typeof props.value !== 'string') ||
    !Number.isFinite(Number(props.value))
      ? undefined
      : Math.max(0, Math.min(maximum(), Number(props.value)))
  return (
    <progress
      {...attributes}
      max={maximum()}
      value={value()}
      class={'ui-progress ' + (props.class ?? '')}
      ref={[props.ref, events]}
    />
  )
}
