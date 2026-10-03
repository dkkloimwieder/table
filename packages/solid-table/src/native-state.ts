import { createStore, untrack } from 'solid-js'
import type {
  NativeStateCallbacks,
  NativeStateSetters,
  NativeTableState,
  Updater,
} from './native-types'

export function resolveUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function'
    ? (updater as (previous: T) => T)(previous)
    : updater
}

export function createNativeState(
  options: NativeStateCallbacks & {
    initialState?: Partial<NativeTableState>
    state?: Partial<NativeTableState>
  },
) {
  const defaults: NativeTableState = {
    columnFilters: [],
    globalFilter: '',
    sorting: [],
    grouping: [],
    groupSorting: [],
    groupExpanded: {},
    rowSelection: {},
    expanded: {},
    columnVisibility: {},
    columnOrder: [],
    columnPinning: { start: [], end: [] },
    columnSizing: {},
    rowPinning: { top: [], bottom: [] },
  }
  // Only the initial state is a snapshot. Controlled getters stay live below.
  const [internal, setInternal] = createStore({
    ...defaults,
    ...untrack(() => options.initialState),
  })
  const state = {} as NativeTableState
  const setters = {} as NativeStateSetters
  function install<K extends keyof NativeTableState>(key: K) {
    const name = `${key[0]!.toUpperCase()}${key.slice(1)}`
    Object.defineProperty(state, key, {
      enumerable: true,
      get: () => options.state?.[key] ?? internal[key],
    })
    Object.defineProperty(setters, `set${name}`, {
      enumerable: true,
      value: (updater: Updater<NativeTableState[K]>) => {
        const callback = options[
          `on${name}Change` as keyof NativeStateCallbacks
        ] as ((update: Updater<NativeTableState[K]>) => void) | undefined
        if (options.state?.[key] === undefined) {
          // Draft reads include earlier writes in this batch. Reading the
          // committed public state here would lose consecutive updater calls.
          setInternal((draft) => {
            const previous = draft[key]
            Object.assign(draft, { [key]: resolveUpdater(updater, previous) })
          })
        }
        callback?.(updater)
      },
    })
  }
  for (const key of Object.keys(defaults) as Array<keyof NativeTableState>)
    install(key)
  return { state, setters }
}
