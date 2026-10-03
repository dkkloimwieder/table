import { render } from '@solidjs/web'
import {
  For,
  Show,
  createSignal,
  createStore,
  flush,
  onCleanup,
} from 'solid-js'
import { createNativeTable } from './native-table'

type Item = {
  id: string
  name: string
  score: number
  color: string
  tags: Array<string>
  unused: number
}
const record = (i: number): Item => ({
  id: `r${i}`,
  name: `Person ${i}`,
  score: i % 100,
  color: ['red', 'blue', 'green'][i % 3]!,
  tags: [`tag-${i % 4}`],
  unused: 0,
})
const root = document.getElementById('root')!
let dispose: (() => void) | undefined
let run: (() => unknown) | undefined
let stats: (() => unknown) | undefined
let showFacets: ((open: boolean) => void) | undefined

function start(size: number) {
  dispose?.()
  const counts = {
    rows: 0,
    cells: 0,
    unmounts: 0,
    accessors: 0,
    filters: 0,
    comparisons: 0,
    unique: 0,
  }
  dispose = render(() => {
    const initial = Array.from({ length: size }, (_, i) => record(i))
    const [records, setRecords] = createStore(
      Object.fromEntries(initial.map((row) => [row.id, row])),
    )
    const [ids, setIds] = createSignal(initial.map((row) => row.id))
    const [facetsOpen, setFacetsOpen] = createSignal(false)
    showFacets = setFacetsOpen
    const [manual, setManual] = createSignal(false)
    const read = (key: keyof Item) => (item: Item) => {
      counts.accessors++
      return item[key]
    }
    const table = createNativeTable({
      source: { ids, get: (id) => records[id] },
      columns: [
        { id: 'name', accessorFn: read('name') },
        {
          id: 'score',
          accessorFn: read('score'),
          filterFn: (a, b) => {
            counts.filters++
            return Number(a) >= Number(b)
          },
          sortFn: (a, b) => {
            counts.comparisons++
            return Number(a) - Number(b)
          },
        },
        { id: 'color', accessorFn: read('color') },
        {
          id: 'tags',
          accessorFn: read('tags'),
          enableGlobalFilter: false,
          getUniqueValues: (item) => {
            counts.unique++
            return item.tags
          },
        },
      ],
      get manualFiltering() {
        return manual()
      },
      get manualSorting() {
        return manual()
      },
    })
    let threshold: number | undefined
    let query = ''
    let hidden = false
    let descending = false
    let serverOwned = false
    function assert(condition: unknown, message: string): asserts condition {
      if (!condition) throw new Error(message)
    }
    function inspect() {
      const data = ids().map((id) => records[id]!)
      const matchesSearch = (row: Item) =>
        !query ||
        [hidden ? '' : row.name, String(row.score), row.color].some((value) =>
          value.toLowerCase().includes(query.toLowerCase()),
        )
      const expected = data.filter(
        (row) =>
          serverOwned ||
          ((threshold === undefined || row.score >= threshold) &&
            matchesSearch(row)),
      )
      if (!serverOwned && descending) expected.sort((a, b) => b.score - a.score)
      assert(
        JSON.stringify(table.getRowIds()) ===
          JSON.stringify(expected.map((row) => row.id)),
        'Incorrect complete row sequence',
      )
      const elements = Array.from(root.querySelectorAll('[data-row]'))
      assert(
        elements.length === Math.min(40, expected.length),
        'Incorrect visible row count',
      )
      elements.forEach((element, i) => {
        const row = expected[i]!
        const values = [
          ...(hidden ? [] : [row.name]),
          String(row.score),
          row.color,
          String(row.tags),
        ]
        assert(
          element.getAttribute('data-row') === row.id,
          'Incorrect visible row ID',
        )
        assert(
          JSON.stringify(
            Array.from(element.children, (cell) => cell.textContent),
          ) === JSON.stringify(values),
          'Incorrect visible cell values',
        )
      })
      if (facetsOpen()) {
        const eligible = serverOwned
          ? []
          : data.filter(
              (row) =>
                (threshold === undefined || row.score >= threshold) &&
                matchesSearch(row),
            )
        const colors = new Map<string, number>()
        const tags = new Map<string, number>()
        for (const row of eligible) {
          colors.set(row.color, (colors.get(row.color) ?? 0) + 1)
          for (const tag of new Set(row.tags))
            tags.set(tag, (tags.get(tag) ?? 0) + 1)
        }
        const scoreRows = serverOwned ? [] : data.filter(matchesSearch)
        const values = scoreRows.map((row) => row.score)
        const range = values.length
          ? [Math.min(...values), Math.max(...values)]
          : undefined
        assert(
          root.querySelector('#colors')!.textContent ===
            (serverOwned ? 'unavailable' : JSON.stringify([...colors])),
          'Incorrect color facets',
        )
        assert(
          root.querySelector('#tags')!.textContent ===
            (serverOwned ? 'unavailable' : JSON.stringify([...tags])),
          'Incorrect tag facets',
        )
        assert(
          root.querySelector('#range')!.textContent ===
            (range ? JSON.stringify(range) : 'unavailable'),
          'Incorrect score range',
        )
      }
    }
    run = () => {
      const steps: Array<{
        name: string
        duration: number
        counts: typeof counts
      }> = []
      const step = (name: string, change: () => void) => {
        const before = { ...counts }
        const begin = performance.now()
        change()
        flush()
        const duration = performance.now() - begin
        const delta = Object.fromEntries(
          Object.entries(counts).map(([key, value]) => [
            key,
            value - before[key as keyof typeof counts],
          ]),
        ) as typeof counts
        inspect()
        steps.push({ name, duration, counts: delta })
      }
      inspect()
      step('openFacets', () => setFacetsOpen(true))
      step('filter', () => {
        threshold = 50
        table.getColumn('score')!.setFilterValue(50)
      })
      step('search', () => {
        query = 'person 1'
        table.setGlobalFilter(query)
      })
      step('hideSearchColumn', () => {
        hidden = true
        table.getColumn('name')!.toggleVisibility(false)
      })
      step('showSearchColumn', () => {
        hidden = false
        table.getColumn('name')!.toggleVisibility(true)
      })
      step('editSearchField', () =>
        setRecords((draft) => {
          draft.r150!.name = 'Edited'
          draft.r150!.score = 75
        }),
      )
      step('clearSearch', () => {
        query = ''
        table.setGlobalFilter('')
      })
      step('sort', () => {
        descending = true
        table.setSorting([{ id: 'score', desc: true }])
      })
      step('unrelated', () =>
        setRecords((draft) => {
          draft.r150!.unused++
        }),
      )
      step('closeFacets', () => setFacetsOpen(false))
      step('closedFacetEdit', () =>
        setRecords((draft) => {
          draft[`r${Math.floor(size / 2) + 60}`]!.tags.push('new')
        }),
      )
      step('reopenFacets', () => setFacetsOpen(true))
      step('remove', () => {
        setIds((old) => old.filter((id) => id !== 'r150'))
        setRecords((draft) => {
          delete draft.r150
        })
      })
      step('append', () => {
        const added = record(size)
        setRecords((draft) => {
          draft[added.id] = added
        })
        setIds((old) => [...old, added.id])
      })
      step('manual', () => {
        serverOwned = true
        query = 'person 1'
        setManual(true)
        table.setGlobalFilter(query)
      })
      step('local', () => {
        serverOwned = false
        setManual(false)
      })
      step('reset', () => {
        threshold = undefined
        query = ''
        descending = false
        table.setColumnFilters([])
        table.setGlobalFilter('')
        table.setSorting([])
        setFacetsOpen(false)
      })
      return { steps, counts: { ...counts } }
    }
    stats = () => ({ ...counts })
    return (
      <>
        <Show when={facetsOpen()}>
          <output id="colors">
            {(() => {
              const values = table.getColumn('color')!.getFacetedUniqueValues()
              return values ? JSON.stringify([...values]) : 'unavailable'
            })()}
          </output>
          <output id="tags">
            {(() => {
              const values = table.getColumn('tags')!.getFacetedUniqueValues()
              return values ? JSON.stringify([...values]) : 'unavailable'
            })()}
          </output>
          <output id="range">
            {(() => {
              const range = table.getColumn('score')!.getFacetedMinMaxValues()
              return range ? JSON.stringify(range) : 'unavailable'
            })()}
          </output>
        </Show>
        <table>
          <tbody>
            <For each={table.getRowIds().slice(0, 40)}>
              {(id) => {
                const row = table.createRowView(id)
                counts.rows++
                onCleanup(() => {
                  counts.unmounts++
                })
                return (
                  <tr data-row={id}>
                    <For each={row.getVisibleCells()}>
                      {(cell) => {
                        counts.cells++
                        return <td>{String(cell.getValue())}</td>
                      }}
                    </For>
                  </tr>
                )
              }}
            </For>
          </tbody>
        </table>
      </>
    )
  }, root)
  flush()
  return { ...counts }
}
Object.assign(window, {
  nativeFeatures: {
    start,
    run: () => run!(),
    facets: (open: boolean) => {
      showFacets!(open)
      flush()
    },
    dispose: () => {
      dispose?.()
      flush()
      const counts = stats?.()
      dispose = undefined
      stats = undefined
      showFacets = undefined
      run = undefined
      return counts
    },
  },
})
