import {
  createEffect,
  createMemo,
  createSignal,
  createStore,
  onCleanup,
  snapshot,
  untrack,
} from 'solid-js'
import { createTable, nativeAggregations } from '@tanstack/solid-table/native'
import { createEditing } from './createEditing'
import { createEditValidator } from './validation'
import { defaultFields } from './fields'
import {
  compareValues,
  day,
  formatSummary,
  formatValue,
  sameSummary,
  summaryChoices,
} from './aggregates'
import type { EditingField, EditingFields } from './fields'
import type { Summary, SummaryChoice, ValueKind } from './aggregates'
import type {
  NativeAggregationFn,
  NativeColumnDef,
  NativeStateCallbacks,
  NativeTableState,
  Updater,
} from '@tanstack/solid-table/native'
import type { RecordData, SaveRequest, SaveResult } from './createEditing'
import type { ViewConfiguration } from './viewConfiguration'

type Fault =
  'none' | 'hold' | 'refuse' | 'conflict' | 'uncertain' | 'throw' | 'wrong-id'
const contains = (value: unknown, query: unknown) =>
  String(value).toLowerCase().includes(String(query).trim().toLowerCase())

export type ColumnMeta = {
  filterLabel?: string
  editor?: EditingField
  groupingLabel?: string
  summaryLabel?: string
  summaryChoices?: ReadonlyArray<SummaryChoice>
  formatValue?: (value: unknown) => string
  formatSummary?: (value: unknown) => string
}

export function createRecords(
  size: number,
  prefix = '',
  priority = defaultFields.priority.initialValue,
) {
  return Array.from({ length: size }, (_, index): RecordData => ({
    id: `R${String(index + 1).padStart(4, '0')}`,
    name: `${prefix}Record ${String(index + 1).padStart(4, '0')}`,
    note: `Note ${index + 1}`,
    priority,
    amount: index % 11 === 10 ? null : ((index * 37) % 500) + 10,
    dueDate:
      index % 13 === 12 ? null : Date.UTC(2026, 9, 1) + (index % 31) * day,
    revision: '9007199254740993',
  }))
}

