import { render } from '@solidjs/web'
import { action, createRoot, createStore, flush, onCleanup } from 'solid-js'
import { createEditing } from '../editing/createEditing'
import { createModel, createRecords } from '../editing/model'
import { Table } from '../editing/Table'
import { validateEdits } from '../editing/validation'
import type { RecordData } from '../editing/createEditing'
import type { EditingModel } from '../editing/model'

// Both presentations use the existing fixture components, not simulated bindings.
type Mode = 'store' | 'controller' | 'model' | 'read-only' | 'editable'
const host = document.getElementById('root')!
let dispose: (() => void) | undefined
let model: EditingModel | undefined
let records: Record<string, RecordData | undefined> | undefined
let controller: ReturnType<typeof createEditing> | undefined
let patch: EditingModel['patch'] | undefined
let identity: RecordData | undefined
let cleaned = false
let size = 0
let mode: Mode = 'store'
let elapsedMs = 0

// Use the existing qualified rc.13 disposal boundary for every mode.
// eslint-disable-next-line require-yield -- The action only disposes the owner.
const disposeOwner = action(function* () {
  dispose?.()
})
function stop() {
  disposeOwner()
  dispose = undefined
  model = undefined
  records = undefined
  controller = undefined
  patch = undefined
  identity = undefined
  flush()
  host.replaceChildren()
  return { cleaned, children: host.childElementCount }
}
function start(nextMode: Mode, nextSize: number) {
  stop()
  mode = nextMode
  size = nextSize
  cleaned = false
  const started = performance.now()
  const setup = () => {
    onCleanup(() => {
      cleaned = true
    })
    if (mode === 'store' || mode === 'controller') {
      const [source, setSource] = createStore<
        Record<string, RecordData | undefined>
      >(Object.fromEntries(createRecords(size).map((row) => [row.id, row])))
      records = source
      patch = (id, changes) =>
        setSource((all) => {
          Object.assign(all[id]!, changes)
          all[id]!.revision = String(BigInt(all[id]!.revision) + 1n)
        })
      if (mode === 'controller')
        controller = createEditing({
          get: (id) => source[id],
          validate: validateEdits,
          commit: async (request) => {
            await Promise.resolve()
            return {
              status: 'saved',
              id: request.id,
              revision: String(BigInt(request.expectedRevision) + 1n),
            }
          },
          apply: (request, result) =>
            setSource((all) => {
              Object.assign(all[request.id]!, request.changes)
              all[request.id]!.revision = result.revision
            }),
        })
    } else {
      model = createModel(size, 'table')
      records = model.records
      controller = model.editing
      patch = model.patch
      // Consume the same model outputs before either presentation mounts.
      model.table.getRowIds()
      model.table.getVisibleColumns()
    }
    identity = records['R0001']
  }
  if (mode === 'read-only' || mode === 'editable')
    dispose = render(() => {
      setup()
      return <Table model={model!} readOnly={mode === 'read-only'} />
    }, host)
  else
    dispose = createRoot((end) => {
      setup()
      return end
    })
  flush()
  elapsedMs = performance.now() - started
  return read()
}
function read() {
  const row = records?.['R0001']
  return {
    mode,
    size,
    elapsedMs,
    identity: row === identity,
    first: row && { id: row.id, name: row.name, revision: row.revision },
    rowIds: model?.table.getRowIds().length ?? size,
    columns: model?.table.getVisibleColumns().map((column) => column.id) ?? [],
    counts: model && { ...model.counts },
    drafts: Object.keys(controller?.drafts ?? {}).length,
    active: controller?.active() ?? false,
    renderedRows: host.querySelectorAll('[data-row]').length,
    rowElements: host.querySelector('tbody')?.querySelectorAll('*').length ?? 0,
    elements: host.querySelectorAll('*').length,
    editors: host.querySelectorAll('[data-editor]').length,
    editButtons: host.querySelectorAll('[data-edit]').length,
    values: Array.from(
      host
        .querySelector('[data-row="R0001"]')
        ?.querySelectorAll('[data-column]') ?? [],
    ).map((node) => node.textContent.trim()),
  }
}
function update() {
  const started = performance.now()
  for (let index = 0; index < 12; index++) {
    patch!('R0001', { name: `Updated ${index}` })
    flush()
  }
  elapsedMs = performance.now() - started
  return read()
}
function drafts(count: number) {
  const started = performance.now()
  for (let index = 0; index < count; index++) {
    const id = `R${String(index + 1).padStart(4, '0')}`
    controller!.begin(id)
    flush()
    controller!.change(id, 'name', `Draft ${index}`)
    flush()
  }
  elapsedMs = performance.now() - started
  return read()
}
function cancel() {
  const started = performance.now()
  for (const id of Object.keys(controller!.drafts)) controller!.cancel(id)
  flush()
  elapsedMs = performance.now() - started
  return read()
}
function cycles() {
  const started = performance.now()
  for (let index = 0; index < 20; index++) {
    controller!.begin('R0001')
    flush()
    controller!.change('R0001', 'name', `Cycle ${index}`)
    flush()
    controller!.cancel('R0001')
    flush()
  }
  elapsedMs = performance.now() - started
  return read()
}
async function save() {
  controller!.begin('R0001')
  flush()
  controller!.change('R0001', 'name', 'Saved name')
  flush()
  const saved = await controller!.save('R0001')
  flush()
  return { saved, ...read() }
}
const api = { start, read, update, drafts, cancel, cycles, save, stop }
window.editingOverhead = api

declare global {
  interface Window {
    editingOverhead: typeof api
  }
}
