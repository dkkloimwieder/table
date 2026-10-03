import { nativeEvents } from '../../../../examples/solid/virtualized-rows/src/nativeEvents'
import type { TableControls } from './Table'

export function TableOptions(props: {
  disabled?: boolean
  controls: TableControls
  configure: (value: Partial<TableControls>) => void
}) {
  return (
    <details class="display-options">
      <summary>Display options</summary>
      <fieldset class="display-fields" disabled={props.disabled}>
        <label>
          Column filter controls
          <select
            value={props.controls.filters}
            ref={nativeEvents<HTMLSelectElement>({
              change: (event) =>
                props.configure({
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
            checked={props.controls.headerSorting}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                props.configure({ headerSorting: event.currentTarget.checked }),
            })}
          />
          Header sorting
        </label>
        <label class="check-option">
          <input
            type="checkbox"
            checked={props.controls.globalSearch}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                props.configure({ globalSearch: event.currentTarget.checked }),
            })}
          />
          Global search
        </label>
        <label class="check-option">
          <input
            type="checkbox"
            checked={props.controls.grouping}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                props.configure({ grouping: event.currentTarget.checked }),
            })}
          />
          Grouping controls
        </label>
        <label class="check-option">
          <input
            type="checkbox"
            checked={props.controls.columnResizing}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                props.configure({
                  columnResizing: event.currentTarget.checked,
                }),
            })}
          />
          Column resizing
        </label>
        <label>
          Resize behavior
          <select
            value={props.controls.resizeBehavior}
            ref={nativeEvents<HTMLSelectElement>({
              change: (event) =>
                props.configure({
                  resizeBehavior: event.currentTarget
                    .value as TableControls['resizeBehavior'],
                }),
            })}
          >
            <option value="grow">Grow table</option>
            <option value="fixed">Keep table width</option>
          </select>
        </label>
        <label class="check-option">
          <input
            type="checkbox"
            checked={props.controls.columnReordering}
            ref={nativeEvents<HTMLInputElement>({
              change: (event) =>
                props.configure({
                  columnReordering: event.currentTarget.checked,
                }),
            })}
          />
          Column rearrangement
        </label>
      </fieldset>
    </details>
  )
}
