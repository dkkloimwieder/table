import { render } from '@solidjs/web'
import { OBSERVE, action, flush, snapshot } from 'solid-js'
import {
  attribution,
  costs,
  graphSize,
  subscriptions,
} from 'solid-js/attribution'
import { App } from './App'
import { createChildLoader } from './childLoader'
import { createViewStorageFixture } from './viewStorageFixture'
import type { ViewStorageFixture } from './viewStorageFixture'
import type { TableViews } from './createTableViews'
import type { ChildLoader } from './childLoader'
import type { SubTables } from './createSubTables'
import type { SaveMode, TableControls } from './Table'
import type { EditingModel } from './model'
import type { Component } from 'solid-js'
import type { PriorityEditorProps } from './TablePriorityEditor'

let priorityEditor: Component<PriorityEditorProps> | undefined

const root = document.getElementById('root')!
let model: EditingModel | undefined
let children: SubTables | undefined
let childLoader: ChildLoader | undefined
let views: TableViews | undefined
let childViews: ((model: EditingModel) => { views: TableViews }) | undefined
let viewStorage: ViewStorageFixture | undefined
let lastViewStorageCounts: ViewStorageFixture['counts'] | undefined
let changeChildScope: ((value: string, force?: boolean) => boolean) | undefined
let lastChildCounts: SubTables['counts'] | undefined
let configureControls: ((value: Partial<TableControls>) => void) | undefined
let dispose: (() => void) | undefined
let remembered: WeakRef<object> | undefined
let rememberedId = ''
let capture:
  ReturnType<NonNullable<typeof OBSERVE>['diagnostics']['capture']> | undefined