export function createModel(
  data: number | Array<RecordData>,
  mode: 'row' | 'table' = 'row',
  fields: EditingFields = defaultFields,
) {
  const initial =
    typeof data === 'number'
      ? createRecords(data, '', fields.priority.initialValue)
      : data
  const validateEdits = createEditValidator(fields)
  const priorityOrder = fields.priority.choices
    .filter((choice) => choice.value && !choice.disabled)
    .map((choice) => choice.value)
  const [saveMode, writeSaveMode] = createSignal(mode)
  const [records, setRecords] = createStore<
    Record<string, RecordData | undefined>
  >(Object.fromEntries(initial.map((row) => [row.id, row])))
  const [ids, setIds] = createSignal(initial.map((row) => row.id))
  const [localProcessing, writeLocalProcessing] = createSignal(true)
  const [viewState, setViewState] = createStore<NativeTableState>({
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
  })
  const columnOrder = () => viewState.columnOrder
  const grouping = () => viewState.grouping
  const columnPinning = () => viewState.columnPinning
  const [descendantEditing, setDescendantEditing] = createSignal(false)
  const removals = new Set<string>()
  const effectiveColumnPinning = createMemo(() => {
    const pinned = columnPinning()
    if (!localProcessing() || !grouping().length) return pinned
    return {
      start: [...new Set([...grouping(), ...pinned.start])],
      end: pinned.end.filter((id) => !grouping().includes(id)),
    }
  })
  const effectiveColumnOrder = createMemo(() =>
    localProcessing() && grouping().length
      ? [...new Set([...grouping(), ...columnOrder()])]
      : columnOrder(),
  )
  const [summaries, setSummaries] = createStore<Record<string, Summary>>({
    id: 'none',
    name: 'none',
    note: 'filled',
    priority: 'none',
    amount: 'sum',
    dueDate: 'range',
  })
  const counts = {
    name: 0,
    note: 0,
    priority: 0,
    amount: 0,
    dueDate: 0,
    medianValues: 0,
    views: 0,
    cells: 0,
    unmounted: 0,
    requests: 0,
    aborted: 0,
    validations: 0,
    groupReads: 0,
    aggregates: 0,
    groupViews: 0,
    groupCells: 0,
    groupsUnmounted: 0,
    sizingChanges: 0,
    resizeStarts: 0,
    resizeMoves: 0,
    resizeChanges: 0,
    resizeCancels: 0,
    resizeListeners: 0,
    orderChanges: 0,
    reorderStarts: 0,
    reorderMoves: 0,
    reorderCancels: 0,
    reorderListeners: 0,
  }
  const aggregateFunctions: Record<
    string,
    Record<string, NativeAggregationFn>
  > = {}
  function aggregated(id: string, kind: ValueKind, groupingLabel?: string) {
    const choices = summaryChoices[kind]
    const editor =
      id === 'name' || id === 'note' || id === 'priority'
        ? fields[id]
        : undefined
    const functions = Object.fromEntries(
      choices.flatMap(({ value }) => {
        if (value === 'none') return []
        const fn: NativeAggregationFn = (values, context) => {
          counts.aggregates++
          function* measured() {
            for (const item of values) {
              if (
                value === 'median' &&
                typeof item === 'number' &&
                Number.isFinite(item)
              )
                counts.medianValues++
              yield item
            }
          }
          return nativeAggregations[value](measured(), context)
        }
        return [[value, fn]]
      }),
    )
    aggregateFunctions[id] = functions
    const meta = Object.assign(Object.create(null) as ColumnMeta, {
      groupingLabel,
      editor,
      filterLabel:
        editor?.filterLabel ??
        (
          {
            id: 'Filter record IDs',
            amount: 'Filter amounts',
            dueDate: 'Filter due dates',
          } as Record<string, string>
        )[id],
      summaryChoices: choices,
      formatValue: (value: unknown) => formatValue(value, kind),
      formatSummary: (value: unknown) =>
        formatSummary(value, kind, summaries[id]!),
    })
    // V8 allocation templates can retain closures from object-literal accessors.
    Object.defineProperty(meta, 'summaryLabel', {
      get: () => {
        const value = summaries[id]
        return value === 'none' ? undefined : value === 'mean' ? 'avg' : value
      },
    })
    return { aggregationEquals: sameSummary, meta }
  }

  const columns: Array<NativeColumnDef<RecordData, ColumnMeta>> = [
    {
      ...aggregated('id', 'text'),
      id: 'id',
      size: 130,
      minSize: 96,
      maxSize: 320,
      header: 'Record',
      accessorKey: 'id',
      filterFn: contains,
      sortFn: compareValues,
      enableGlobalFilter: false,
    },
    {
      ...aggregated('name', 'text', `${fields.name.label} initial`),
      id: 'name',
      size: 220,
      minSize: 140,
      maxSize: 640,
      header: fields.name.label,
      filterFn: contains,
      sortFn: compareValues,
      getGroupingValue: (row) => {
        counts.groupReads++
        return row.name.trim().charAt(0).toUpperCase() || null
      },
      accessorFn: (row) => {
        counts.name++
        return row.name
      },
    },
    {
      id: 'note',
      size: 260,
      minSize: 140,
      maxSize: 800,
      header: fields.note.label,
      filterFn: contains,
      ...aggregated('note', 'text'),
      sortFn: compareValues,
      accessorFn: (row) => {
        counts.note++
        return row.note
      },
    },
    {
      id: 'priority',
      size: 140,
      minSize: 120,
      maxSize: 280,
      header: fields.priority.label,
      ...aggregated('priority', 'text', fields.priority.label),
      getGroupingValue: (row) => {
        counts.groupReads++
        return row.priority || null
      },
      filterFn: (value, choice) => value === choice,
      sortFn: (left, right) =>
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : priorityOrder.indexOf(String(left)) -
            priorityOrder.indexOf(String(right)),
      accessorFn: (row) => {
        counts.priority++
        return row.priority
      },
    },
    {
      ...aggregated('amount', 'number'),
      id: 'amount',
      size: 120,
      minSize: 96,
      maxSize: 360,
      header: 'Amount',
      enableGlobalFilter: false,
      filterFn: contains,
      sortFn: compareValues,
      accessorFn: (row) => {
        counts.amount++
        return row.amount
      },
    },
    {
      ...aggregated('dueDate', 'date'),
      id: 'dueDate',
      size: 170,
      minSize: 140,
      maxSize: 360,
      header: 'Due date',
      enableGlobalFilter: false,
      filterFn: (value, query) => contains(formatValue(value, 'date'), query),
      sortFn: compareValues,
      accessorFn: (row) => {
        counts.dueDate++
        return row.dueDate
      },
    },
  ]
  const configuredColumns = columns.map((column) => {
    // A fresh dictionary also avoids template-shared accessor descriptors.
    const configured = Object.assign(
      Object.create(null) as NativeColumnDef<RecordData, ColumnMeta>,
      column,
    )
    Object.defineProperty(configured, 'aggregationFn', {
      get: () => aggregateFunctions[column.id]![summaries[column.id]!],
    })
    return configured
  })
  const sent: Array<SaveRequest> = []
  const waiting = new Set<() => void>()
  let fault: Fault = 'none'
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const editing = createEditing({
    get: (id) => (removals.has(id) ? undefined : records[id]),
    validate(values) {
      counts.validations++
      return validateEdits(values)
    },
    async commit(request, signal) {
      counts.requests++
      sent.push(request)
      const next = fault
      fault = 'none'
      if (next === 'hold') {
        await new Promise<void>((resolve, reject) => {
          const release = () => {
            cleanup()
            resolve()
          }
          const abort = () => {
            counts.aborted++
            cleanup()
            reject(new Error('Aborted'))
          }
          const cleanup = () => {
            waiting.delete(release)
            signal.removeEventListener('abort', abort)
          }
          waiting.add(release)
          signal.addEventListener('abort', abort, { once: true })
        })
      } else await Promise.resolve()
      if (next === 'throw') throw new Error('Simulated transport failure')
      if (next === 'refuse')
        return {
          status: 'refused',
          message: 'The server refused this save. Your draft is preserved.',
        }
      if (next === 'conflict')
        return {
          status: 'conflict',
          message: 'A newer revision exists. Your draft is preserved.',
        }
      if (next === 'uncertain')
        return {
          status: 'uncertain',
          message: 'The save outcome is unknown. Your draft is preserved.',
        }
      return {
        status: 'saved',
        id: next === 'wrong-id' ? 'foreign-record' : request.id,
        revision: String(BigInt(request.expectedRevision) + 1n),
      } satisfies SaveResult
    },
    apply(request, result) {
      setRecords((all) => {
        const row = all[request.id]!
        Object.assign(row, request.changes)
        row.revision = result.revision
      })
    },
  })
  const locked = createMemo(
    () =>
      (localProcessing() && grouping().length ? false : editing.active()) ||
      descendantEditing(),
  )
  function updateState<K extends keyof NativeTableState>(
    key: K,
    updater: Updater<NativeTableState[K]>,
  ) {
    if (locked()) return
    setViewState((draft) => {
      draft[key] = typeof updater === 'function' ? updater(draft[key]) : updater
    })
    if (key === 'columnSizing') counts.sizingChanges++
    if (key === 'columnOrder') counts.orderChanges++
  }
  const setColumnOrder = (updater: Updater<Array<string>>) =>
    updateState('columnOrder', updater)
  const controlledState = Object.create(null) as NativeTableState
  const callbacks: NativeStateCallbacks = {}
  function install<K extends keyof NativeTableState>(key: K) {
    Object.defineProperty(controlledState, key, {
      enumerable: true,
      get:
        key === 'columnOrder'
          ? effectiveColumnOrder
          : key === 'columnPinning'
            ? effectiveColumnPinning
            : () => viewState[key],
    })
    Object.defineProperty(
      callbacks,
      `on${key[0]!.toUpperCase()}${key.slice(1)}Change`,
      {
        enumerable: true,
        value: (updater: Updater<NativeTableState[K]>) =>
          updateState(key, updater),
      },
    )
  }
  for (const key of Object.keys(viewState) as Array<keyof NativeTableState>)
    install(key)
  function removeNow(id: string) {
    setIds((all) => all.filter((value) => value !== id))
    setRecords((all) => {
      delete all[id]
    })
  }
  createEffect(locked, (busy) => {
    if (!busy && removals.size)
      queueMicrotask(() =>
        untrack(() => {
          if (disposed || locked()) return
          for (const id of removals) removeNow(id)
          removals.clear()
        }),
      )
  })
  const table = createTable<RecordData, ColumnMeta>({
    ...callbacks,
    source: { ids, get: (id) => records[id] },
    get rowProcessingPaused() {
      return locked()
    },
    get manualProcessing() {
      return !localProcessing()
    },
    columns: configuredColumns,
    state: controlledState,
  })
  const isGrouped = createMemo(
    () => localProcessing() && table.state.grouping.length > 0,
  )
  function setSummary(id: string, value: Summary) {
    if (locked()) return
    const choices = table.getColumn(id)?.columnDef?.meta?.summaryChoices
    if (choices?.some((choice) => choice.value === value))
      setSummaries((all) => {
        all[id] = value
      })
  }
  function configureGrouping(next: Array<string>) {
    if (locked()) return
    const previous = table.state.grouping
    const sorting = next.flatMap((id, depth) => {
      const order = table.state.groupSorting.find(
        (item) => item.depth === previous.indexOf(id),
      )
      return order ? [{ ...order, depth }] : []
    })
    table.setGrouping(next)
    table.setGroupSorting(sorting)
  }
  function recordGroupKeys(id: string) {
    const path: Array<string> = []
    let keys = table.getRootGroupKeys()
    while (keys.length) {
      const key = keys.find((candidate) => {
        for (const member of table.getGroup(candidate).getLeafRowIds())
          if (member === id) return true
        return false
      })
      if (!key) break
      path.push(key)
      keys = table.getGroup(key).getChildGroupKeys()
    }
    return path
  }
  function revealRecord(id: string) {
    const keys = recordGroupKeys(id)
    table.setGroupExpanded((old) => ({
      ...old,
      ...Object.fromEntries(keys.map((key) => [key, true])),
    }))
  }
  function captureView(): Omit<ViewConfiguration, 'controls'> {
    return {
      version: 1,
      columnFilters: viewState.columnFilters.map(({ id, value }) => ({
        id,
        value: String(value ?? ''),
      })),
      globalFilter: viewState.globalFilter,
      sorting: snapshot(viewState.sorting),
      grouping: snapshot(viewState.grouping),
      groupSorting: snapshot(viewState.groupSorting),
      summaries: snapshot(summaries),
      // Preserve manual order and pinning, before grouping moves its columns.
      columnOrder: snapshot(viewState.columnOrder),
      columnVisibility: snapshot(viewState.columnVisibility),
      columnPinning: snapshot(viewState.columnPinning),
    }
  }
  function applyView(configuration: ViewConfiguration) {
    if (disposed || locked()) return false
    const next = structuredClone(configuration)
    setViewState((state) => {
      state.columnFilters = next.columnFilters
      state.globalFilter = next.globalFilter
      state.sorting = next.sorting
      state.grouping = next.grouping
      state.groupSorting = next.groupSorting
      state.columnOrder = next.columnOrder
      state.columnVisibility = next.columnVisibility
      state.columnPinning = next.columnPinning
      state.groupExpanded = {}
    })
    setSummaries((state) => Object.assign(state, next.summaries))
    return true
  }
  return {
    table,
    captureView,
    applyView,
    locked,
    setDescendantEditing,
    columnIds: configuredColumns.map((column) => column.id),
    isGrouped,
    saveMode,
    setSaveMode: (value: typeof mode) => {
      if (!locked()) writeSaveMode(value)
    },
    localProcessing,
    setLocalProcessing: (value: boolean) => {
      if (!locked()) writeLocalProcessing(value)
    },
    setColumnOrder,
    summaries,
    setSummary,
    configureGrouping,
    recordGroupKeys,
    revealRecord,
    records,
    editing,
    counts,
    sent,
    fault: (next: Fault) => {
      fault = next
    },
    release: () => {
      for (const release of [...waiting]) release()
    },
    patch(id: string, changes: Partial<Omit<RecordData, 'id' | 'revision'>>) {
      if (disposed) return
      setRecords((all) => {
        const row = all[id]
        if (row) {
          Object.assign(row, changes)
          row.revision = String(BigInt(row.revision) + 1n)
        }
      })
    },
    remove(id: string) {
      if (disposed) return
      if (locked()) removals.add(id)
      else removeNow(id)
    },
  }
}
export type EditingModel = ReturnType<typeof createModel>
