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
import type { EditingFields } from './fields'
import type { EditingCallbackFactory } from './editingCallbacks'
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
  fields?: EditingFields
  createEditingCallbacks?: EditingCallbackFactory
  ids: () => ReadonlyArray<string>
  scope: () => string
  locked: () => boolean
  onEditingChange: (editing: boolean) => void
  load: (request: ChildLoad) => Promise<Array<RecordData>>
  ready?: (model: EditingModel, scope: string, parentId: string) => void
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
  const editingChildren = new Set<string>()
  function publishEditing(id: string, editing: boolean) {
    const previous = editingChildren.size > 0
    if (editing) editingChildren.add(id)
    else editingChildren.delete(id)
    const next = editingChildren.size > 0
    if (previous !== next) options.onEditingChange(next)
  }
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
        let disposeModel: (() => void) | undefined
        let generation = 0
        // Failed attempts need the same disposal boundary as released entries.
        // eslint-disable-next-line require-yield -- Synchronous disposal action.
        const disposeScope = action(function* (dispose: () => void) {
          dispose()
        })
        onCleanup(() => {
          if (disposeModel) disposeScope(disposeModel)
        })
        const current = () =>
          !disposed &&
          active &&
          options.scope() === scope &&
          options.ids().includes(parentId)
        // Each entry observes only its own editor. The parent receives one boolean.
        createEffect(
          () => {
            const value = state()
            return value.status === 'ready' && value.model.locked()
          },
          (editing) => {
            // Publish in the effect phase so the same flush locks the parent.
            if (!disposed && active) publishEditing(parentId, editing)
          },
        )
        function load() {
          if (!current() || state().status === 'ready') return
          request?.abort()
          const controller = new AbortController()
          request = controller
          const token = ++generation
          const currentRequest = () =>
            current() && token === generation && !controller.signal.aborted
          setState({ status: 'loading' })
          counts.loads++
          // Also handles a loader that throws before returning its promise.
          void Promise.resolve()
            .then(() => {
              if (!currentRequest()) return undefined
              return options.load({
                parentId,
                scope,
                signal: controller.signal,
              })
            })
            .then((records) => {
              if (!currentRequest()) {
                counts.ignored++
                return
              }
              if (!Array.isArray(records))
                throw new Error('The sub-table loader must return records.')
              let disposeAttempt: (() => void) | undefined
              let accepted = false
              try {
                const model = runWithOwner(owner, () =>
                  createRoot((dispose) => {
                    disposeAttempt = dispose
                    const model = createModel(
                      records,
                      'table',
                      options.fields,
                      options.createEditingCallbacks?.({
                        kind: 'child',
                        scope,
                        parentId,
                      }),
                    )
                    options.ready?.(model, scope, parentId)
                    return model
                  }),
                )
                // The ready callback can remove the parent or start a retry.
                if (!currentRequest()) {
                  counts.ignored++
                  return
                }
                request = undefined
                disposeModel = disposeAttempt
                counts.created++
                setState({ status: 'ready', model })
                accepted = true
              } finally {
                if (!accepted && disposeAttempt) disposeScope(disposeAttempt)
              }
            })
            .catch((error: unknown) => {
              if (!currentRequest()) {
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
            })
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
          queueMicrotask(() => {
            if (!disposed) publishEditing(parentId, false)
          })
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
            if (current() && !options.locked()) {
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
    if (disposed || options.locked() || !options.ids().includes(id)) return
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
