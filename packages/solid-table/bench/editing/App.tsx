import { For, Show, createSignal, flush, onSettled, untrack } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { Table } from './Table'
import { TableOptions } from './TableOptions'
import { createModel } from './model'
import { createSubTables } from './createSubTables'
import { createChildLoader } from './childLoader'
import { createTableViews } from './createTableViews'
import { createMemoryViewStorage } from './viewStorage'
import { TableViews } from './TableViews'
import type { SaveMode, TableControls } from './Table'
import type { EditingModel } from './model'
import type { ChildLoad, SubTables } from './createSubTables'
import type { TableViews as Views } from './createTableViews'
import type { ViewStorage } from './viewStorage'
import type { Component } from 'solid-js'
import type { PriorityEditorProps } from './TablePriorityEditor'

const defaultControls: TableControls = {
  filters: 'external',
  headerSorting: true,
  globalSearch: true,
  grouping: true,
  columnResizing: true,
  columnReordering: true,
  resizeBehavior: 'grow',
}

type ViewBinding = { views: Views; controls: () => TableControls }

function ChildTable(props: {
  children: SubTables
  parentId: string
  viewFor: (model: EditingModel) => ViewBinding
  priorityEditor?: Component<PriorityEditorProps>
}) {
  const entry = untrack(() => props.children.get(props.parentId)!)
  const readyModel = () => {
    const state = entry.state()
    return state.status === 'ready' ? state.model : undefined
  }
  return (
    <div class="sub-table" data-subtable={props.parentId}>
      <Show when={entry.state().status === 'loading'}>
        <p role="status">Loading sub-table for {props.parentId}…</p>
      </Show>
      <Show when={entry.state().status === 'error'}>
        <p role="alert">
          {(() => {
            const state = entry.state()
            return state.status === 'error' ? state.message : ''
          })()}
        </p>
        <button ref={nativeEvents({ click: entry.load })}>
          Retry sub-table
        </button>
      </Show>
      <Show when={readyModel()} keyed>
        {(model) => {
          const binding = props.viewFor(model)
          return (
            <Table
              model={model}
              priorityEditor={props.priorityEditor}
              title={`Sub-table for ${props.parentId}`}
              scope={props.parentId}
              controls={binding.controls()}
              settings={
                <TableViews views={binding.views} locked={model.locked()} />
              }
            />
          )
        }}
      </Show>
    </div>
  )
}

export function App(props: {
  size: number
  saveMode?: SaveMode
  loadChildren?: (
    request: ChildLoad,
  ) => ReturnType<Parameters<typeof createSubTables>[0]['load']>
  viewStorage?: ViewStorage
  priorityEditor?: Component<PriorityEditorProps>
  ready: (
    model: EditingModel,
    configure: (value: Partial<TableControls>) => void,
    children: SubTables,
    changeScope: (value: string, force?: boolean) => boolean,
    views: Views,
    viewFor: (model: EditingModel) => ViewBinding,
  ) => void
}) {
  const model = createModel(
    untrack(() => props.size),
    untrack(() => props.saveMode ?? 'row'),
  )
  const [controls, setControls] = createSignal(defaultControls)
  const [scope, setScope] = createSignal('current')
  const [scopeNotice, setScopeNotice] = createSignal('')
  const storage = untrack(() => props.viewStorage) ?? createMemoryViewStorage()
  const configure = (value: Partial<TableControls>) => {
    if (!model.locked()) setControls((previous) => ({ ...previous, ...value }))
  }
  const views = createTableViews({
    model,
    scope: 'root',
    storage,
    controls,
    configure,
  })
  const childViews = new WeakMap<EditingModel, ViewBinding>()
  const viewFor = (model: EditingModel) => childViews.get(model)!
  const defaultLoader = createChildLoader()
  const children = createSubTables({
    ids: model.table.getSourceIds,
    locked: model.locked,
    onEditingChange: model.setDescendantEditing,
    scope,
    load: (request) => (props.loadChildren ?? defaultLoader.load)(request),
    ready: (model, scope, parentId) => {
      const [controls, setControls] = createSignal(defaultControls)
      // A child model owns its controller, so collapse only removes the UI.
      const views = createTableViews({
        model,
        scope: JSON.stringify(['child', scope, parentId]),
        storage,
        controls,
        configure: (value) => {
          if (!model.locked()) setControls(value)
        },
      })
      childViews.set(model, { views, controls })
    },
  })
  function changeScope(value: string, _force = false) {
    if (value === scope()) return true
    if (model.locked()) {
      setScopeNotice('Save or cancel edits before changing the dataset.')
      return false
    }
    setScopeNotice('')
    setScope(value)
    return true
  }
  function revealChild(id: string) {
    model.table.setColumnFilters([])
    model.table.setGlobalFilter('')
    flush()
    model.revealRecord(id)
    children.open(id)
    onSettled(() =>
      document
        .querySelector<HTMLButtonElement>(`[data-subtable-toggle="${id}"]`)
        ?.focus(),
    )
  }
  return (
    <main>
      <h1>Table</h1>
      <Table
        model={model}
        priorityEditor={props.priorityEditor}
        controls={controls()}
        ready={() =>
          props.ready(model, configure, children, changeScope, views, viewFor)
        }
        details={{
          expanded: (id) => children.get(id)?.expanded() ?? false,
          draftCount: (id) => children.get(id)?.draftCount() ?? 0,
          toggle: children.toggle,
          render: (id) => (
            <ChildTable
              parentId={id}
              children={children}
              viewFor={viewFor}
              priorityEditor={props.priorityEditor}
            />
          ),
        }}
        settings={
          <>
            <TableViews views={views} locked={model.locked()} />
            <TableOptions
              controls={controls()}
              configure={configure}
              disabled={model.locked()}
            />
            <Show when={!model.isGrouped()}>
              <label class="child-dataset">
                Sub-table dataset
                <select
                  value={scope()}
                  disabled={model.locked()}
                  ref={nativeEvents<HTMLSelectElement>({
                    change: (event) => {
                      if (!changeScope(event.currentTarget.value))
                        event.currentTarget.value = scope()
                    },
                  })}
                >
                  <option value="current">Current period</option>
                  <option value="previous">Previous period</option>
                </select>
              </label>
              <p class="column-layout">
                Expand a row to load its sub-table. Each table saves its own
                edits. Save or cancel edits before collapsing a sub-table.
              </p>
              <For each={children.entries()}>
                {(entry) => (
                  <Show when={entry.draftCount()}>
                    <aside class="child-drafts">
                      Sub-table for {entry.parentId}: {entry.draftCount()}{' '}
                      drafts.{' '}
                      <button
                        ref={nativeEvents({
                          click: () => revealChild(entry.parentId),
                        })}
                      >
                        Show sub-table {entry.parentId}
                      </button>
                    </aside>
                  </Show>
                )}
              </For>
            </Show>
            <p role="alert">{scopeNotice() || children.notice()}</p>
          </>
        }
      />
    </main>
  )
}
