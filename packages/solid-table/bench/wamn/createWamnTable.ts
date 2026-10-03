import { createMemo, createSignal, createStore, onCleanup } from 'solid-js'
import { createTable, nativeAggregations } from '@tanstack/solid-table/native'
import {
  appendPage,
  emptyPage,
  failedRead,
  firstPage,
  hasNextPage,
  newRequestId,
  refusalSentence,
  startRead,
  writeControl,
} from './.input/runtime'
import { query, update } from './.input/widget'
import { get as getMaker } from './.input/widget_maker'
import definition from './.input/definition.json'
import type { Transport } from './.input/runtime'
import type { WidgetQueryRequest, WidgetQueryRow } from './.input/widget'
import type { NativeColumnDef } from '@tanstack/solid-table/native'

export type Widget = WidgetQueryRow
type Mode = 'load' | 'browse'
type Draft = {
  note: string
  code: Widget['code']
  revision: string
  busy: boolean
  message: string | null
}

/** UI boundary: WAMN's page functions hold IDs; Solid alone holds records. */
export function createWamnTable(transport: Transport) {
  if (definition.rowId !== 'id')
    throw new Error('The Widget fixture requires its generated id primary key.')
  const [records, setRecords] = createStore<Record<string, Widget | undefined>>(
    {},
  )
  const [page, setPage] = createSignal(emptyPage<string>())
  const ids = createMemo(() => page().rows)
  const [controls, setControls] = createSignal<Partial<WidgetQueryRequest>>({})
  const [load, setLoad] = createStore({
    mode: 'load',
    cap: 1000,
    generation: 0,
    fullyRead: false,
    startedAt: 0,
    endedAt: 0,
    message: null as string | null,
  })
  const [drafts, setDrafts] = createStore<Record<string, Draft | undefined>>({})
  const [labels, setLabels] = createStore<Record<string, string | undefined>>(
    {},
  )
  const requestedLabels = new Map<string, number>()
  let generation = 0
  let disposed = false
  let reloadPending = false
  const counts = {
    reads: 0,
    inserted: 0,
    changed: 0,
    removed: 0,
    accepted: 0,
    stale: 0,
  }
  onCleanup(() => {
    disposed = true
    generation++
  })
  const local = createMemo(
    () => load.mode === 'load' && load.fullyRead && !page().busy,
  )
  const columns: Array<NativeColumnDef<Widget>> = definition.columns.map(
    (column) => ({
      id: column.id,
      header: column.label,
      accessorFn: (row) => {
        counts.reads++
        return row[column.id as keyof Widget]
      },
      // int64 revisions stay opaque strings. This fixture never sums them.
      aggregationFn: nativeAggregations.count,
      enableGlobalFilter: column.type === 'text',
      filterFn:
        column.type === 'text'
          ? (value, filter) =>
              String(value ?? '')
                .toLowerCase()
                .includes(String(filter).toLowerCase())
          : undefined,
      sortFn: ['text', 'timestamptz'].includes(column.type)
        ? (a, b) => String(a ?? '').localeCompare(String(b ?? ''))
        : undefined,
      size: column.id === 'note' ? 250 : column.id === 'id' ? 310 : 160,
      meta: column,
    }),
  )
  const table = createTable({
    source: { ids, get: (id) => records[id] },
    columns,
    get manualProcessing() {
      return !local()
    },
  })
  const hasDraft = () => Object.keys(drafts).length > 0
  const isCurrent = (version: number) => !disposed && version === generation
  function allowRead() {
    if (!hasDraft()) return true
    setLoad((draft) => {
      draft.message = 'Save or discard edits before loading again.'
    })
    return false
  }
  function mergeRows(rows: ReadonlyArray<Widget>, append: boolean) {
    const seen = new Set(append ? ids() : [])
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || seen.has(row.id))
        throw new Error(`Duplicate or missing row ID: ${row.id}`)
      seen.add(row.id)
    }
    // Validate the whole response before touching the canonical store.
    setRecords((draft) => {
      if (!append)
        for (const id of ids())
          if (!seen.has(id)) {
            delete draft[id]
            counts.removed++
          }
      for (const row of rows) {
        const held = draft[row.id]
        if (held) {
          for (const key of Object.keys(row) as Array<keyof Widget>) {
            if (held[key] !== row[key]) {
              Object.assign(held, { [key]: row[key] })
              counts.changed++
            }
          }
        } else {
          draft[row.id] = row
          counts.inserted++
        }
      }
    })
    if (!append) {
      table.setRowSelection((state) =>
        Object.fromEntries(
          Object.entries(state).filter(([id]) => seen.has(id)),
        ),
      )
      table.setExpanded((state) =>
        Object.fromEntries(
          Object.entries(state).filter(([id]) => seen.has(id)),
        ),
      )
    }
  }
  function resolveLabels(rows: ReadonlyArray<Widget>, version: number) {
    for (const row of rows) {
      const id = row.makerId
      if (
        !id ||
        labels[id] !== undefined ||
        requestedLabels.get(id) === version
      )
        continue
      requestedLabels.set(id, version)
      void getMaker(transport, [{ id }]).then((outcome) => {
        if (!isCurrent(version)) {
          if (requestedLabels.get(id) === version) requestedLabels.delete(id)
          return
        }
        if (outcome.status === 'completed') {
          setLabels((draft) => {
            draft[id] = outcome.value.name
          })
        }
      })
    }
  }
  async function read(append = false) {
    if (disposed || !allowRead()) return false
    const { previous, cap, mode, requestControls } = {
      previous: page(),
      cap: load.cap,
      mode: load.mode,
      requestControls: controls(),
    }
    if (
      append &&
      (mode !== 'browse' ||
        !hasNextPage(previous) ||
        previous.rows.length >= cap)
    )
      return false
    const version = ++generation
    const limit = Math.min(
      cap - (append ? previous.rows.length : 0),
      definition.limit.maximum,
    )
    setLoad((draft) => {
      draft.generation = version
      draft.fullyRead = false
      draft.startedAt = performance.now()
      draft.endedAt = 0
      draft.message = null
    })
    setPage(startRead(previous))
    const outcome = await query(transport, [
      {
        ...requestControls,
        limit,
        ...(append ? { cursor: previous.cursor! } : {}),
      },
    ])
    if (!isCurrent(version)) {
      counts.stale++
      return false
    }
    if (outcome.status !== 'completed') {
      setPage(failedRead(previous, outcome))
      setLoad((draft) => {
        draft.endedAt = performance.now()
      })
      return false
    }
    const rows = outcome.value.item
    try {
      if (rows.length > limit)
        throw new Error('The response exceeds the requested page limit.')
      mergeRows(rows, append)
    } catch (error) {
      setPage(
        failedRead(previous, {
          status: 'uncertain',
          reason: String(error),
          retryRefusal: null,
        }),
      )
      setLoad((draft) => {
        draft.endedAt = performance.now()
      })
      return false
    }
    const keys = rows.map((row) => row.id)
    setPage(
      append
        ? appendPage(previous, keys, outcome.value.nextCursor)
        : firstPage(keys, outcome.value.nextCursor),
    )
    setLoad((draft) => {
      draft.fullyRead = outcome.value.nextCursor === null
      draft.endedAt = performance.now()
    })
    counts.accepted++
    resolveLabels(rows, version)
    return true
  }
  async function configure(options: {
    mode?: Mode
    cap?: number
    code?: string
    descending?: boolean
  }) {
    if (!allowRead()) return Promise.resolve(false)
    if (
      options.cap !== undefined &&
      (!Number.isSafeInteger(options.cap) || options.cap < 1)
    ) {
      setLoad((draft) => {
        draft.message = 'The cap must be a positive whole number.'
      })
      return Promise.resolve(false)
    }
    const version = ++generation
    setLoad((draft) => {
      if (options.mode) draft.mode = options.mode
      if (options.cap !== undefined) draft.cap = options.cap
      draft.fullyRead = false
      draft.generation = version
    })
    setControls((current) => {
      let next = current
      if (options.code !== undefined)
        next = writeControl(
          next,
          ['filter', 'code'],
          options.code.split(',').filter(Boolean),
        )
      if (options.descending !== undefined)
        next = {
          ...next,
          sort: {
            field: 'created_at',
            direction: options.descending ? 'descending' : 'ascending',
          },
        }
      return next
    })
    setRecords(() => ({}))
    setPage(emptyPage<string>())
    setLabels(() => ({}))
    requestedLabels.clear()
    // Solid commits synchronous writes in a microtask. Wait for the complete
    // configuration before the next request reads it. The generation already
    // invalidates old replies, including replies queued before this await.
    await Promise.resolve()
    if (!isCurrent(version)) return false
    return read()
  }
  function edit(id: string, change: Partial<Pick<Draft, 'note' | 'code'>>) {
    const row = records[id]
    if (!row || page().busy || drafts[id]?.busy) return
    setDrafts((draft) => {
      draft[id] ??= {
        note: row.note ?? '',
        code: row.code,
        revision: row.editVersion,
        busy: false,
        message: null,
      }
      Object.assign(draft[id], change, { message: null })
    })
  }
  async function discard(id: string) {
    if (drafts[id]?.busy) return
    setDrafts((draft) => {
      delete draft[id]
    })
    setLoad((draft) => {
      draft.message = null
    })
    await Promise.resolve()
    if (reloadPending && !hasDraft()) {
      reloadPending = false
      void read()
    }
  }
  async function save(id: string) {
    const draft = drafts[id]
    const row = records[id]
    if (!draft || !row || draft.busy) return false
    const version = generation
    const change = {
      ...(draft.note !== (row.note ?? '') ? { note: draft.note } : {}),
      ...(draft.code !== row.code ? { code: draft.code } : {}),
    }
    setDrafts((all) => {
      all[id]!.busy = true
      all[id]!.message = null
    })
    const outcome = await update(transport, [
      {
        id,
        change,
        expectedEditVersion: draft.revision,
        requestId: newRequestId(),
      },
    ])
    if (!isCurrent(version)) return false
    if (outcome.status !== 'completed') {
      setDrafts((all) => {
        all[id]!.busy = false
        all[id]!.message =
          outcome.status === 'refused'
            ? refusalSentence(outcome.code)
            : outcome.status === 'uncertain'
              ? outcome.reason
              : 'The operation completed only in part.'
      })
      return false
    }
    if (outcome.value.id !== id) {
      setDrafts((all) => {
        all[id]!.busy = false
        all[id]!.message = 'The update returned a different record.'
      })
      return false
    }
    setRecords((all) => {
      Object.assign(all[id]!, outcome.value)
    })
    setDrafts((all) => {
      delete all[id]
    })
    if (change.code !== undefined && controls().filter?.code?.length)
      reloadPending = true
    setLoad((load) => {
      load.message = null
    })
    await Promise.resolve()
    if (reloadPending && !hasDraft()) {
      reloadPending = false
      await read()
    }
    return true
  }
  // Explicit table-only workload. It never represents a platform page response.
  function synthetic(rows: Array<Widget>) {
    if (!allowRead()) return false
    generation++
    mergeRows(rows, false)
    setPage(firstPage(rows.map((row) => row.id)))
    setLoad((draft) => {
      draft.mode = 'load'
      draft.generation = generation
      draft.fullyRead = true
      draft.cap = rows.length
    })
    return true
  }
  return {
    table,
    records,
    page,
    load,
    local,
    controls,
    drafts,
    labels,
    read,
    configure,
    edit,
    discard,
    save,
    synthetic,
    counts,
  }
}
