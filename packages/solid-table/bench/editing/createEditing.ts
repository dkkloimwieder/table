import { createStore, onCleanup } from 'solid-js'

export type RecordData = {
  id: string
  name: string
  note: string
  priority: string
  revision: string
}
export type TextColumn = 'name' | 'note'
export type EditColumn = TextColumn | 'priority'
export type EditValues = Pick<RecordData, EditColumn>
export type ValidationResult =
  | { success: true; data: EditValues }
  | {
      success: false
      fieldErrors: Partial<Record<EditColumn, string>>
      message: string
    }
export type SaveRequest = {
  id: string
  expectedRevision: string
  changes: Partial<EditValues>
}
export type SaveResult =
  | { status: 'saved'; id: string; revision: string }
  | { status: 'refused' | 'conflict' | 'uncertain'; message: string }
type Draft = {
  name: string
  note: string
  priority: string
  revision: string
  status:
    'editing' | 'invalid' | 'pending' | 'refused' | 'conflict' | 'uncertain'
  message: string
  fieldErrors: Partial<Record<EditColumn, string>>
  validationAttempted: boolean
  activeColumn: EditColumn
  expanded: boolean
}

/** Fixture policy, separate from Table and from each rendered row's lifetime. */
export function createEditing(options: {
  get: (id: string) => RecordData | undefined
  validate: (values: EditValues) => ValidationResult
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
  function begin(id: string, column: EditColumn = 'name') {
    const row = options.get(id)
    if (disposed || !row || pending.has(id)) return
    const initial: Draft = {
      name: row.name,
      note: row.note,
      priority: row.priority,
      revision: row.revision,
      status: 'editing',
      message: '',
      fieldErrors: {},
      validationAttempted: false,
      activeColumn: column,
      expanded: true,
    }
    setDrafts((all) => {
      all[id] ??= initial
      all[id].activeColumn = column
      all[id].expanded = true
    })
  }
  function collapse(id: string) {
    if (disposed) return
    const row = options.get(id)
    setDrafts((all) => {
      const draft = all[id]
      if (!draft) return
      if (
        !pending.has(id) &&
        draft.status === 'editing' &&
        row?.revision === draft.revision &&
        row.name === draft.name &&
        row.note === draft.note &&
        row.priority === draft.priority
      )
        delete all[id]
      else draft.expanded = false
    })
  }
  function focus(id: string, column: EditColumn) {
    if (disposed) return
    setDrafts((all) => {
      if (all[id]) all[id].activeColumn = column
    })
  }
  function change(id: string, column: EditColumn, value: string) {
    if (disposed || pending.has(id)) return
    setDrafts((all) => {
      const draft = all[id]
      if (!draft) return
      draft[column] = value
      draft.status = 'editing'
      draft.message = ''
      if (draft.validationAttempted)
        showValidation(
          draft,
          options.validate({
            name: draft.name,
            note: draft.note,
            priority: draft.priority,
          }),
        )
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
  function showValidation(draft: Draft, result: ValidationResult) {
    draft.validationAttempted = true
    draft.fieldErrors = result.success ? {} : result.fieldErrors
    draft.message = result.success ? '' : result.message
    draft.status = result.success ? 'editing' : 'invalid'
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
    const validation = options.validate({
      name: draft.name,
      note: draft.note,
      priority: draft.priority,
    })
    setDrafts((all) => showValidation(all[id]!, validation))
    if (!validation.success) return false
    const values = validation.data
    const request: SaveRequest = {
      id,
      expectedRevision: draft.revision,
      changes: {
        ...(values.name !== row.name ? { name: values.name } : {}),
        ...(values.note !== row.note ? { note: values.note } : {}),
        ...(values.priority !== row.priority
          ? { priority: values.priority }
          : {}),
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
  return { drafts, begin, collapse, focus, change, cancel, save }
}
