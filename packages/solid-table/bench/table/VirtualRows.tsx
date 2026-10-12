import { For, Show } from 'solid-js'
import type { JSX } from '@solidjs/web'
import type { VirtualWindow } from './virtualWindow'

/** The layout is static. Applications supply row contents and own their data. */
export function VirtualRows<Key extends string | number>(props: {
  window: VirtualWindow<Key>
  layout: 'table' | 'block'
  renderRow: (key: Key) => JSX.Element
  columns?: () => number
  width?: number
  bodyClass?: string
  windowClass?: string
}) {
  const rows = () => (
    <For each={props.window.getKeys()}>{(key) => props.renderRow(key)}</For>
  )
  const spacer = (height: () => number) => (
    <tbody aria-hidden="true">
      <tr style={{ height: 0 }}>
        <td
          colspan={props.columns?.() ?? 1}
          style={{ height: `${height()}px`, padding: 0, border: 0 }}
        />
      </tr>
    </tbody>
  )
  return (
    <Show
      when={props.layout === 'table'}
      fallback={
        <div
          class={props.bodyClass}
          style={{
            position: 'relative',
            height: `${props.window.getTotalSize()}px`,
            width: props.width === undefined ? undefined : `${props.width}px`,
          }}
        >
          <div
            class={props.windowClass}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${props.window.getStart()}px)`,
            }}
          >
            {rows()}
          </div>
        </div>
      }
    >
      {spacer(() => props.window.getStart())}
      {rows()}
      {spacer(() =>
        Math.max(0, props.window.getTotalSize() - props.window.getEnd()),
      )}
    </Show>
  )
}
