import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
} from 'solid-js'
import { createKeyedVirtualizer } from '../../../../examples/solid/_shared/createKeyedVirtualizer'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { cellText } from './.input/runtime'
import { get as getWidget } from './.input/widget'
import definition from './.input/definition.json'
import { createWamnTable } from './createWamnTable'
import type { CellType, Transport } from './.input/runtime'
import type { JSX } from '@solidjs/web'
import './style.css'

function Button(props: {
  children: JSX.Element
  click: () => unknown
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      aria-label={props.label}
      disabled={props.disabled}
      ref={nativeEvents({
        click: () => {
          void props.click()
        },
      })}
    >
      {props.children}
    </button>
  )
}
export function App(props: {
  transport: Transport
  ready: (value: FixtureController) => void
}) {
  const model = createWamnTable(props.transport)
  const { table } = model
  let viewport!: HTMLDivElement
  let disposed = false
  onCleanup(() => {
    disposed = true
  })
  const virtualizer = createKeyedVirtualizer({
    get keys() {
      return table.getRowIds()
    },
    getScrollElement: () => viewport,
    estimateSize: () => 44,
    overscan: 4,
    scrollMargin: 44,
  })
  const counts = { mounted: 0, unmounted: 0, cells: 0, maxLive: 0 }
  const [action, setAction] = createSignal('')
  const width = createMemo(
    () =>
      table
        .getVisibleColumns()
        .reduce((sum, column) => sum + column.getSize(), 0) + 280,
  )
  const Row = (rowProps: { id: string }) => {
    const id = rowProps.id
    const row = table.createRowView(id)
    counts.mounted++
    counts.maxLive = Math.max(counts.maxLive, counts.mounted - counts.unmounted)
    let element!: HTMLDivElement
    virtualizer.observeRow(() => element, id)
    onCleanup(() => {
      counts.unmounted++
      if (element.contains(document.activeElement))
        viewport.focus({ preventScroll: true })
    })
    return (
      <div
        ref={element}
        class="row"
        role="row"
        data-row={id}
        aria-selected={row.getIsSelected() ? 'true' : 'false'}
        aria-rowindex={(virtualizer.getItem(id)?.index ?? 0) + 2}
      >
        <For each={row.getVisibleCells()}>
          {(cell) => {
            counts.cells++
            const meta = definition.columns.find(
              (column) => column.id === cell.column.id,
            )!
            return (
              <div
                role="gridcell"
                data-column={cell.column.id}
                style={{ width: `${cell.column.getSize()}px` }}
              >
                <Show
                  when={cell.column.id === 'note' && model.drafts[id]}
                  fallback={
                    cell.column.id === 'makerId'
                      ? (model.labels[String(cell.getValue())] ??
                        cellText(cell.getValue(), meta.type as CellType))
                      : cellText(cell.getValue(), meta.type as CellType)
                  }
                >
                  <input
                    aria-label={`Note ${id}`}
                    value={model.drafts[id]?.note ?? ''}
                    disabled={model.drafts[id]?.busy}
                    ref={nativeEvents<HTMLInputElement>({
                      input: (event) =>
                        model.edit(id, { note: event.currentTarget.value }),
                    })}
                  />
                </Show>
              </div>
            )
          }}
        </For>
        <div role="gridcell" class="actions">
          <input
            type="checkbox"
            aria-label={`Select ${id}`}
            checked={row.getIsSelected()}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                row.toggleSelected(event.currentTarget.checked),
            })}
          />
          <Show
            when={model.drafts[id]}
            fallback={
              <Button
                label={`Edit ${id}`}
                disabled={model.page().busy}
                click={() => model.edit(id, {})}
              >
                Edit
              </Button>
            }
          >
            <Button
              label={`Save ${id}`}
              disabled={model.drafts[id]?.busy}
              click={() => model.save(id)}
            >
              Save
            </Button>
            <Button
              label={`Discard ${id}`}
              disabled={model.drafts[id]?.busy}
              click={() => model.discard(id)}
            >
              Discard
            </Button>
          </Show>
          <Button
            label={`Open ${id}`}
            click={async () => {
              const result = await getWidget(props.transport, [{ id }])
              if (!disposed)
                setAction(
                  result.status === 'completed'
                    ? `Opened ${result.value.id}`
                    : result.status,
                )
            }}
          >
            Open
          </Button>
          <Button
            label={`Prepare form ${id}`}
            click={() =>
              setAction(
                JSON.stringify({
                  operation: definition.rowForms[0]!.operation,
                  pairs: definition.rowForms[0]!.pairs.map(([field, input]) => [
                    input,
                    row.original![field as keyof typeof row.original],
                  ]),
                }),
              )
            }
          >
            Form
          </Button>
        </div>
      </div>
    )
  }
  onSettled(() => props.ready({ model, virtualizer, viewport, counts }))
  return (
    <main>
      <h1>Find widgets</h1>
      <p>WAMN integration fixture</p>
      <div class="toolbar">
        <Button click={() => model.read()}>Read</Button>
        <Button click={() => model.read()}>Refresh</Button>
        <Button
          disabled={
            model.load.mode !== 'browse' ||
            model.page().busy ||
            model.page().cursor === null ||
            model.page().rows.length >= model.load.cap
          }
          click={() => model.read(true)}
        >
          Next page
        </Button>
        <label>
          Mode{' '}
          <select
            value={model.load.mode}
            ref={nativeEvents<HTMLSelectElement>({
              change: (event) =>
                model.configure({
                  mode: event.currentTarget.value as 'load' | 'browse',
                }),
            })}
          >
            <option value="load">Load</option>
            <option value="browse">Browse</option>
          </select>
        </label>
        <label>
          Cap{' '}
          <input
            type="number"
            min="1"
            value={model.load.cap}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                model.configure({ cap: Number(event.currentTarget.value) }),
            })}
          />
        </label>
        <label>
          Scope code{' '}
          <input
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                model.configure({ code: event.currentTarget.value }),
            })}
          />
        </label>
        <label>
          Refine note{' '}
          <input
            disabled={!model.local()}
            ref={nativeEvents<HTMLInputElement>({
              input: (event) =>
                table.setColumnFilters(
                  event.currentTarget.value
                    ? [{ id: 'note', value: event.currentTarget.value }]
                    : [],
                ),
            })}
          />
        </label>
        <Button
          disabled={!model.local()}
          click={() =>
            table.setSorting(
              table.state.sorting.length ? [] : [{ id: 'note', desc: true }],
            )
          }
        >
          Sort note
        </Button>
      </div>
      <p role="status">
        {model.page().busy
          ? 'Loading'
          : (model.page().refusal ??
            (model.load.fullyRead
              ? 'Complete set'
              : model.page().cursor
                ? 'Full dataset cannot be loaded'
                : 'Ready'))}{' '}
        · {model.page().rows.length} loaded · Total:{' '}
        {String(table.getTotalValue('id') ?? 'unavailable')}
      </p>
      <p role="alert">{model.load.message}</p>
      <For each={Object.keys(model.drafts)}>
        {(id) => <p data-draft={id}>{model.drafts[id]?.message}</p>}
      </For>
      <p data-action>{action()}</p>
      <div
        class="viewport"
        ref={viewport}
        tabindex="0"
        role="grid"
        aria-label="Widgets"
        aria-rowcount={table.getRowIds().length + 1}
      >
        <div style={{ width: `${width()}px` }}>
          <div role="row" class="row header">
            <For each={table.getVisibleColumns()}>
              {(column) => (
                <div
                  role="columnheader"
                  style={{ width: `${column.getSize()}px` }}
                >
                  {String(column.columnDef?.header)}
                </div>
              )}
            </For>
            <div role="columnheader" class="actions">
              Actions
            </div>
          </div>
          <div
            class="spacer"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            <div
              class="window"
              style={{ transform: `translateY(${virtualizer.getStart()}px)` }}
            >
              <For each={virtualizer.getKeys()}>{(id) => <Row id={id} />}</For>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
export interface FixtureController {
  model: ReturnType<typeof createWamnTable>
  virtualizer: ReturnType<typeof createKeyedVirtualizer>
  viewport: HTMLDivElement
  counts: { mounted: number; unmounted: number; cells: number; maxLive: number }
}
