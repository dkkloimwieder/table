import type { TableView } from './viewConfiguration'

export type ViewRequest = { scope: string; signal: AbortSignal }
export type ViewStorage = {
  load: (request: ViewRequest) => unknown | Promise<unknown>
  save: (request: ViewRequest & { view: TableView }) => void | Promise<void>
  remove: (request: ViewRequest & { id: string }) => void | Promise<void>
}

/** Demo storage lives for one App mount. Applications supply their own callbacks. */
export function createMemoryViewStorage() {
  const scopes = new Map<string, Map<string, TableView>>()
  return {
    load: ({ scope, signal }) => {
      signal.throwIfAborted()
      return structuredClone([...(scopes.get(scope)?.values() ?? [])])
    },
    save: ({ scope, signal, view }) => {
      signal.throwIfAborted()
      let views = scopes.get(scope)
      if (!views) scopes.set(scope, (views = new Map()))
      views.set(view.id, structuredClone(view))
    },
    remove: ({ scope, signal, id }) => {
      signal.throwIfAborted()
      const views = scopes.get(scope)
      views?.delete(id)
      if (!views?.size) scopes.delete(scope)
    },
  } satisfies ViewStorage
}
