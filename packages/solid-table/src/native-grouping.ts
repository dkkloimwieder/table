import { createMemo } from 'solid-js'
import { holdRowProcessing } from './native-processing'
import { compareNativeValues } from './native-sorting'
import type {
  NativeColumnDef,
  NativeDisplayItem,
  NativeGroup,
  NativeGroupPathEntry,
  NativeGroupValue,
  NativeStateSetters,
  NativeTableOptions,
  NativeTableState,
} from './native-types'

interface GroupNode {
  key: string
  path: ReadonlyArray<NativeGroupPathEntry>
  children: Array<string>
  leafIds: ReadonlyArray<string>
  count: number
}

function groupValue(value: unknown): NativeGroupValue {
  if (value == null) return null
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value))
    return value as NativeGroupValue
  throw new Error(
    'Grouping requires a scalar value. Set getGroupingValue for object values',
  )
}

function groupKey(path: ReadonlyArray<NativeGroupPathEntry>) {
  return JSON.stringify([
    'group',
    path.map(({ columnId, value }) => [
      columnId,
      value === null ? 'null' : typeof value,
      typeof value === 'number' || typeof value === 'bigint'
        ? String(value)
        : value,
    ]),
  ])
}

function rowKey(id: string) {
  return JSON.stringify(['row', id])
}

function sameKeys(left: ReadonlyArray<string>, right: ReadonlyArray<string>) {
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  )
}

export function getNativeDisplayItem(key: string): NativeDisplayItem {
  const parsed: unknown = JSON.parse(key)
  if (Array.isArray(parsed) && parsed.length === 2) {
    if (parsed[0] === 'row' && typeof parsed[1] === 'string')
      return { kind: 'row', id: parsed[1] }
    if (parsed[0] === 'group' && Array.isArray(parsed[1]))
      return { kind: 'group', key }
  }
  throw new Error('Invalid native display key')
}

