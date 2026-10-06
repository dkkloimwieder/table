import { createMemo, createSignal, onCleanup } from 'solid-js'
import { FlexRender, createTable, tableFeatures } from '@tanstack/solid-table'
import { createTable as createNativeTable } from '@tanstack/solid-table/native'

export const lifecycle = {
  reads: 0,
  cleanups: 0,
  rename: (_value: string) => {},
}

export default function App() {
  const [name, setName] = createSignal('Ada')
  lifecycle.rename = setName
  onCleanup(() => lifecycle.cleanups++)
  const record = {
    get name() {
      lifecycle.reads++
      return name()
    },
  }
  const table = createNativeTable({
    source: { ids: () => ['a'], get: () => record },
    columns: [{ id: 'name', accessorKey: 'name' }],
  })
  const cell = table.createRowView('a').getVisibleCells()[0]!
  const data = createMemo(() => [{ name: name() }])
  const adapter = createTable({
    features: tableFeatures({}),
    columns: [{ accessorKey: 'name' }],
    get data() {
      return data()
    },
  })
  return (
    <>
      <table>
        <tbody>
          <tr>
            <td id="name">{cell.getValue()}</td>
            <td id="adapter">
              <FlexRender
                cell={adapter.getRowModel().rows[0]!.getAllCells()[0]!}
              />
            </td>
          </tr>
        </tbody>
      </table>
      <button id="rename" onClick={() => setName('Grace')}>
        Rename
      </button>
    </>
  )
}
