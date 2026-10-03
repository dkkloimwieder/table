import { onCleanup } from 'solid-js'
import { createMemoryViewStorage } from './viewStorage'
import type { ViewRequest, ViewStorage } from './viewStorage'
import type { TableView } from './viewConfiguration'

// Fault controls belong only to the browser harness. The UI receives the same
// application callbacks as the normal in-memory demo.
export function createViewStorageFixture() {
  const memory = createMemoryViewStorage()
  let next: 'none' | 'hold' | 'late' | 'refuse' | 'throw' = 'none'
  let reply: { value: unknown } | undefined
  let lastSaved: TableView | undefined
  const held = new Set<() => void>()
  const pending = new Set<() => void>()
  const counts = { load: 0, save: 0, remove: 0, aborted: 0 }
  function send<T>(
    request: ViewRequest,
    operation: keyof Omit<typeof counts, 'aborted'>,
    work: (request: ViewRequest) => T,
  ) {
    const fault = next
    next = 'none'
    counts[operation]++
    if (fault === 'throw') throw new Error('View storage failed. Try again.')
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        held.delete(finish)
        pending.delete(cancel)
        request.signal.removeEventListener('abort', abort)
      }
      const finish = () => {
        cleanup()
        try {
          if (fault === 'refuse')
            throw new Error('View storage refused this request. Try again.')
          resolve(
            work(
              fault === 'late'
                ? { ...request, signal: new AbortController().signal }
                : request,
            ),
          )
        } catch (error) {
          reject(error)
        }
      }
      const cancel = () => {
        cleanup()
        reject(new Error('View request canceled.'))
      }
      const abort = () => {
        counts.aborted++
        if (fault !== 'late') cancel()
      }
      pending.add(cancel)
      request.signal.addEventListener('abort', abort, { once: true })
      if (fault === 'hold' || fault === 'late') held.add(finish)
      else queueMicrotask(finish)
      if (request.signal.aborted) abort()
    })
  }
  onCleanup(() => {
    for (const cancel of pending) cancel()
    pending.clear()
    held.clear()
    reply = undefined
    lastSaved = undefined
  })
  const storage: ViewStorage = {
    load: (request) => {
      const injected = reply
      reply = undefined
      return send(request, 'load', (current) =>
        injected ? structuredClone(injected.value) : memory.load(current),
      )
    },
    save: ({ view, ...request }) =>
      send(request, 'save', (current) => {
        memory.save({ ...current, view })
        lastSaved = structuredClone(view)
      }),
    remove: ({ id, ...request }) =>
      send(request, 'remove', (current) => memory.remove({ ...current, id })),
  }
  return {
    storage,
    counts,
    fault: (value: typeof next) => {
      next = value
    },
    reply: (value: unknown) => {
      reply = { value }
    },
    lastSaved: () => lastSaved,
    pending: () => pending.size,
    release: () => {
      for (const finish of [...held]) finish()
    },
  }
}
export type ViewStorageFixture = ReturnType<typeof createViewStorageFixture>
