import { createSignal, createStore, onCleanup } from 'solid-js'
import { createTable } from '@tanstack/solid-table/native'
import { createEditing } from './createEditing'
import { validateEdits } from './validation'
import type { NativeAggregationFn } from '@tanstack/solid-table/native'
import type {
  EditValues,
  RecordData,
  SaveRequest,
  SaveResult,
} from './createEditing'

type Fault =
  'none' | 'hold' | 'refuse' | 'conflict' | 'uncertain' | 'throw' | 'wrong-id'
const contains = (value: unknown, query: unknown) =>
  String(value).toLowerCase().includes(String(query).trim().toLowerCase())
const compareText = (left: unknown, right: unknown) =>
  String(left).localeCompare(String(right))

export type NoteSummary = 'filled' | 'distinct' | 'none'
export type ColumnMeta = { groupingLabel?: string; summaryLabel?: string }

export function createModel(size: number) {
  const initial = Array.from({ length: size }, (_, index): RecordData => ({
    id: `R${String(index + 1).padStart(4, '0')}`,
    name: `Record ${String(index + 1).padStart(4, '0')}`,
    note: `Note ${index + 1}`,
    priority: 'normal',
    revision: '9007199254740993',
  }))
  const [records, setRecords] = createStore<
    Record<string, RecordData | undefined>
  >(Object.fromEntries(initial.map((row) => [row.id, row])))
  const [ids, setIds] = createSignal(initial.map((row) => row.id))
  const [localProcessing, setLocalProcessing] = createSignal(true)
  const [noteSummary, setNoteSummary] = createSignal<NoteSummary>('filled')
  const counts = {
    name: 0,
    note: 0,
    priority: 0,
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
  }
  const summaries: Record<Exclude<NoteSummary, 'none'>, NativeAggregationFn> = {
    filled(values) {
      counts.aggregates++
      let total = 0
      for (const value of values) if (String(value ?? '').trim()) total++
      return total
    },
    distinct(values) {
      counts.aggregates++
      const notes = new Set<string>()
      for (const value of values) {
        const text = String(value ?? '').trim()
        if (text) notes.add(text)
      }
      return notes.size
    },
  }
  const table = createTable<RecordData, ColumnMeta>({
    source: { ids, get: (id) => records[id] },
    get manualProcessing() {
      return !localProcessing()
    },
    columns: [
      {
        id: 'id',
        header: 'Record',
        accessorKey: 'id',
        filterFn: contains,
        sortFn: compareText,
        enableGlobalFilter: false,
      },
      {
        id: 'name',
        header: 'Name',
        filterFn: contains,
        sortFn: compareText,
        meta: { groupingLabel: 'Name initial' },
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
        header: 'Note',
        filterFn: contains,
        sortFn: (left, right) =>
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : compareText(left, right),
        get aggregationFn() {
          const summary = noteSummary()
          return summary === 'none' ? undefined : summaries[summary]
        },
        meta: {
          get summaryLabel() {
            return noteSummary() === 'filled'
              ? 'Filled notes'
              : 'Distinct notes'
          },
        },
        accessorFn: (row) => {
          counts.note++
          return row.note
        },
      },
      {
        id: 'priority',
        header: 'Priority',
        meta: { groupingLabel: 'Priority' },
        getGroupingValue: (row) => {
          counts.groupReads++
          return row.priority || null
        },
        filterFn: (value, choice) => value === choice,
        sortFn: (left, right) =>
          ['low', 'normal', 'high'].indexOf(String(left)) -
          ['low', 'normal', 'high'].indexOf(String(right)),
        accessorFn: (row) => {
          counts.priority++
          return row.priority
        },
      },
    ],
  })
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
    noteSummary,
    setNoteSummary,
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
    patch(id: string, changes: Partial<EditValues>) {
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
