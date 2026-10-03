import { createSignal } from 'solid-js'
import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import { Table } from './Table'
import type { SaveMode, TableControls } from './Table'
import type { EditingModel } from './model'

export function App(props: {
  size: number
  saveMode?: SaveMode
  ready: (
    model: EditingModel,
    configure: (value: Partial<TableControls>) => void,
  ) => void
}) {
  const [controls, setControls] = createSignal<TableControls>({
    filters: 'external',
    headerSorting: true,
    globalSearch: true,
  })
  const configure = (value: Partial<TableControls>) =>
    setControls((previous) => ({ ...previous, ...value }))
  return (
    <Table
      size={props.size}
      saveMode={props.saveMode}
      controls={controls()}
      ready={(model) => props.ready(model, configure)}
      settings={
        <details class="display-options">
          <summary>Display options</summary>
          <div class="display-fields">
            <label>
              Column filter controls
              <select
                value={controls().filters}
                ref={nativeEvents<HTMLSelectElement>({
                  change: (event) =>
                    configure({
                      filters: event.currentTarget
                        .value as TableControls['filters'],
                    }),
                })}
              >
                <option value="external">Above the table</option>
                <option value="headers">In column headers</option>
                <option value="both">Both</option>
                <option value="none">Hidden</option>
              </select>
            </label>
            <label class="check-option">
              <input
                type="checkbox"
                checked={controls().headerSorting}
                ref={nativeEvents<HTMLInputElement>({
                  change: (event) =>
                    configure({ headerSorting: event.currentTarget.checked }),
                })}
              />
              Header sorting
            </label>
            <label class="check-option">
              <input
                type="checkbox"
                checked={controls().globalSearch}
                ref={nativeEvents<HTMLInputElement>({
                  change: (event) =>
                    configure({ globalSearch: event.currentTarget.checked }),
                })}
              />
              Global search
            </label>
          </div>
        </details>
      }
    />
  )
}
