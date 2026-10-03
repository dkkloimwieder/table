import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  createMemo,
  createProjection,
  createRoot,
  createSignal,
  deep,
  flush,
} from 'solid-js'
import { createAtom } from '@tanstack/store'
import { rowPaginationFeature, tableFeatures } from '@tanstack/table-core'
import { createTable } from '../../src/createTable'
import { createTableHook } from '../../src/createTableHook'

afterEach(cleanup)

const features = tableFeatures({ rowPaginationFeature })

test('default cells render new data through a persistent component', () => {
  let replaceData!: () => void
  function Harness() {
    const [data, setData] = createSignal([{ name: 'Ada' }])
    const table = createTable({
      features,
      columns: [{ accessorKey: 'name' }],
      get data() {
        return data()
      },
    })
    replaceData = () => setData([{ name: 'Grace' }])
    return (
      <output>
        <table.FlexRender
          cell={table.getRowModel().rows[0]!.getAllCells()[0]!}
        />
      </output>
    )
  }
  render(() => <Harness />)
  expect(screen.getByRole('status').textContent).toBe('Ada')
  replaceData()
  flush()
  expect(screen.getByRole('status').textContent).toBe('Grace')
})

test('Subscribe tracks a plain child result after a batched write', () => {
  let update!: () => void
  function Harness() {
    const table = createTable({ features, columns: [], data: [] })
    update = () => {
      table.setPageSize(15)
      table.setPageSize(25)
    }
    return (
      <output>
        <table.Subscribe>
          {(atoms) => String(atoms.pagination.get().pageSize)}
        </table.Subscribe>
      </output>
    )
  }
  render(() => <Harness />)
  update()
  flush()
  expect(screen.getByRole('status').textContent).toBe('25')
})

test('disposing before the first settle releases external subscriptions', () => {
  const atom = createAtom({ pageIndex: 0, pageSize: 10 })
  let table!: ReturnType<typeof createTable<typeof features, never>>
  createRoot((dispose) => {
    table = createTable({
      features,
      columns: [],
      data: [],
      atoms: { pagination: atom },
    })
    dispose()
  })
  atom.set({ pageIndex: 0, pageSize: 20 })
  flush()
  expect(table.atoms.pagination.get().pageSize).toBe(10)
})

test('column renderers receive registered cell components', () => {
  function Label() {
    return <>registered cell</>
  }
  const hook = createTableHook({ features, cellComponents: { Label } })
  const columnHelper = hook.createAppColumnHelper<{ name: string }>()
  function Harness() {
    const table = hook.createAppTable({
      columns: [
        columnHelper.display({
          id: 'name',
          cell: (props) => <props.cell.Label />,
        }),
      ],
      data: [{ name: 'Ada' }],
    })
    return (
      <table.AppTable>
        <table.AppCell cell={table.getRowModel().rows[0]!.getAllCells()[0]!}>
          {(cell) => (
            <output>
              <cell.FlexRender />
            </output>
          )}
        </table.AppCell>
      </table.AppTable>
    )
  }
  render(() => <Harness />)
  expect(screen.getByRole('status').textContent).toBe('registered cell')
})

test('native store data updates refresh cached values and retain unchanged records', () => {
  const initial = [
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Grace' },
  ]
  const { dispose, setSource, data, table } = createRoot((dispose) => {
    const [source, setSource] = createSignal(initial)
    const projected = createProjection(() => source(), [], { key: 'id' })
    const data = createMemo(() => deep(projected))
    const table = createTable({
      features,
      columns: [{ accessorKey: 'name' }],
      get data() {
        return data()
      },
      getRowId: (row) => row.id,
    })
    return { dispose, setSource, data, table }
  })
  try {
    flush()
    const before = data()
    const beforeModel = table.getCoreRowModel()
    expect(beforeModel.rows[0]!.getValue('name')).toBe('Ada')
    expect(data()).toBe(before)
    const next = [{ id: 'a', name: 'Katherine' }, initial[1]!]
    setSource(next)
    flush()
    expect(data()).not.toBe(before)
    expect(data()[1]).toBe(before[1])
    expect(table.getCoreRowModel()).not.toBe(beforeModel)
    expect(table.getCoreRowModel().rows[0]!.getValue('name')).toBe('Katherine')
    const stable = data()
    expect(before[0]!.name).toBe('Ada')
    setSource(next)
    flush()
    expect(data()).toBe(stable)
  } finally {
    dispose()
  }
})
