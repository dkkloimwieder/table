// Lazy materialization for the lanes===1 fast path. Backed by a
// Float64Array (stride 2: start, size, …); VirtualItems are constructed on
// first indexed read, replacing the stored key. Saves the per-item object
// allocation at large list counts where most items are never visible.

import type { VirtualItem } from './index'

export function getMeasurementKey(
  item: VirtualItem | VirtualItem['key'],
): VirtualItem['key'] {
  return typeof item === 'object' ? item.key : item
}

export function createLazyMeasurementsView(
  cache: Array<VirtualItem | VirtualItem['key']>,
  flat: Float64Array,
): Array<VirtualItem> {
  const count = cache.length
  return new Proxy(cache, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        // Cheap digit-prefix sniff before number coerce.
        const c = prop.charCodeAt(0)
        if (c >= 48 && c <= 57) {
          const i = +prop
          if (Number.isInteger(i) && i >= 0 && i < count) {
            let v = target[i]!
            if (typeof v !== 'object') {
              const s = flat[i * 2]!
              v = target[i] = {
                index: i,
                key: v,
                start: s,
                size: flat[i * 2 + 1]!,
                end: s + flat[i * 2 + 1]!,
                lane: 0,
              }
            }
            return v
          }
        }
        if (prop === 'length') return count
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Array<VirtualItem>
}

/** Fixed rows expose the same measurement view without per-row backing storage. */
export function createFixedMeasurementsView(
  count: number,
  size: number,
  start: number,
  gap: number,
  getItemKey: (index: number) => VirtualItem['key'],
): Array<VirtualItem> {
  return new Proxy([] as Array<VirtualItem>, {
    get(target, prop, receiver) {
      if (prop === 'length') return count
      if (typeof prop === 'string') {
        const index = Number(prop)
        if (
          String(index) === prop &&
          Number.isInteger(index) &&
          index >= 0 &&
          index < count
        ) {
          const itemStart = start + index * (size + gap)
          return {
            index,
            key: getItemKey(index),
            start: itemStart,
            size,
            end: itemStart + size,
            lane: 0,
          }
        }
      }
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        const index = Number(prop)
        if (
          String(index) === prop &&
          Number.isInteger(index) &&
          index >= 0 &&
          index < count
        )
          return true
      }
      return Reflect.has(target, prop)
    },
  })
}
