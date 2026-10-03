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
            const next = resolveUpdater(updater, previous)
            if (key === 'columnFilters') {
              const filters = next as NativeTableState['columnFilters']
              // Keep the array and unchanged entries in the Solid store.
              // Filter values remain opaque and retain replacement semantics.
              for (let index = 0; index < filters.length; index++) {
                const filter = filters[index]!
                const current = draft.columnFilters[index]
                if (current?.id === filter.id) current.value = filter.value
                else draft.columnFilters[index] = filter
              }
              draft.columnFilters.length = filters.length
            } else if (key === 'sorting') {
              const sorting = next as NativeTableState['sorting']
              for (let index = 0; index < sorting.length; index++) {
                const sort = sorting[index]!
                const current = draft.sorting[index]
                if (current?.id === sort.id) current.desc = sort.desc
                else draft.sorting[index] = sort
              }
              draft.sorting.length = sorting.length
            } else if (key === 'grouping') {
              const grouping = next as NativeTableState['grouping']
              for (let index = 0; index < grouping.length; index++)
                draft.grouping[index] = grouping[index]!
              draft.grouping.length = grouping.length
            } else if (key === 'groupSorting') {
              // Updaters can reorder live store entries. Capture their scalar
              // fields before changing those same entries through the draft.
              const sorting = (next as NativeTableState['groupSorting']).map(
                ({ depth, id, desc }) => ({ depth, id, desc }),
              )
              for (let index = 0; index < sorting.length; index++) {
                const sort = sorting[index]!
                const current = draft.groupSorting[index]
                if (current) {
                  current.depth = sort.depth
                  current.id = sort.id
                  current.desc = sort.desc
                } else draft.groupSorting[index] = sort
              }
              draft.groupSorting.length = sorting.length
            } else if (key === 'columnSizing') {
              const sizing = next as NativeTableState['columnSizing']
              for (const id of Object.keys(draft.columnSizing))
                if (!Object.hasOwn(sizing, id)) delete draft.columnSizing[id]
              Object.assign(draft.columnSizing, sizing)
            } else if (key === 'groupExpanded') {
              const expanded = next as NativeTableState['groupExpanded']
              for (const id of Object.keys(draft.groupExpanded))
                if (!(id in expanded)) delete draft.groupExpanded[id]
              Object.assign(draft.groupExpanded, expanded)
            } else Object.assign(draft, { [key]: next })
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
