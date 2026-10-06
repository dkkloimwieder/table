import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  createStore,
  flush,
} from 'solid-js'
import { createNativeTable } from '@tanstack/solid-table/native'

type Item = {
  id: string
  name: string
  score: number
  color: string
  unused: number
}
type Mode = 'native' | 'native-reuse' | 'separate' | 'matcher-cache' | 'fused'
type Counts = {
  records: number
  computed: number
  colors: number
  filters: number
  searches: number
}
type Output = {
  ids: Array<string>
  computed?: Array<[string, number]>
  colors?: Array<[string, number]>
}
const emptyCounts = (): Counts => ({
  records: 0,
  computed: 0,
  colors: 0,
  filters: 0,
  searches: 0,
})
const item = (i: number): Item => ({
  id: `r${i}`,
  name: `Person ${i}`,
  score: i % 100,
  color: ['red', 'blue', 'green'][i % 3]!,
  unused: 0,
})
const equal = (a: unknown, b: unknown, message: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(
      `${message}: actual=${JSON.stringify(a)} expected=${JSON.stringify(b)}`,
    )
}

function profile(mode: Mode, size: number, iterations: number) {
  return createRoot((dispose) => {
    const counts = emptyCounts()
    const passes = { rows: 0, computed: 0, colors: 0, combined: 0 }
    const [records, setRecords] = createStore<Record<string, Item>>(
      Object.fromEntries(
        Array.from({ length: size }, (_, i) => {
          const row = item(i)
          return [row.id, row]
        }),
      ),
    )
    const [ids, setIds] = createSignal(
      Array.from({ length: size }, (_, i) => `r${i}`),
    )
    const [filter, setFilter] = createSignal<string | undefined>()
    const [query, setQuery] = createSignal('')
    const [open, setOpen] = createSignal(false)
    const access = (row: Item) => {
      counts.computed++
      let checksum = row.score
      for (let i = 0; i < iterations; i++) checksum = (checksum * 33 + i) % 997
      return `${row.name.trim().toLowerCase()}|bucket-${row.score % 4}|${checksum}`
    }
    const color = (row: Item) => {
      counts.colors++
      return row.color
    }
    const get = (id: string) => {
      counts.records++
      return records[id]!
    }
    const matchesFilter = (value: string, selected: string) => {
      counts.filters++
      return value.includes(selected)
    }
    const matchesSearch = (value: string, term: string) => {
      counts.searches++
      return value.includes(term)
    }
    const add = (map: Map<string, number>, value: string) =>
      map.set(value, (map.get(value) ?? 0) + 1)
    let read: () => Output
    let configure: (value: string | undefined, term: string) => void
    if (mode === 'native' || mode === 'native-reuse') {
      const table = createNativeTable({
        source: { ids, get },
        columns: [
          {
            id: 'computed',
            accessorFn: access,
            enableFilterValueReuse: mode === 'native-reuse',
            filterFn: (value, selected) =>
              matchesFilter(String(value), String(selected)),
          },
          { id: 'color', accessorFn: color, enableGlobalFilter: false },
        ],
        globalFilterFn: (value, term) => matchesSearch(String(value), term),
      })
      configure = (value, term) => {
        table.getColumn('computed')!.setFilterValue(value)
        table.setGlobalFilter(term)
      }
      read = () => {
        const rowIds = Array.from(table.getRowIds())
        const computedValues = open()
          ? (Array.from(
              table.getColumn('computed')!.getFacetedUniqueValues()!,
            ) as Array<[string, number]>)
          : undefined
        const colorValues = open()
          ? (Array.from(
              table.getColumn('color')!.getFacetedUniqueValues()!,
            ) as Array<[string, number]>)
          : undefined
        return {
          ids: rowIds,
          ...(open()
            ? {
                computed: computedValues,
                colors: colorValues,
              }
            : {}),
        }
      }
    } else {
      configure = (value, term) => {
        setFilter(value)
        setQuery(term)
      }
      const scan = (kind: 'rows' | 'computed' | 'colors') => {
        passes[kind]++
        const result: Array<string> = []
        const values = new Map<string, number>()
        const selected = kind === 'computed' ? undefined : filter()
        const term = query()
        if (kind === 'rows' && selected === undefined && !term) return ids()
        for (const id of ids()) {
          const row = get(id)
          let value: string | undefined
          const matchValue = () =>
            mode === 'matcher-cache'
              ? (value ?? (value = access(row)))
              : access(row)
          if (selected !== undefined && !matchesFilter(matchValue(), selected))
            continue
          if (term && !matchesSearch(matchValue(), term)) continue
          if (kind === 'rows') result.push(id)
          else add(values, kind === 'computed' ? access(row) : color(row))
        }
        return kind === 'rows' ? result : Array.from(values)
      }
      if (mode === 'separate' || mode === 'matcher-cache') {
        const rows = createMemo(() => scan('rows') as Array<string>, {
          lazy: true,
        })
        const computed = createMemo(
          () => scan('computed') as Array<[string, number]>,
          { lazy: true },
        )
        const colors = createMemo(
          () => scan('colors') as Array<[string, number]>,
          { lazy: true },
        )
        read = () => ({
          ids: rows(),
          ...(open() ? { computed: computed(), colors: colors() } : {}),
        })
      } else {
        const combined = createMemo(
          () => {
            passes.combined++
            const result: Output = { ids: [] }
            const computed = new Map<string, number>()
            const colors = new Map<string, number>()
            const selected = filter()
            const term = query()
            const facets = open()
            for (const id of ids()) {
              const row = get(id)
              let value: string | undefined
              const shared = () => value ?? (value = access(row))
              const passesFilter =
                selected === undefined || matchesFilter(shared(), selected)
              const passesSearch =
                (passesFilter || facets) &&
                (!term || matchesSearch(shared(), term))
              if (passesFilter && passesSearch) {
                result.ids.push(id)
                if (facets) add(colors, color(row))
              }
              if (facets && passesSearch) add(computed, shared())
            }
            if (facets) {
              result.computed = Array.from(computed)
              result.colors = Array.from(colors)
            }
            return result
          },
          { lazy: true },
        )
        read = combined
      }
    }

    let observed: Output | undefined
    createEffect(read, (value) => {
      observed = value
    })
    let replaced = false
    let relevantEdited = false
    let activeColorEdited = false
    let closedColorEdited = false
    // The oracle reconstructs specified mutations. It never reads or warms the source store.
    function oracle() {
      const rows = Array.from({ length: size }, (_, i) => {
        const row = item(i)
        if (replaced) {
          row.name = `Person ${i} replacement`
          row.color = i % 2 ? 'black' : 'white'
        } else {
          if (i === 110 && relevantEdited) {
            row.name = 'Person 110 changed'
            row.score = 99
          }
          if (i === 114 && activeColorEdited) row.color = 'purple'
          if (i === 111 && closedColorEdited) row.color = 'orange'
        }
        return row
      })
      const value = (row: Item) => {
        const checksum = Array.from({ length: iterations }, (_, i) => i).reduce(
          (n, i) => (33 * n + i) % 997,
          row.score,
        )
        return [
          row.name.trim().toLowerCase(),
          `bucket-${row.score % 4}`,
          checksum,
        ].join('|')
      }
      const searchable = rows.filter(
        (row) => !query() || value(row).includes(query()),
      )
      const filtered = searchable.filter(
        (row) => filter() === undefined || value(row).includes(filter()!),
      )
      const result: Output = { ids: filtered.map((row) => row.id) }
      if (open()) {
        const summarize = (values: Array<string>) => {
          const map = new Map<string, number>()
          values.forEach((entry) => map.set(entry, (map.get(entry) ?? 0) + 1))
          return Array.from(map)
        }
        result.computed = summarize(searchable.map(value))
        result.colors = summarize(filtered.map((row) => row.color))
      }
      return {
        output: result,
        populations: {
          filterPasses: rows.filter(
            (row) => filter() === undefined || value(row).includes(filter()!),
          ).length,
          searchMatches: searchable.length,
          eligible: filtered.length,
        },
      }
    }
    const steps: Array<{
      name: string
      duration: number
      counts: Counts
      passes: typeof passes | null
      populations: {
        filterPasses: number
        searchMatches: number
        eligible: number
      }
      rows: number
      computedFacets: number
      colorFacets: number
    }> = []
    const step = (name: string, change: () => void) => {
      const before = { ...counts }
      const beforePasses = { ...passes }
      const begin = performance.now()
      change()
      flush()
      const actual = observed!
      const duration = performance.now() - begin
      const delta = Object.fromEntries(
        Object.entries(counts).map(([key, n]) => [
          key,
          n - before[key as keyof Counts],
        ]),
      ) as Counts
      const expected = oracle()
      equal(
        actual,
        expected.output,
        `${mode}/${name}: incorrect rows or own-filter facets`,
      )
      if (name === 'unrelated' || name === 'idle')
        equal(delta, emptyCounts(), `${mode}/${name}: unnecessary work`)
      if (name === 'closedColorEdit')
        equal(delta, emptyCounts(), `${mode}/${name}: closed facet work`)
      steps.push({
        name,
        duration,
        counts: delta,
        populations: expected.populations,
        passes:
          mode === 'native' || mode === 'native-reuse'
            ? null
            : (Object.fromEntries(
                Object.entries(passes).map(([key, n]) => [
                  key,
                  n - beforePasses[key as keyof typeof passes],
                ]),
              ) as typeof passes),
        rows: actual.ids.length,
        computedFacets: actual.computed?.length ?? 0,
        colorFacets: actual.colors?.length ?? 0,
      })
    }
    const config = (selected: string | undefined, term: string) => {
      setFilter(selected)
      setQuery(term)
      configure(selected, term)
    }
    try {
      step('initial', () => {})
      step('idle', () => {})
      step('filter', () => config('bucket-2', ''))
      step('search', () => config('bucket-2', 'person 1'))
      step('openFacets', () => setOpen(true))
      step('relevantEdit', () => {
        relevantEdited = true
        setRecords((draft) => {
          draft.r110!.score = 99
          draft.r110!.name = 'Person 110 changed'
        })
      })
      step('unrelated', () =>
        setRecords((draft) => {
          draft.r110!.unused++
        }),
      )
      step('activeColorEdit', () => {
        activeColorEdited = true
        setRecords((draft) => {
          draft.r114!.color = 'purple'
        })
      })
      step('ownFilterChange', () => config('bucket-3', 'person 1'))
      step('closeFacets', () => setOpen(false))
      step('closedColorEdit', () => {
        closedColorEdited = true
        setRecords((draft) => {
          draft.r111!.color = 'orange'
        })
      })
      step('sourceReplacement', () => {
        replaced = true
        const replacement = Array.from({ length: size }, (_, i) => ({
          ...item(i),
          name: `Person ${i} replacement`,
          color: i % 2 ? 'black' : 'white',
        }))
        setRecords((draft) => {
          for (const row of replacement) draft[row.id] = row
        })
        setIds(replacement.map((row) => row.id))
      })
      step('reopenFacets', () => setOpen(true))
      step('clearSearch', () => config('bucket-3', ''))
      const beforeDisposal = { ...counts }
      dispose()
      setRecords((draft) => {
        draft.r110!.score++
      })
      flush()
      equal(counts, beforeDisposal, `${mode}: work after disposal`)
      return {
        mode,
        size,
        iterations,
        steps,
        counts: { ...counts },
        disposed: true,
      }
    } finally {
      dispose()
    }
  })
}

Object.assign(window, { accessorProfile: { run: profile } })
