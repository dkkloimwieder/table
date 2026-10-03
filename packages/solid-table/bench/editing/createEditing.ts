import { createStore, onCleanup } from 'solid-js'

export type RecordData = {
  id: string
  name: string
  note: string
  revision: string
}
export type TextColumn = 'name' | 'note'
export type SaveRequest = {
  id: string
  expectedRevision: string
  changes: Partial<Pick<RecordData, TextColumn>>
}
export type SaveResult =
  | { status: 'saved'; id: string; revision: string }
  | { status: 'refused' | 'conflict' | 'uncertain'; message: string }
type Draft = {
  name: string
  note: string
  revision: string
  status: 'editing' | 'pending' | 'refused' | 'conflict' | 'uncertain'
  message: string
}

/** Fixture policy, separate from Table and from each rendered row's lifetime. */
export function createEditing(options: {
  get: (id: string) => RecordData | undefined
  commit: (request: SaveRequest, signal: AbortSignal) => Promise<SaveResult>
  apply: (
    request: SaveRequest,
    result: Extract<SaveResult, { status: 'saved' }>,
  ) => void
}) {
  const [drafts, setDrafts] = createStore<Record<string, Draft | undefined>>({})
  const pending = new Map<string, AbortController>()
  let disposed = false
  // Primitive cleanup also guards responses when disposed before settlement.
  onCleanup(() => {
    disposed = true
    for (const controller of pending.values()) controller.abort()
    pending.clear()
  })
  function begin(id: string) {
    const row = options.get(id)
    if (disposed || !row || pending.has(id)) return
    const initial: Draft = {
      name: row.name,
      note: row.note,
      revision: row.revision,
      status: 'editing',
      message: '',
    }
    setDrafts((all) => {
      all[id] ??= initial
    })
  }
  function change(id: string, column: TextColumn, value: string) {
    if (disposed || pending.has(id)) return
    setDrafts((all) => {
      const draft = all[id]
      if (!draft) return
      draft[column] = value
      draft.status = 'editing'
      draft.message = ''
    })
  }
  function cancel(id: string) {
    if (disposed || pending.has(id)) return false
    setDrafts((all) => {
      delete all[id]
    })
    return true
  }
  function fail(
    id: string,
    status: 'refused' | 'conflict' | 'uncertain',
    message: string,
  ) {
    setDrafts((all) => {
      const draft = all[id]
      if (draft) {
        draft.status = status
        draft.message = message
      }
    })
    return false
  }
  async function save(id: string) {
    if (disposed || pending.has(id)) return false
    const draft = drafts[id]
    if (!draft) return false
    const row = options.get(id)
    if (!row)
      return fail(
        id,
        'conflict',
        'This record is no longer loaded. Your draft is preserved.',
      )
    if (row.revision !== draft.revision)
      return fail(
        id,
        'conflict',
        'This record changed after editing started. Cancel to use its current values.',
      )
    if (!draft.name.trim())
      return fail(id, 'refused', 'Enter a name before saving.')
    const request: SaveRequest = {
      id,
      expectedRevision: draft.revision,
      changes: {
        ...(draft.name !== row.name ? { name: draft.name } : {}),
        ...(draft.note !== row.note ? { note: draft.note } : {}),
      },
    }
    if (!Object.keys(request.changes).length) return cancel(id)
    const controller = new AbortController()
    // Solid commits writes later. This synchronous request guard prevents duplicates.
    pending.set(id, controller)
    setDrafts((all) => {
      all[id]!.status = 'pending'
      all[id]!.message = ''
    })
    try {
      const result = await options.commit(request, controller.signal)
      if (controller.signal.aborted) return false
      if (result.status !== 'saved')
        return fail(id, result.status, result.message)
      const current = options.get(id)
      if (result.id !== id)
        return fail(
          id,
          'uncertain',
          'The response identifies another record. Your draft is preserved.',
        )
      if (!current || current.revision !== request.expectedRevision)
        return fail(
          id,
          'conflict',
          'This record changed while saving. Your draft is preserved.',
        )
      options.apply(request, result)
      setDrafts((all) => {
        delete all[id]
      })
      return true
    } catch {
      if (controller.signal.aborted) return false
      return fail(
        id,
        'uncertain',
        'The save could not be confirmed. Your draft is preserved.',
      )
    } finally {
      pending.delete(id)
    }
  }
  return { drafts, begin, change, cancel, save }
}
