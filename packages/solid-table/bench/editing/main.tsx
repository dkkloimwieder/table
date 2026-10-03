import { render } from '@solidjs/web'
import { OBSERVE, action, flush, snapshot } from 'solid-js'
import { App } from './App'
import type { SaveMode } from './App'
import type { EditingModel } from './model'

const root = document.getElementById('root')!
let model: EditingModel | undefined
let dispose: (() => void) | undefined
let remembered: WeakRef<object> | undefined
let rememberedId = ''
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
const events: Array<unknown> = []
let lastCounts: EditingModel['counts'] | undefined
// Same rc.13 disposal workaround as the qualified WAMN fixture (table-gd3.6.5).
// eslint-disable-next-line require-yield -- This synchronous action only disposes the root.
const disposeRoot = action(function* () {
  dispose?.()
})
function stop() {
  const counts = model?.counts
  disposeRoot()
  lastCounts = counts && { ...counts }
  dispose = undefined
  model = undefined
  remembered = undefined
  flush()
}
function start(size = 8, saveMode: SaveMode = 'row') {
  stop()
  events.push(...(capture?.stop() ?? []))
  capture = OBSERVE?.diagnostics.capture()
  dispose = render(
    () => (
      <App
        size={size}
        saveMode={saveMode}
        ready={(value) => {
          model = value
        }}
      />
    ),
    root,
  )
  flush()
}
const api = {
  start,
  stop,
  ready: () => Boolean(model),
  read: () => ({
    ids: model!.table.getRowIds(),
    sample: model!.table
      .getSourceIds()
      .slice(0, 8)
      .map((id) => ({ ...model!.records[id] })),
    drafts: snapshot(model!.editing.drafts),
    savingAll: model!.editing.savingAll(),
    counts: { ...model!.counts },
    sent: model!.sent,
    identity: remembered
      ? remembered.deref() === model!.records[rememberedId]
      : null,
  }),
  fault: (value: Parameters<EditingModel['fault']>[0]) => model!.fault(value),
  release: () => model!.release(),
  patch: (id: string, value: Parameters<EditingModel['patch']>[1]) => {
    model!.patch(id, value)
    flush()
  },
  remove: (id: string) => {
    model!.remove(id)
    flush()
  },
  saveTwice: (id: string) => {
    void model!.editing.save(id)
    void model!.editing.save(id)
  },
  saveAllTwice: () => {
    void model!.editing.saveAll()
    void model!.editing.saveAll()
  },
  remember: (id: string) => {
    rememberedId = id
    remembered = new WeakRef(model!.records[id]!)
  },
  lastCounts: () => lastCounts,
  diagnostics: () => {
    events.push(...(capture?.stop() ?? []))
    capture = OBSERVE?.diagnostics.capture()
    return events.splice(0)
  },
}
declare global {
  interface Window {
    editingFixture: typeof api
  }
}
window.editingFixture = api
const parameters = new URLSearchParams(location.search)
start(
  Number(parameters.get('size')) || 8,
  parameters.get('save') === 'all' ? 'table' : 'row',
)
