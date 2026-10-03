import { render } from '@solidjs/web'
import { For, createSignal, createStore, flush, onCleanup } from 'solid-js'
import { createNativeTable } from './native-table'

type Item = {
  id: string
  region: string | null
  city: string
  amount: number
  unused: number
}
type Shape = 'nested' | 'unique' | 'off'
type Expected =
  | { kind: 'row'; id: string }
  | {
      kind: 'group'
      path: Array<{ columnId: string; value: string | null }>
      members: Array<Item>
    }
const record = (i: number): Item => ({
  id: `r${i}`,
  region: `region-${i % 20}`,
  city: `city-${Math.floor(i / 20) % 10}`,
  amount: i % 100,
  unused: 0,
})
const root = document.getElementById('root')!
let dispose: (() => void) | undefined
let run: (() => unknown) | undefined
let stats: (() => unknown) | undefined
let setShape: ((shape: Shape) => void) | undefined
function start(size: number) {
  dispose?.()
  const counts = {
    rows: 0,
    cells: 0,
    unmounts: 0,
    groupReads: 0,
    amountReads: 0,
    aggregates: 0,
    comparisons: 0,
  }
  dispose = render(() => {
    const initial = Array.from({ length: size }, (_, i) => record(i))
    const [records, setRecords] = createStore(
      Object.fromEntries(initial.map((row) => [row.id, row])),
    )
    const [ids, setIds] = createSignal(initial.map((row) => row.id))
    const [manual, setManual] = createSignal(false)
    const [startIndex, setStartIndex] = createSignal(0)
    const table = createNativeTable({
      source: { ids, get: (id) => records[id] },
      columns: [
        { id: 'id', accessorKey: 'id' },
        {
          id: 'region',
          accessorKey: 'region',
          getGroupingValue: (row) => {
            counts.groupReads++
            return row.region
          },
        },
        {
          id: 'city',
          accessorKey: 'city',
          getGroupingValue: (row) => {
            counts.groupReads++
            return row.city
          },
        },
        {
          id: 'amount',
          accessorFn: (row) => {
            counts.amountReads++
            return row.amount
          },
          aggregationFn: (values) => {
            counts.aggregates++
            let sum = 0
            for (const value of values) sum += Number(value)
            return sum
          },
          filterFn: (a, b) => Number(a) >= Number(b),
          sortFn: (a, b) => {
            counts.comparisons++
            return Number(a) - Number(b)
          },
        },
      ],
      get manualProcessing() {
        return manual()
      },
    })
    let shape: Shape = 'off'
    let threshold: number | undefined
    let leafSort = false
    let groupSort = false
    let server = false
    let expanded = new Set<string>()
    const pathId = (path: unknown) => JSON.stringify(path)
    function expected() {
      const input = ids()
        .map((id) => records[id]!)
        .filter(
          (row) => server || threshold === undefined || row.amount >= threshold,
        )
      if (server || shape === 'off')
        return (
          leafSort && !server
            ? [...input].sort((a, b) => b.amount - a.amount)
            : input
        ).map((row): Expected => ({ kind: 'row', id: row.id }))
      const fields =
        shape === 'unique' ? (['id'] as const) : (['region', 'city'] as const)
      const result: Array<Expected> = []
      function nest(
        members: Array<Item>,
        depth: number,
        path: Array<{ columnId: string; value: string | null }>,
      ) {
        const field = fields[depth]!
        const buckets = new Map<string | null, Array<Item>>()
        for (const row of members) {
          const key = row[field]
          if (!buckets.has(key)) buckets.set(key, [])
          buckets.get(key)!.push(row)
        }
        const entries = [...buckets]
        if (groupSort)
          entries.sort(
            (a, b) =>
              b[1].reduce((n, row) => n + row.amount, 0) -
              a[1].reduce((n, row) => n + row.amount, 0),
          )
        for (const [value, rows] of entries) {
          const next = [...path, { columnId: field, value }]
          result.push({ kind: 'group', path: next, members: rows })
          if (!expanded.has(pathId(next))) continue
          if (depth + 1 < fields.length) nest(rows, depth + 1, next)
          else
            for (const row of leafSort
              ? [...rows].sort((a, b) => b.amount - a.amount)
              : rows)
              result.push({ kind: 'row', id: row.id })
        }
      }
      nest(input, 0, [])
      return result
    }
    function inspect() {
      const wanted = expected()
      const keys = table.getDisplayKeys()
      if (keys.length !== wanted.length)
        throw new Error(`Display length ${keys.length} != ${wanted.length}`)
      keys.forEach((key, index) => {
        const actual = table.getDisplayItem(key)
        const item = wanted[index]!
        if (actual.kind !== item.kind) throw new Error('Display kind mismatch')
        if (
          actual.kind === 'row' &&
          item.kind === 'row' &&
          actual.id !== item.id
        )
          throw new Error('Record order mismatch')
        if (
          actual.kind === 'group' &&
          item.kind === 'group' &&
          pathId(table.getGroup(actual.key).path) !== pathId(item.path)
        )
          throw new Error('Group path mismatch')
      })
      const visible = wanted.slice(startIndex(), startIndex() + 40)
      const elements = Array.from(root.querySelectorAll('[data-key]'))
      if (elements.length !== visible.length)
        throw new Error('Visible count mismatch')
      elements.forEach((element, index) => {
        const item = visible[index]!
        const values =
          item.kind === 'row'
            ? ['id', 'region', 'city', 'amount'].map((field) =>
                String(records[item.id]![field as keyof Item]),
              )
            : ['id', 'region', 'city', 'amount'].map((field) => {
                const part = item.path.find((entry) => entry.columnId === field)
                return String(
                  part
                    ? part.value
                    : field === 'amount'
                      ? item.members.reduce((sum, row) => sum + row.amount, 0)
                      : undefined,
                )
              })
        if (
          JSON.stringify(
            Array.from(
              element.querySelectorAll('span'),
              (cell) => cell.textContent,
            ),
          ) !== JSON.stringify(values)
        )
          throw new Error('Visible values mismatch')
      })
      return { display: keys.length, visible: elements.length }
    }
    const expand = (value: boolean, depth?: number) => {
      // Keep expected expansion as raw paths, independent of encoded keys.
      const visit = (keys: ReadonlyArray<string>) => {
        for (const key of keys) {
          const group = table.getGroup(key)
          if (depth === undefined || group.depth === depth) {
            if (value) expanded.add(pathId(group.path))
            else expanded.delete(pathId(group.path))
          }
          visit(group.getChildGroupKeys())
        }
      }
      visit(table.getRootGroupKeys())
      table.toggleAllGroupsExpanded(value, depth)
    }
    setShape = (next) => {
      shape = next
      expanded = new Set()
      table.setGroupExpanded({})
      table.setGrouping(
        next === 'nested'
          ? ['region', 'city']
          : next === 'unique'
            ? ['id']
            : [],
      )
      setStartIndex(0)
    }
    run = () => {
      const steps: Array<{
        name: string
        milliseconds: number
        counts: typeof counts
        result: ReturnType<typeof inspect>
      }> = []
      const step = (name: string, write: () => void) => {
        const before = { ...counts }
        const began = performance.now()
        write()
        flush()
        const elapsed = performance.now() - began
        const delta = Object.fromEntries(
          Object.entries(counts).map(([key, value]) => [
            key,
            value - before[key as keyof typeof counts],
          ]),
        ) as typeof counts
        const result = inspect()
        steps.push({ name, milliseconds: elapsed, counts: delta, result })
      }
      step('group', () => setShape!('nested'))
      step('expandAll', () => expand(true))
      step('amountEdit', () =>
        setRecords((draft) => {
          draft.r0!.amount = 200
        }),
      )
      step('moveGroup', () =>
        setRecords((draft) => {
          draft.r0!.region = 'region-1'
        }),
      )
      step('unrelated', () =>
        setRecords((draft) => {
          draft.r0!.unused++
        }),
      )
      step('collapseLevel', () => expand(false, 0))
      step('expandLevel', () => expand(true, 0))
      step('filter', () => {
        threshold = 30
        table.setColumnFilters([{ id: 'amount', value: 30 }])
      })
      step('refresh', () =>
        setRecords((draft) => {
          draft.r1 = { ...draft.r1!, amount: 300 }
        }),
      )
      step('remove', () => {
        setIds((old) => old.filter((id) => id !== 'r0'))
        setRecords((draft) => {
          delete draft.r0
        })
      })
      step('append', () => {
        setRecords((draft) => {
          draft.new = {
            id: 'new',
            region: 'region-2',
            city: 'city-2',
            amount: 400,
            unused: 0,
          }
        })
        setIds((old) => [...old, 'new'])
      })
      step('nullGroup', () =>
        setRecords((draft) => {
          draft.new!.region = null
        }),
      )
      step('sortLeaves', () => {
        leafSort = true
        table.setSorting([{ id: 'amount', desc: true }])
      })
      step('sortGroups', () => {
        groupSort = true
        table.setGroupSorting([
          { depth: 0, id: 'amount', desc: true },
          { depth: 1, id: 'amount', desc: true },
        ])
      })
      step('manual', () => {
        server = true
        setManual(true)
      })
      step('local', () => {
        server = false
        setManual(false)
      })
      step('scroll', () => setStartIndex(100))
      step('reset', () => {
        threshold = undefined
        leafSort = false
        groupSort = false
        table.setColumnFilters([])
        table.setSorting([])
        table.setGroupSorting([])
        setShape!('nested')
      })
      return { steps }
    }
    stats = () => ({ ...counts })
    return (
      <For each={table.getDisplayKeys().slice(startIndex(), startIndex() + 40)}>
        {(key) => {
          const item = table.getDisplayItem(key)
          const view =
            item.kind === 'row'
              ? table.createRowView(item.id)
              : table.createGroupView(item.key)
          counts.rows++
          onCleanup(() => {
            counts.unmounts++
          })
          return (
            <div data-key={key}>
              <For each={view.getVisibleCells()}>
                {(cell) => {
                  counts.cells++
                  return <span>{String(cell.getValue())}</span>
                }}
              </For>
            </div>
          )
        }}
      </For>
    )
  }, root)
  flush()
  return { ...counts }
}
declare global {
  interface Window {
    nativeGrouping: {
      start: typeof start
      run: () => unknown
      shape: (shape: Shape) => void
      dispose: () => unknown
    }
  }
}
window.nativeGrouping = {
  start,
  run: () => run!(),
  shape: (shape) => {
    setShape!(shape)
    flush()
  },
  dispose: () => {
    dispose?.()
    flush()
    const final = stats?.()
    dispose = undefined
    run = undefined
    stats = undefined
    setShape = undefined
    return final
  },
}
