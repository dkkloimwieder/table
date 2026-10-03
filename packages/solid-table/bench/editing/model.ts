import { createSignal, createStore, onCleanup } from 'solid-js'
import { createTable } from '@tanstack/solid-table/native'
import { createEditing } from './createEditing'
import { validateEdits } from './validation'
import type { RecordData, SaveRequest, SaveResult } from './createEditing'

type Fault =
  'none' | 'hold' | 'refuse' | 'conflict' | 'uncertain' | 'throw' | 'wrong-id'
export function createModel(size: number) {
  const initial = Array.from({ length: size }, (_, index): RecordData => ({
    id: `R${String(index + 1).padStart(4, '0')}`,
    name: `Record ${String(index + 1).padStart(4, '0')}`,
    note: `Note ${index + 1}`,
    revision: '9007199254740993',
  }))
  const [records, setRecords] = createStore<
    Record<string, RecordData | undefined>
  >(Object.fromEntries(initial.map((row) => [row.id, row])))
  const [ids, setIds] = createSignal(initial.map((row) => row.id))
  const counts = {
    name: 0,
    note: 0,
    views: 0,
    cells: 0,
    unmounted: 0,
    requests: 0,
    aborted: 0,
    validations: 0,
  }
  const table = createTable({
    source: { ids, get: (id) => records[id] },
    columns: [
      { id: 'id', accessorKey: 'id', enableGlobalFilter: false },
      {
        id: 'name',
        filterFn: (value, query) =>
          String(value).toLowerCase().includes(String(query).toLowerCase()),
        sortFn: (left, right) => String(left).localeCompare(String(right)),
        accessorFn: (row) => {
          counts.name++
          return row.name
        },
      },
      {
        id: 'note',
        accessorFn: (row) => {
          counts.note++
          return row.note
        },
      },
    ],
  })
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
    patch(id: string, changes: Partial<Pick<RecordData, 'name' | 'note'>>) {
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
