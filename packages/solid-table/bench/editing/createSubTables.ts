import {
  action,
  createEffect,
  createRoot,
  createSignal,
  createStore,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
} from 'solid-js'
import { createModel } from './model'
import type { EditingModel } from './model'
import type { RecordData } from './createEditing'

export type ChildLoad = {
  parentId: string
  scope: string
  signal: AbortSignal
}
type ChildState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: EditingModel }

// Collapse owns only the rendered view. The collection and drafts belong to
// (dataset scope, parent ID), until the source removes that identity.
export function createSubTables(options: {
  ids: () => ReadonlyArray<string>
  scope: () => string
  load: (request: ChildLoad) => Promise<Array<RecordData>>
}) {
  const [entries, setEntries] = createSignal<ReadonlyArray<ChildEntry>>([])
  const [notice, setNotice] = createSignal('')
  // Store only lookup functions here. A child model keeps its own canonical
  // store and is never wrapped in the parent's store.
  const [lookup, setLookup] = createStore<
    Record<string, (() => ChildEntry) | undefined>
  >({})
  const byId = new Map<string, ChildEntry>()
  const collectionOwner = getOwner()
  const counts = { loads: 0, aborted: 0, created: 0, disposed: 0, ignored: 0 }
  let disposed = false

  function makeEntry(parentId: string, scope: string) {
    return runWithOwner(collectionOwner, () =>
      createRoot((dispose) => {
        const owner = getOwner()
        const [expanded, setExpanded] = createSignal(true)
        const [state, setState] = createSignal<ChildState>({
          status: 'loading',
        })
        let active = true
        let request: AbortController | undefined
        let generation = 0
        const current = () =>
          !disposed &&
          active &&
          options.scope() === scope &&
          options.ids().includes(parentId)
        function load() {
          if (!current() || state().status === 'ready') return
          request?.abort()
          const controller = new AbortController()
          request = controller
          const token = ++generation
          setState({ status: 'loading' })
          counts.loads++
          // Also handles a loader that throws before returning its promise.
          void Promise.resolve()
            .then(() => {
              if (!current() || token !== generation) return undefined
              return options.load({
                parentId,
                scope,
                signal: controller.signal,
              })
            })
            .then(
              (records) => {
                if (
                  !current() ||
                  token !== generation ||
                  controller.signal.aborted
                ) {
                  counts.ignored++
                  return
                }
                request = undefined
                const model = runWithOwner(owner, () =>
                  createModel(records!, 'table'),
                )
                counts.created++
                setState({ status: 'ready', model })
              },
              (error: unknown) => {
                if (
                  !current() ||
                  token !== generation ||
                  controller.signal.aborted
                ) {
                  counts.ignored++
                  return
                }
                request = undefined
                setState({
                  status: 'error',
                  message:
                    error instanceof Error
                      ? error.message
                      : 'The sub-table could not load.',
                })
              },
            )
        }
        function closeEditors() {
          const value = state()
          if (value.status === 'ready')
            for (const id of Object.keys(value.model.editing.drafts))
              value.model.editing.collapse(id)
        }
        const draftCount = () => {
          const value = state()
          return value.status === 'ready'
            ? Object.keys(value.model.editing.drafts).length
            : 0
        }
        // rc.13 root disposal can write child counts. Match the fixture's
        // audited action boundary; the caller flushes after the event.
        // eslint-disable-next-line require-yield -- Synchronous disposal action.
        const release = action(function* () {
          if (!active) return
          active = false
          if (request) {
            counts.aborted++
            request.abort()
            request = undefined
          }
          if (state().status === 'ready') counts.disposed++
          dispose()
        })
        return {
          parentId,
          scope,
          expanded,
          state,
          draftCount,
          load,
          release,
          open: () => {
            if (current()) setExpanded(true)
          },
          close: () => {
            if (current()) {
              closeEditors()
              setExpanded(false)
            }
          },
        }
      }),
    )
  }
  type ChildEntry = ReturnType<typeof makeEntry>

  function reconcile() {
    if (disposed) return
    const scope = options.scope()
    const ids = new Set(options.ids())
    let lost = 0
    let changed = false
    for (const [id, entry] of byId) {
      if (entry.scope === scope && ids.has(id)) continue
      lost += entry.draftCount()
      byId.delete(id)
      setLookup((all) => {
        delete all[id]
      })
      entry.release()
      changed = true
    }
    if (changed) setEntries([...byId.values()])
    if (lost)
      setNotice(
        `${lost} sub-table draft${lost === 1 ? '' : 's'} discarded because the parent record or dataset was removed.`,
      )
  }
  createEffect(
    () => ({ scope: options.scope(), ids: options.ids() }),
    () => {
      queueMicrotask(() => untrack(reconcile))
    },
  )
  onCleanup(() => {
    disposed = true
    for (const entry of byId.values()) entry.release()
    byId.clear()
  })
  function open(id: string) {
    if (disposed || !options.ids().includes(id)) return
    reconcile()
    let entry = byId.get(id)
    if (!entry) {
      entry = makeEntry(id, options.scope())
      byId.set(id, entry)
      const created = entry
      setLookup((all) => {
        all[id] = () => created
      })
      setEntries([...byId.values()])
      entry.load()
    } else entry.open()
    return entry
  }
  return {
    entries,
    counts,
    notice,
    get: (id: string) => lookup[id]?.(),
    open,
    toggle: (id: string) => {
      const entry = byId.get(id)
      if (entry?.expanded()) entry.close()
      else open(id)
    },
  }
}
export type SubTables = ReturnType<typeof createSubTables>
