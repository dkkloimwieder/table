import { createSignal, onCleanup, onSettled, untrack } from 'solid-js'
import { parseView } from './viewConfiguration'
import type { TableView, ViewConfiguration } from './viewConfiguration'
import type { ViewStorage } from './viewStorage'
import type { EditingModel } from './model'
import type { TableControls } from './Table'

export function createTableViews(options: {
  model: EditingModel
  scope: string
  storage: ViewStorage
  controls: () => TableControls
  configure: (value: TableControls) => void
}) {
  const [views, setViews] = createSignal<ReadonlyArray<TableView>>([])
  const [selected, setSelected] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [message, setMessage] = createSignal('')
  const [error, setError] = createSignal('')
  let disposed = false
  let pending: AbortController | undefined
  onCleanup(() => {
    disposed = true
    pending?.abort()
    pending = undefined
  })
  function capture(): ViewConfiguration {
    return untrack(() => ({
      ...options.model.captureView(),
      controls: { ...options.controls() },
    }))
  }
  function available() {
    if (disposed || pending) return false
    if (untrack(options.model.locked)) {
      setError('Save or cancel edits before changing views.')
      return false
    }
    return true
  }
  const find = (id: string) => untrack(views).find((view) => view.id === id)
  function choose(id: string) {
    if (!available()) return false
    const view = find(id)
    if (!view) return false
    // A complete configuration lands in one synchronous write sequence. No
    // record data, draft state or width state is read or replaced.
    if (!options.model.applyView(view.configuration)) return false
    options.configure({ ...view.configuration.controls })
    setSelected(id)
    setError('')
    setMessage(`Applied ${view.name}.`)
    return true
  }
  async function request(work: (signal: AbortSignal) => Promise<() => void>) {
    if (!available()) return false
    const controller = new AbortController()
    pending = controller
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const land = await work(controller.signal)
      if (disposed || controller.signal.aborted) return false
      land()
      return true
    } catch (cause) {
      if (!disposed && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'The view operation failed. Try again.',
        )
      return false
    } finally {
      if (pending === controller) {
        pending = undefined
        if (!disposed) setBusy(false)
      }
    }
  }
  function reload() {
    return request(async (signal) => {
      const result = await options.storage.load({
        scope: options.scope,
        signal,
      })
      if (disposed || signal.aborted) return () => {}
      if (!Array.isArray(result))
        throw new Error('The saved view list is invalid.')
      const loaded = untrack(() =>
        result.map((value) => parseView(value, options.model)),
      )
      const ids = new Set<string>()
      const names = new Set<string>()
      for (const view of loaded) {
        const name = view.name.toLocaleLowerCase('en-US')
        if (ids.has(view.id) || names.has(name))
          throw new Error(
            'The saved view list contains duplicate names or IDs.',
          )
        ids.add(view.id)
        names.add(name)
      }
      return () => {
        setViews(loaded)
        if (!ids.has(untrack(selected))) setSelected('')
      }
    })
  }
  function persist(name: string, id?: string, renameOnly = false) {
    if (!available()) return Promise.resolve(false)
    try {
      const existing = id ? find(id) : undefined
      if ((id || renameOnly) && !existing)
        throw new Error('Choose a saved view first.')
      const view = untrack(() =>
        parseView(
          {
            // getRandomValues also works when a development preview uses HTTP.
            id: id ?? crypto.getRandomValues(new Uint32Array(4)).join('-'),
            name: name.trim(),
            configuration: renameOnly ? existing!.configuration : capture(),
          },
          options.model,
        ),
      )
      if (
        untrack(views).some(
          (item) =>
            item.id !== view.id &&
            item.name.toLocaleLowerCase('en-US') ===
              view.name.toLocaleLowerCase('en-US'),
        )
      )
        throw new Error('A view with this name already exists.')
      return request(async (signal) => {
        await options.storage.save({
          scope: options.scope,
          signal,
          view: structuredClone(view),
        })
        return () => {
          setViews((previous) =>
            existing
              ? previous.map((item) => (item.id === view.id ? view : item))
              : [...previous, view],
          )
          setSelected(view.id)
          setMessage(`${renameOnly ? 'Renamed' : 'Saved'} ${view.name}.`)
        }
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The view configuration is invalid.',
      )
      return Promise.resolve(false)
    }
  }
  function remove(id: string) {
    const view = find(id)
    if (!view) return Promise.resolve(false)
    return request(async (signal) => {
      await options.storage.remove({ scope: options.scope, signal, id })
      return () => {
        setViews((previous) => previous.filter((item) => item.id !== id))
        if (untrack(selected) === id) setSelected('')
        setMessage(
          `Deleted ${view.name}. The current table configuration stays in place.`,
        )
      }
    })
  }
  onSettled(() => {
    void reload()
  })
  return {
    views,
    selected,
    busy,
    error,
    message,
    capture,
    choose,
    reload,
    saveAs: (name: string) => persist(name),
    update: () => {
      const view = find(untrack(selected))
      return view ? persist(view.name, view.id) : Promise.resolve(false)
    },
    rename: (name: string) => persist(name, untrack(selected), true),
    remove: () => remove(untrack(selected)),
  }
}
export type TableViews = ReturnType<typeof createTableViews>
