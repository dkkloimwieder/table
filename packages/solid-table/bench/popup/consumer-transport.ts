export type Choice = { id: string; label: string }
export type ChoicePage = { options: Array<Choice>; next: number | null }
export type Submission = Record<string, string | boolean>
export type SavedRecord = {
  id: string
  name: string
  category: string
  enabled: string
}
type Request =
  | { kind: 'choices'; query: string; page: number }
  | { kind: 'save'; values: Submission }
type Response = ChoicePage | SavedRecord

// A fake server can finish a request after cancellation. The consumer must ignore it.
export function createConsumerTransport(manual = false) {
  let serial = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const choices = ['West', 'East', 'North', 'South'].map((label) => ({
    id: label.toLowerCase(),
    label,
  }))
  const pending = new Map<
    number,
    {
      request: Request
      aborted: boolean
      resolve: (value: Response) => void
      reject: (error: Error) => void
      detach: () => void
    }
  >()
  const history: Array<{ id: number; request: Request; aborted: boolean }> = []
  function request<T extends Response>(request: Request, signal: AbortSignal) {
    const id = ++serial
    const entry = { id, request, aborted: signal.aborted }
    history.push(entry)
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        entry.aborted = true
      }
      signal.addEventListener('abort', abort, { once: true })
      pending.set(id, {
        request,
        get aborted() {
          return entry.aborted
        },
        resolve: (value) => resolve(value as T),
        reject,
        detach: () => signal.removeEventListener('abort', abort),
      })
      if (!manual) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (request.kind === 'choices') {
            const matches = choices.filter((choice) =>
              choice.label.toLowerCase().includes(request.query.toLowerCase()),
            )
            finish(
              id,
              request.query.toLowerCase() === 'fail'
                ? { error: 'Search failed. Try again.' }
                : {
                    options: matches.slice(
                      request.page * 2,
                      request.page * 2 + 2,
                    ),
                    next:
                      matches.length > request.page * 2 + 2
                        ? request.page + 1
                        : null,
                  },
            )
          } else {
            const name = String(
              request.values.displayName ?? request.values.projectTitle,
            )
            finish(
              id,
              name === 'Reject'
                ? { error: 'Save failed. Try another name.' }
                : {
                    id: `saved-${id}`,
                    name,
                    category: String(
                      request.values.regionId ?? request.values.teamId,
                    ),
                    enabled:
                      (request.values.enabled ?? request.values.notify)
                        ? 'Yes'
                        : 'No',
                  },
            )
          }
        }, 150)
        timers.add(timer)
      }
    })
  }
  function finish(id: number, response: Response | { error: string }) {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    entry.detach()
    if ('error' in response) entry.reject(new Error(response.error))
    else entry.resolve(response)
  }
  return {
    choices: (query: string, page: number, signal: AbortSignal) =>
      request<ChoicePage>({ kind: 'choices', query, page }, signal),
    save: (values: Submission, signal: AbortSignal) =>
      request<SavedRecord>({ kind: 'save', values }, signal),
    read: () => ({
      history: history.map((entry) => ({ ...entry })),
      pending: [...pending.keys()],
    }),
    finish,
    dispose() {
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      for (const entry of pending.values()) {
        entry.detach()
        entry.reject(new Error('Consumer disposed.'))
      }
      pending.clear()
    },
  }
}