const events: Array<unknown> = []
let lastCounts: EditingModel['counts'] | undefined
let releaseTrace: (() => void) | undefined
let unsubscribeTrace: (() => void) | undefined
let unsubscribeCreations: (() => void) | undefined
const traceRuns: Array<{ name: string; sources: Array<string> }> = []
// Same rc.13 disposal workaround as the qualified WAMN fixture (table-gd3.6.5).
// eslint-disable-next-line require-yield -- This synchronous action only disposes the root.
const disposeRoot = action(function* () {
  dispose?.()
})
function stop() {
  const counts = model?.counts
  const childCounts = children?.counts
  const viewCounts = viewStorage?.counts
  disposeRoot()
  lastCounts = counts && { ...counts }
  dispose = undefined
  model = undefined
  lastChildCounts = childCounts && { ...childCounts }
  children = undefined
  childLoader = undefined
  changeChildScope = undefined
  configureControls = undefined
  views = undefined
  childViews = undefined
  lastViewStorageCounts = viewCounts && { ...viewCounts }
  viewStorage = undefined
  remembered = undefined
  flush()
}
function start(size = 8, saveMode: SaveMode = 'row') {
  stop()
  events.push(...(capture?.stop() ?? []))
  capture = OBSERVE?.diagnostics.capture()
  dispose = render(() => {
    childLoader = createChildLoader()
    viewStorage = createViewStorageFixture()
    return (
      <App
        size={size}
        priorityEditor={priorityEditor}
        saveMode={saveMode}
        loadChildren={childLoader.load}
        viewStorage={viewStorage.storage}
        ready={(
          value,
          configure,
          registry,
          changeScope,
          rootViews,
          viewFor,
        ) => {
          children = registry
          changeChildScope = changeScope
          model = value
          configureControls = configure
          views = rootViews
          childViews = viewFor
        }}
      />
    )
  }, root)
  flush()
}
function readModel(model: EditingModel) {
  return {
    locked: model.locked(),
    sorting: snapshot(model.table.state.sorting),
    columnVisibility: snapshot(model.table.state.columnVisibility),
    saveMode: model.saveMode(),
    ids: model.table.getRowIds(),
    filters: snapshot(model.table.state.columnFilters),
    search: model.table.state.globalFilter,
    grouping: snapshot(model.table.state.grouping),
    groupSorting: snapshot(model.table.state.groupSorting),
    summaries: snapshot(model.summaries),
    columnSizing: snapshot(model.table.state.columnSizing),
    columnOrder: snapshot(model.table.state.columnOrder),
    visibleColumns: model.table.getVisibleColumns().map((column) => column.id),
    columnPinning: snapshot(model.table.state.columnPinning),
    widths: Object.fromEntries(
      model.table.getColumns().map((column) => [column.id, column.getSize()]),
    ),
    display: model.table
      .getDisplayKeys()
      .map((key) => model.table.getDisplayItem(key)),
    sample: model.table
      .getSourceIds()
      .slice(0, 8)
      .map((id) => ({ ...model.records[id] })),
    drafts: snapshot(model.editing.drafts),
    savingAll: model.editing.savingAll(),
    counts: { ...model.counts },
    sent: model.sent,
    identity: remembered
      ? remembered.deref() === model.records[rememberedId]
      : null,
  }
}
function childModel(id: string) {
  const state = children!.get(id)!.state()
  if (state.status !== 'ready') throw new Error('Sub-table is not ready')
  return state.model
}
function tableViews(parent?: string) {
  return parent ? childViews!(childModel(parent)).views : views!
}
const api = {
  start,
  stop,
  ready: () => Boolean(model),
  viewRead: (parent?: string) => {
    const value = tableViews(parent)
    return {
      views: value.views(),
      selected: value.selected(),
      busy: value.busy(),
      error: value.error(),
      message: value.message(),
      configuration: value.capture(),
    }
  },
  viewChoose: (id: string, parent?: string) => {
    const result = tableViews(parent).choose(id)
    flush()
    return result
  },
  viewSaveAs: (name: string, parent?: string) => {
    void tableViews(parent).saveAs(name)
    flush()
  },
  viewUpdate: (parent?: string) => {
    void tableViews(parent).update()
    flush()
  },
  viewRename: (name: string, parent?: string) => {
    void tableViews(parent).rename(name)
    flush()
  },
  viewRemove: (parent?: string) => {
    void tableViews(parent).remove()
    flush()
  },
  viewReload: (parent?: string) => {
    void tableViews(parent).reload()
    flush()
  },
  viewStorageFault: (value: Parameters<ViewStorageFixture['fault']>[0]) =>
    viewStorage!.fault(value),
  viewStorageReply: (value: unknown) => viewStorage!.reply(value),
  viewStorageRelease: () => viewStorage!.release(),
  viewStorageRead: () =>
    viewStorage
      ? {
          ...viewStorage.counts,
          pending: viewStorage.pending(),
          lastSaved: viewStorage.lastSaved(),
        }
      : lastViewStorageCounts,
  traceStart: () => {
    releaseTrace?.()
    unsubscribeTrace?.()
    unsubscribeCreations?.()
    traceRuns.length = 0
    releaseTrace = attribution.enable({ log: false })
    unsubscribeTrace = OBSERVE?.records.subscribe('rerun', (event, node) => {
      traceRuns.push({ name: event.nodeName, sources: subscriptions(node) })
    })
    unsubscribeCreations = OBSERVE?.records.subscribe(
      'create',
      (event, node) => {
        traceRuns.push({ name: event.nodeName, sources: subscriptions(node) })
      },
    )
  },
  traceRead: () => ({
    runs: traceRuns.slice(),
    costs: costs(),
    graph: graphSize(),
  }),
  traceStop: () => {
    releaseTrace?.()
    unsubscribeTrace?.()
    unsubscribeCreations?.()
    releaseTrace = undefined
    unsubscribeTrace = undefined
    unsubscribeCreations = undefined
    traceRuns.length = 0
  },
  read: () => readModel(model!),
  draft: (id: string, value: string) => {
    model!.editing.begin(id)
    flush()
    model!.editing.change(id, 'name', value)
    flush()
  },
  cancelDraft: (id: string) => {
    model!.editing.cancel(id)
    flush()
  },
  childPatch: (
    parent: string,
    id: string,
    value: Parameters<EditingModel['patch']>[1],
  ) => {
    childModel(parent).patch(id, value)
    flush()
  },
  childStatus: (id: string) => children!.get(id)?.state().status,
  childRead: (id: string) => {
    const entry = children!.get(id)
    if (!entry) return undefined
    const state = entry.state()
    return {
      scope: entry.scope,
      expanded: entry.expanded(),
      status: state.status,
      model: state.status === 'ready' ? readModel(state.model) : undefined,
    }
  },
  childCounts: () =>
    children
      ? { ...children.counts, entries: children.entries().length }
      : lastChildCounts,
  childLoadFault: (value: Parameters<ChildLoader['fault']>[0]) =>
    childLoader!.fault(value),
  childLoadRelease: () => childLoader!.release(),
  childFault: (id: string, value: Parameters<EditingModel['fault']>[0]) =>
    childModel(id).fault(value),
  childRelease: (id: string) => childModel(id).release(),
  childToggle: (id: string) => {
    children!.toggle(id)
    flush()
  },
  childScope: (value: string, force = false) => {
    const changed = changeChildScope!(value, force)
    flush()
    return changed
  },
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
  search: (value: string) => {
    model!.table.setGlobalFilter(value)
    flush()
  },
  filter: (id: string, value: string) => {
    model!.table.getColumn(id)!.setFilterValue(value || undefined)
    flush()
  },
  visibility: (id: string, visible: boolean) => {
    model!.table.getColumn(id)!.toggleVisibility(visible)
    flush()
  },
  sizing: (value: Record<string, number>) => {
    model!.table.setColumnSizing(value)
    flush()
  },
  order: (value: Array<string>) => {
    model!.setColumnOrder(value)
    flush()
  },
  pinning: (value: { start: Array<string>; end: Array<string> }) => {
    model!.table.setColumnPinning(value)
    flush()
  },
  controls: (value: Partial<TableControls>) => {
    configureControls!(value)
    flush()
  },
  localProcessing: (enabled: boolean) => {
    model!.setLocalProcessing(enabled)
    flush()
  },
  grouping: (ids: Array<string>) => {
    model!.configureGrouping(ids)
    flush()
  },
  summary: (id: string, value: Parameters<EditingModel['setSummary']>[1]) => {
    model!.setSummary(id, value)
    flush()
  },
  sorting: (value: Array<{ id: string; desc: boolean }>) => {
    model!.table.setSorting(value)
    flush()
  },
  expandGroups: (expanded: boolean, depth?: number) => {
    model!.table.toggleAllGroupsExpanded(expanded, depth)
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
export function mountEditingFixture(editor?: Component<PriorityEditorProps>) {
  priorityEditor = editor
  window.editingFixture = api
  const parameters = new URLSearchParams(location.search)
  start(
    Number(parameters.get('size')) || 8,
    parameters.get('save') === 'all' ? 'table' : 'row',
  )
  if (parameters.get('filters') === 'headers') {
    configureControls!({ filters: 'headers' })
    flush()
  }
}
