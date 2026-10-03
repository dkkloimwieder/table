import { render } from '@solidjs/web'
import { OBSERVE, action, flush } from 'solid-js'
import { App } from './App'
import { createFixtureServer, makeWidget } from './transport'
import provenance from './.input/provenance.json'
import type { FixtureController } from './App'

let controller: FixtureController | undefined
let server: ReturnType<typeof createFixtureServer> | undefined
let dispose: (() => void) | undefined
let remembered: WeakRef<object> | undefined
let rememberedId: string | undefined
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
let diagnosticEvents: Array<unknown> = []
const root = document.getElementById('root')!
// rc.13 can leave disposed computations in an unscheduled pending-node queue.
// A public action boundary schedules the drain; flush runs after the action.
// Keep this fixture workaround until table-gd3.6.5 is resolved upstream.
// eslint-disable-next-line require-yield -- This synchronous action only disposes the root.
const disposeRoot = action(function* () {
  dispose?.()
})
function stop() {
  disposeRoot()
  dispose = undefined
  server?.dispose()
  server = undefined
  controller = undefined
  remembered = undefined
  flush()
}
function start(size = 8) {
  stop()
  diagnosticEvents.push(...(capture?.stop() ?? []))
  capture = OBSERVE?.diagnostics.capture()
  server = createFixtureServer(size)
  dispose = render(
    () => (
      <App
        transport={server!.transport}
        ready={(value) => {
          controller = value
        }}
      />
    ),
    root,
  )
  flush()
}
function read() {
  const { model, counts, viewport } = controller!
  const ids = model.table.getRowIds()
  const sample = ids.slice(0, 8).map((id) => ({ ...model.records[id] }))
  return {
    page: { ...model.page(), rows: undefined, count: model.page().rows.length },
    load: { ...model.load },
    local: model.local(),
    count: ids.length,
    firstIds: ids.slice(0, 8),
    lastId: ids.at(-1),
    sample,
    total: model.table.getTotalValue('id') ?? null,
    selection: { ...model.table.state.rowSelection },
    drafts: Object.fromEntries(
      Object.entries(model.drafts).map(([id, draft]) => [
        id,
        draft && { ...draft },
      ]),
    ),
    labels: { ...model.labels },
    counts: { ...counts, ...model.counts },
    identity: remembered
      ? remembered.deref() === model.records[rememberedId!]
      : null,
    sent: server!.sent,
    visible: [...viewport.querySelectorAll('[data-row]')].map((row) => ({
      id: row.getAttribute('data-row'),
      cells: [...row.querySelectorAll('[data-column]')].map((cell) => [
        cell.getAttribute('data-column'),
        cell.textContent,
      ]),
    })),
  }
}
const api = {
  start,
  stop,
  read,
  provenance,
  ready: () => Boolean(controller),
  fault: (
    path: string,
    fault: Parameters<NonNullable<typeof server>['fault']>[1],
  ) => server!.fault(path, fault),
  release: () => server!.release(),
  patch: (
    index: number,
    change: Parameters<NonNullable<typeof server>['patch']>[1],
  ) => server!.patch(index, change),
  configure: (
    options: Parameters<FixtureController['model']['configure']>[0],
  ) => {
    void controller!.model.configure(options)
  },
  reload: () => {
    void controller!.model.read()
  },
  next: () => {
    void controller!.model.read(true)
  },
  edit: (
    id: string,
    change: Parameters<FixtureController['model']['edit']>[1],
  ) => {
    controller!.model.edit(id, change)
    flush()
  },
  save: (id: string) => {
    void controller!.model.save(id)
  },
  discard: (id: string) => {
    controller!.model.discard(id)
    flush()
  },
  select: (id: string) => {
    controller!.model.table.getRow(id).toggleSelected()
    flush()
  },
  filter: (value: string) => {
    controller!.model.table.setColumnFilters(
      value ? [{ id: 'note', value }] : [],
    )
    flush()
  },
  sort: (enabled: boolean) => {
    controller!.model.table.setSorting(
      enabled ? [{ id: 'note', desc: true }] : [],
    )
    flush()
  },
  scroll: (index: number) => controller!.virtualizer.scrollToIndex(index),
  synthetic: (size: number) => {
    controller!.model.synthetic(
      Array.from({ length: size }, (_, index) => makeWidget(index)),
    )
    flush()
  },
  remember: (id: string) => {
    rememberedId = id
    remembered = new WeakRef(controller!.model.records[id]!)
  },
  diagnostics: () => {
    const events = [...diagnosticEvents, ...(capture?.stop() ?? [])]
    diagnosticEvents = []
    capture = OBSERVE?.diagnostics.capture()
    return events
  },
}
declare global {
  interface Window {
    wamn: typeof api
  }
}
window.wamn = api
start()
