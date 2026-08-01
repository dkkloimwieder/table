import { constructTable } from '@tanstack/table-core'
import { createOwner, getOwner, onCleanup, runWithOwner } from 'solid-js'
import { FlexRender } from './FlexRender'
import { mergeObjects } from './merge-objects'
import { solidReactivity } from './reactivity'
import type { JSX } from '@solidjs/web'
import type {
  RowData,
  Table,
  TableFeatures,
  TableOptions,
} from '@tanstack/table-core'

export type SolidTable<
  TFeatures extends TableFeatures,
  TData extends RowData,
> = Table<TFeatures, TData> & {
  /**
   * Creates a reactive render boundary. The child function reads the table
   * atoms it needs, so Solid only tracks those atom reads.
   */
  Subscribe: (props: {
    children: (atoms: Table<TFeatures, TData>['atoms']) => JSX.Element
  }) => JSX.Element
  /**
   * Convenience FlexRender component attached to the table instance for
   * rendering headers, cells, or footers with custom markup. Mirrors the
   * `table.FlexRender` API exposed by `createTableHook`'s `createAppTable`.
   *
   * @example
   * <table.FlexRender header={header} />
   * <table.FlexRender cell={cell} />
   * <table.FlexRender footer={footer} />
   */
  FlexRender: typeof FlexRender
}

/**
 * Creates a Solid table instance backed by Solid-aware TanStack Store atoms.
 *
 * Table APIs and atom reads participate in Solid dependency tracking, so
 * computations that read a specific slice can update without invalidating
 * unrelated UI. Use `table.Subscribe` to create atom-tracked render boundaries.
 *
 * @example
 * ```tsx
 * const table = createTable(
 *   {
 *     features,
 *     columns,
 *     data,
 *   },
 * )
 * ```
 */
export function createTable<
  TFeatures extends TableFeatures,
  TData extends RowData,
>(tableOptions: TableOptions<TFeatures, TData>): SolidTable<TFeatures, TData> {
  // In Solid 2 `runWithOwner(null, fn)` means "detach" rather than failing, so
  // a missing owner would silently leak every table computation instead of
  // crashing like the old `getOwner()!` did — warn and fall back to a
  // detached owner (design D17).
  const currentOwner = getOwner()
  if (process.env.NODE_ENV !== 'production' && currentOwner === null) {
    console.warn(
      'createTable was called outside a reactive root. Table computations ' +
        'will never be disposed. Create the table inside a component or ' +
        'wrap the call in createRoot.',
    )
  }
  const owner = currentOwner ?? createOwner()

  // Late-bound: the reactivity bindings need the getter-carrying merged
  // options for the options store, but building those options requires the
  // bindings (they ride in as a feature). The thunk is only invoked from
  // inside constructTable, after `liveOptions.current` is assigned.
  const liveOptions: { current?: unknown } = {}
  const reactivity = solidReactivity(owner, () => liveOptions.current)

  const mergedOptions = mergeObjects(tableOptions, {
    features: {
      coreReactivityFeature: reactivity,
      ...tableOptions.features,
    },
  }) as any

  const resolvedOptions = mergeObjects(
    {
      mergeOptions: (
        defaultOptions: TableOptions<TFeatures, TData>,
        options: TableOptions<TFeatures, TData>,
      ) => {
        return mergeObjects(defaultOptions, options)
      },
    },
    mergedOptions,
  ) as TableOptions<TFeatures, TData>

  liveOptions.current = mergedOptions

  const table = constructTable(resolvedOptions) as unknown as SolidTable<
    TFeatures,
    TData
  >

  // No push-sync loop: the options store is a pull-based writable memo (see
  // createOptionsStoreAtom) and every merge along the way is getter-preserving,
  // so `table.options.data` reads the caller's signal through the live getter
  // chain and is always current.
  runWithOwner(owner, () => {
    onCleanup(() => reactivity.unmount?.())
  })

  table.Subscribe = (props: {
    children: (atoms: Table<TFeatures, TData>['atoms']) => JSX.Element
  }) => {
    return props.children(table.atoms as Table<TFeatures, TData>['atoms'])
  }

  table.FlexRender = FlexRender

  return table
}
