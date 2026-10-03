import { For, Show, createSignal, flush, onSettled, untrack } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { Table } from './Table'
import { TableOptions } from './TableOptions'
import { createModel } from './model'
import { createSubTables } from './createSubTables'
import { createChildLoader } from './childLoader'
import type { SaveMode, TableControls } from './Table'
import type { EditingModel } from './model'
import type { ChildLoad, SubTables } from './createSubTables'

const defaultControls: TableControls = {
  filters: 'external',
  headerSorting: true,
  globalSearch: true,
  grouping: true,
  columnResizing: true,
  columnReordering: true,
  resizeBehavior: 'grow',
}

function ChildTable(props: { children: SubTables; parentId: string }) {
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
        {(model) => (
          <Table
            model={model}
            title={`Sub-table for ${props.parentId}`}
            scope={props.parentId}
            controls={defaultControls}
          />
        )}
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
  ready: (
    model: EditingModel,
    configure: (value: Partial<TableControls>) => void,
    children: SubTables,
    changeScope: (value: string, force?: boolean) => boolean,
  ) => void
}) {
  const model = createModel(
    untrack(() => props.size),
    untrack(() => props.saveMode ?? 'row'),
  )
  const [controls, setControls] = createSignal(defaultControls)
  const [scope, setScope] = createSignal('current')
  const [scopeNotice, setScopeNotice] = createSignal('')
  const defaultLoader = createChildLoader()
  const children = createSubTables({
    ids: model.table.getSourceIds,
    scope,
    load: (request) => (props.loadChildren ?? defaultLoader.load)(request),
  })
  function changeScope(value: string, force = false) {
    if (value === scope()) return true
    if (!force && children.entries().some((entry) => entry.draftCount())) {
      setScopeNotice(
        'Save or cancel the sub-table drafts before changing the dataset.',
      )
      return false
    }
    setScopeNotice('')
    setScope(value)
    return true
  }
  const configure = (value: Partial<TableControls>) =>
    setControls((previous) => ({ ...previous, ...value }))
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
        controls={controls()}
        ready={() => props.ready(model, configure, children, changeScope)}
        details={{
          expanded: (id) => children.get(id)?.expanded() ?? false,
          draftCount: (id) => children.get(id)?.draftCount() ?? 0,
          toggle: children.toggle,
          render: (id) => <ChildTable parentId={id} children={children} />,
        }}
        settings={
          <>
            <TableOptions controls={controls()} configure={configure} />
            <Show when={!model.isGrouped()}>
              <label class="child-dataset">
                Sub-table dataset
                <select
                  value={scope()}
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
                edits. Collapse keeps sub-table drafts.
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
