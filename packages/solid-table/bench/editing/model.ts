import { createSignal, createStore, onCleanup } from 'solid-js'
import { createTable, nativeAggregations } from '@tanstack/solid-table/native'
import { createEditing } from './createEditing'
import { validateEdits } from './validation'
import {
  compareValues,
  day,
  formatSummary,
  formatValue,
  sameSummary,
  summaryChoices,
} from './aggregates'
import type { Summary, SummaryChoice, ValueKind } from './aggregates'
import type {
  NativeAggregationFn,
  NativeColumnDef,
} from '@tanstack/solid-table/native'
import type { RecordData, SaveRequest, SaveResult } from './createEditing'

type Fault =
  'none' | 'hold' | 'refuse' | 'conflict' | 'uncertain' | 'throw' | 'wrong-id'
const contains = (value: unknown, query: unknown) =>
  String(value).toLowerCase().includes(String(query).trim().toLowerCase())

export type ColumnMeta = {
  groupingLabel?: string
  summaryLabel?: string
  summaryChoices?: ReadonlyArray<SummaryChoice>
  formatValue?: (value: unknown) => string
  formatSummary?: (value: unknown) => string
}

export function createModel(size: number) {
  const initial = Array.from({ length: size }, (_, index): RecordData => ({
    id: `R${String(index + 1).padStart(4, '0')}`,
    name: `Record ${String(index + 1).padStart(4, '0')}`,
    note: `Note ${index + 1}`,
    priority: 'normal',
    amount: index % 11 === 10 ? null : ((index * 37) % 500) + 10,
    dueDate:
      index % 13 === 12 ? null : Date.UTC(2026, 9, 1) + (index % 31) * day,
    revision: '9007199254740993',
  }))
  const [records, setRecords] = createStore<
    Record<string, RecordData | undefined>
  >(Object.fromEntries(initial.map((row) => [row.id, row])))
  const [ids, setIds] = createSignal(initial.map((row) => row.id))
  const [localProcessing, setLocalProcessing] = createSignal(true)
  const [columnOrder, setColumnOrder] = createSignal<Array<string>>([])
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
  function aggregated(
    id: string,
    header: string,
    kind: ValueKind,
    groupingLabel?: string,
  ) {
    const choices = summaryChoices[kind]
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
      summaryChoices: choices,
      formatValue: (value: unknown) => formatValue(value, kind),
      formatSummary: (value: unknown) =>
        formatSummary(value, kind, summaries[id]!),
    })
    // V8 allocation templates can retain closures from object-literal accessors.
    Object.defineProperty(meta, 'summaryLabel', {
      get: () => {
        const value = summaries[id]
        if (id === 'note' && value === 'filled') return 'Filled notes'
        if (id === 'note' && value === 'distinct') return 'Distinct notes'
        return `${header} · ${choices.find((choice) => choice.value === value)?.label}`
      },
    })
    return { aggregationEquals: sameSummary, meta }
  }

  const columns: Array<NativeColumnDef<RecordData, ColumnMeta>> = [
    {
      ...aggregated('id', 'Record', 'text'),
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
      ...aggregated('name', 'Name', 'text', 'Name initial'),
      id: 'name',
      size: 220,
      minSize: 140,
      maxSize: 640,
      header: 'Name',
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
      header: 'Note',
      filterFn: contains,
      ...aggregated('note', 'Note', 'text'),
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
      header: 'Priority',
      ...aggregated('priority', 'Priority', 'text', 'Priority'),
      getGroupingValue: (row) => {
        counts.groupReads++
        return row.priority || null
      },
      filterFn: (value, choice) => value === choice,
      sortFn: (left, right) =>
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : ['low', 'normal', 'high'].indexOf(String(left)) -
            ['low', 'normal', 'high'].indexOf(String(right)),
      accessorFn: (row) => {
        counts.priority++
        return row.priority
      },
    },
    {
      ...aggregated('amount', 'Amount', 'number'),
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
      ...aggregated('dueDate', 'Due date', 'date'),
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
  const controlledState = Object.defineProperty(
    Object.create(null) as { columnOrder: Array<string> },
    'columnOrder',
    { get: columnOrder },
  )
  const table = createTable<RecordData, ColumnMeta>({
    source: { ids, get: (id) => records[id] },
    get manualProcessing() {
      return !localProcessing()
    },
    columns: configuredColumns,
    state: controlledState,
    onColumnSizingChange: () => {
      counts.sizingChanges++
    },
    onColumnOrderChange: (updater) => {
      counts.orderChanges++
      setColumnOrder(updater)
    },
  })
  function setSummary(id: string, value: Summary) {
    const choices = table.getColumn(id)?.columnDef?.meta?.summaryChoices
    if (choices?.some((choice) => choice.value === value))
      setSummaries((all) => {
        all[id] = value
      })
  }
  function configureGrouping(next: Array<string>) {
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
  const sent: Array<SaveRequest> = []
  const waiting = new Set<() => void>()
  let fault: Fault = 'none'
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const editing = createEditing({
    get: (id) => records[id],
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
  return {
    table,
    localProcessing,
    setLocalProcessing,
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
      setIds((all) => all.filter((value) => value !== id))
      setRecords((all) => {
        delete all[id]
      })
    },
  }
}
export type EditingModel = ReturnType<typeof createModel>