export function createNativeGrouping<T, TMeta>(
  options: NativeTableOptions<T, TMeta>,
  state: Readonly<NativeTableState>,
  setters: NativeStateSetters,
  ids: () => ReadonlyArray<string>,
  filteredIds: () => ReadonlyArray<string>,
  sortedIds: () => ReadonlyArray<string>,
  orderIndexes: () => ReadonlyMap<string, number>,
  definitions: () => ReadonlyMap<string, NativeColumnDef<T, TMeta>>,
  getRecord: (id: string) => T | undefined,
  access: (record: T, column: NativeColumnDef<T, TMeta>) => unknown,
) {
  const tree = createMemo(
    holdRowProcessing(options, () => {
      const groups = new Map<string, GroupNode>()
      const orders = new Map<string, ReadonlyArray<string>>()
      if (options.manualProcessing || options.manualGrouping)
        return { groups, orders, roots: [], active: false }
      const columns = Array.from(new Set(state.grouping)).flatMap((id) => {
        const column = definitions().get(id)
        return column ? [column] : []
      })
      function build(
        input: ReadonlyArray<string>,
        depth: number,
        path: ReadonlyArray<NativeGroupPathEntry>,
      ): Array<string> {
        const column = columns[depth]!
        const buckets = new Map<NativeGroupValue, Array<string>>()
        for (const id of input) {
          const record = getRecord(id)!
          const value = groupValue(
            column.getGroupingValue
              ? column.getGroupingValue(record)
              : access(record, column),
          )
          const bucket = buckets.get(value)
          if (bucket) bucket.push(id)
          else buckets.set(value, [id])
        }
        const keys: Array<string> = []
        for (const [value, members] of buckets) {
          const nextPath = [...path, { columnId: column.id, value }]
          const key = groupKey(nextPath)
          const leaf = depth === columns.length - 1
          const node: GroupNode = {
            key,
            path: nextPath,
            children: leaf ? [] : build(members, depth + 1, nextPath),
            leafIds: leaf ? members : [],
            count: members.length,
          }
          groups.set(key, node)
          keys.push(key)
        }
        return keys
      }
      return {
        groups,
        orders,
        roots: columns.length ? build(filteredIds(), 0, []) : [],
        active: columns.length > 0,
      }
    }),
    { lazy: true },
  )

  function* leaves(
    node: GroupNode,
    groups: ReadonlyMap<string, GroupNode>,
  ): Generator<string> {
    if (!node.children.length) yield* node.leafIds
    else
      for (const key of node.children) yield* leaves(groups.get(key)!, groups)
  }
  function aggregate(
    column: NativeColumnDef<T, TMeta>,
    members: () => Iterable<string>,
    count: number,
    sourceOrder = false,
  ) {
    function* values() {
      for (const id of members()) {
        const record = getRecord(id)
        if (record !== undefined) yield access(record, column)
      }
    }
    function boundary(last: boolean) {
      const indexes = sourceOrder ? undefined : orderIndexes()
      let selected: string | undefined
      let rank = last ? -Infinity : Infinity
      let sourceIndex = 0
      for (const id of members()) {
        const index = indexes ? indexes.get(id) : sourceIndex++
        if (index !== undefined && (last ? index > rank : index < rank)) {
          selected = id
          rank = index
        }
      }
      const record = selected === undefined ? undefined : getRecord(selected)
      return record === undefined ? undefined : access(record, column)
    }
    return column.aggregationFn?.(values(), {
      count,
      getFirstValue: () => boundary(false),
      getLastValue: () => boundary(true),
    })
  }
  function value(
    node: GroupNode,
    groups: ReadonlyMap<string, GroupNode>,
    columnId: string,
    aggregateOnly = false,
  ) {
    const entry = node.path.find((part) => part.columnId === columnId)
    if (entry && !aggregateOnly) return entry.value
    if (options.manualProcessing || options.manualAggregating) return undefined
    const column = definitions().get(columnId)
    return column
      ? aggregate(column, () => leaves(node, groups), node.count)
      : undefined
  }
  // Membership tracks only grouping fields. Aggregate edits do not rebuild it.
  function sortKeys(keys: ReadonlyArray<string>, depth: number) {
    if (!keys.length || options.manualProcessing || options.manualSorting)
      return keys
    const order = state.groupSorting.find((item) => item.depth === depth)
    const column = order && definitions().get(order.id)
    if (!order || !column) return keys
    if (!column.sortFn) throw new Error(`Missing sort function: ${column.id}`)
    const model = tree()
    const keyed = keys.map((key, index) => ({
      key,
      index,
      value: value(
        model.groups.get(key)!,
        model.groups,
        order.id,
        model.groups.get(key)!.path[depth]?.columnId !== order.id,
      ),
    }))
    keyed.sort(
      (a, b) =>
        compareNativeValues(column, a.value, b.value, order.desc ? -1 : 1) ||
        a.index - b.index,
    )
    return keyed.map((item) => item.key)
  }
  const roots = createMemo(
    holdRowProcessing(options, () => sortKeys(tree().roots, 0)),
    {
      lazy: true,
      equals: sameKeys,
    },
  )
  // Hidden children have no ordering consumer and therefore read no aggregates.
  // A requested child sequence runs in its caller's reactive scope.
  const children = (key: string) => {
    const model = tree()
    const values = model.orders
    if (options.rowProcessingPaused && values.has(key)) return values.get(key)!
    const node = model.groups.get(key)
    if (!node) return []
    const ordered = sortKeys(node.children, node.path.length)
    // Cache only requested orders for this membership tree. A new tree releases
    // the old map, including keys removed by source or grouping changes.
    values.set(key, ordered)
    return ordered
  }
  const displayKeys = createMemo(
    holdRowProcessing(options, () => {
      const model = tree()
      if (!model.active) return sortedIds().map(rowKey)
      const result: Array<string> = []
      let indexes: ReadonlyMap<string, number> | undefined
      function append(keys: ReadonlyArray<string>) {
        for (const key of keys) {
          result.push(key)
          if (state.groupExpanded[key] !== true) continue
          const node = model.groups.get(key)!
          if (node.children.length) append(children(key))
          else {
            // Collapsed groups do not activate leaf sorting or its field reads.
            indexes ??= orderIndexes()
            const rows = [...node.leafIds].sort(
              (a, b) => indexes!.get(a)! - indexes!.get(b)!,
            )
            for (const id of rows) result.push(rowKey(id))
          }
        }
      }
      append(roots())
      return result
    }),
    { lazy: true, equals: sameKeys },
  )

  function getGroup(key: string): NativeGroup {
    return {
      key,
      get path() {
        return tree().groups.get(key)?.path
      },
      get depth() {
        return (tree().groups.get(key)?.path.length ?? 0) - 1
      },
      get count() {
        return tree().groups.get(key)?.count ?? 0
      },
      getLeafRowIds: () => {
        const model = tree()
        const node = model.groups.get(key)
        return node ? leaves(node, model.groups) : []
      },
      getChildGroupKeys: () => children(key),
      getValue: <V>(columnId: string) => {
        const model = tree()
        const node = model.groups.get(key)
        return node
          ? (value(node, model.groups, columnId) as V | undefined)
          : undefined
      },
      getAggregateValue: <V>(columnId: string) => {
        const model = tree()
        const node = model.groups.get(key)
        return node
          ? (value(node, model.groups, columnId, true) as V | undefined)
          : undefined
      },
      getIsExpanded: () => state.groupExpanded[key] === true,
      toggleExpanded: (expanded) =>
        setters.setGroupExpanded((old) => ({
          ...old,
          [key]: expanded ?? old[key] !== true,
        })),
    }
  }
  return {
    getRowKey: rowKey,
    isRowVisibleThroughGroups: (id: string) => {
      if (options.manualProcessing || options.manualGrouping) return true
      const path: Array<NativeGroupPathEntry> = []
      const record = getRecord(id)
      if (record === undefined) return false
      for (const columnId of new Set(state.grouping)) {
        const column = definitions().get(columnId)
        if (!column) continue
        path.push({
          columnId,
          value: groupValue(
            column.getGroupingValue
              ? column.getGroupingValue(record)
              : access(record, column),
          ),
        })
        if (state.groupExpanded[groupKey(path)] !== true) return false
      }
      return true
    },
    getGroup,
    getRootGroupKeys: roots,
    getDisplayKeys: displayKeys,
    getDisplayItem: getNativeDisplayItem,
    toggleAllGroupsExpanded: (expanded: boolean, depth?: number) => {
      const groups = tree().groups
      setters.setGroupExpanded((old) => {
        const next = { ...old }
        for (const node of groups.values())
          if (depth === undefined || node.path.length - 1 === depth)
            next[node.key] = expanded
        return next
      })
    },
    getTotalValue: <V>(
      columnId: string,
      scope: 'source' | 'filtered' = 'filtered',
    ): V | undefined => {
      if (options.getTotalValue)
        return options.getTotalValue(columnId, scope) as V | undefined
      if (options.manualProcessing || options.manualAggregating)
        return undefined
      const column = definitions().get(columnId)
      if (!column?.aggregationFn) return undefined
      const input = scope === 'source' ? ids() : filteredIds()
      return aggregate(
        column,
        () => input,
        input.length,
        scope === 'source',
      ) as V | undefined
    },
  }
}
