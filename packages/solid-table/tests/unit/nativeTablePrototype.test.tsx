import { afterEach, expect, test } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  For,
  createMemo,
  createRoot,
  createSignal,
  createStore,
  flush,
  onCleanup,
  reconcile,
} from 'solid-js'
import { createNativeTable } from '../../bench/native-table'

afterEach(cleanup)
type RecordData = { score: number; details: { label: string }; unused: number }
const item = (score: number, label: string): RecordData => ({
  score,
  details: { label },
  unused: 0,
})

function setup() {
  const counts = {
    score: 0,
    label: 0,
    filters: 0,
    sorts: 0,
    mounts: 0,
    unmounts: 0,
  }
  const harness = createRoot((dispose) => {
    const [data, setData] = createStore<{
      ids: Array<string>
      records: Record<string, RecordData>
    }>({
      ids: ['a', 'b', 'c'],
      records: {
        a: item(20, 'Ada'),
        b: item(10, 'Grace'),
        c: item(30, 'Katherine'),
      },
    })
    const [start, setStart] = createSignal(0)
    const [factor, setFactor] = createSignal(1)
    const columns = createMemo(() => {
      const scale = factor()
      return [
        {
          id: 'score',
          accessorFn: (record: RecordData) => {
            counts.score++
            return record.score * scale
          },
          filterFn: (value: unknown, minimum: unknown) => {
            counts.filters++
            return (value as number) >= (minimum as number)
          },
          sortFn: (a: unknown, b: unknown) => {
            counts.sorts++
            return (a as number) - (b as number)
          },
        },
        {
          id: 'label',
          accessorFn: (record: RecordData) => {
            counts.label++
            return record.details.label
          },
        },
      ]
    })
    const table = createNativeTable({
      source: { ids: () => data.ids, get: (id) => data.records[id] },
      get columns() {
        return columns()
      },
    })
    const visible = createMemo(() =>
      table.getRowIds().slice(start(), start() + 2),
    )
    return { data, setData, setStart, setFactor, table, visible, dispose }
  })
  const View = () => (
    <output>
      <For each={harness.visible()}>
        {(id) => {
          counts.mounts++
          onCleanup(() => {
            counts.unmounts++
          })
          const row = harness.table.getRow(id)
          return (
            <span data-id={id}>
              {String(row.getValue('score'))}:{String(row.getValue('label'))};
            </span>
          )
        }}
      </For>
    </output>
  )
  return { ...harness, View, counts }
}

test('native field and nested edits update only their consuming accessors', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const node = document.querySelector('[data-id="a"]')
    const before = { ...h.counts }
    h.setData((draft) => {
      draft.records.a!.score = 42
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('42:Ada;10:Grace;')
    expect(h.counts).toEqual({ ...before, score: before.score + 1 })
    h.setData((draft) => {
      draft.records.a!.details.label = 'Nested'
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('42:Nested;10:Grace;')
    expect(h.counts).toEqual({
      ...before,
      score: before.score + 1,
      label: before.label + 1,
    })
    h.setData((draft) => {
      draft.records.a!.unused++
    })
    flush()
    expect(h.counts).toEqual({
      ...before,
      score: before.score + 1,
      label: before.label + 1,
    })
    expect(document.querySelector('[data-id="a"]')).toBe(node)
  } finally {
    h.dispose()
  }
})

test('offscreen append and edits allocate no display scopes, and replacement keeps visible identity', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const node = document.querySelector('[data-id="a"]')
    const before = { ...h.counts }
    h.setData((draft) => {
      draft.ids.push('d')
      draft.records.d = item(40, 'Dorothy')
      draft.records.c!.score = 99
    })
    flush()
    expect(h.counts).toEqual(before)
    h.setData((draft) => {
      draft.records.a = item(50, 'Replacement')
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe(
      '50:Replacement;10:Grace;',
    )
    expect(document.querySelector('[data-id="a"]')).toBe(node)
    expect(h.counts.mounts).toBe(2)
    expect(h.counts.unmounts).toBe(0)
  } finally {
    h.dispose()
  }
})

test('native filters and sorts react to store fields and ignore unused edits', () => {
  const h = setup()
  try {
    render(h.View)
    h.table.setColumnFilters([{ id: 'score', value: 15 }])
    h.table.setSorting([{ id: 'score', desc: true }])
    flush()
    expect(h.table.getRowIds()).toEqual(['c', 'a'])
    expect(screen.getByRole('status').textContent).toBe('30:Katherine;20:Ada;')
    const before = { ...h.counts }
    h.setData((draft) => {
      draft.records.a!.unused++
    })
    flush()
    expect(h.counts).toEqual(before)
    h.setData((draft) => {
      draft.records.b!.score = 40
    })
    flush()
    expect(h.table.getRowIds()).toEqual(['b', 'c', 'a'])
    expect(screen.getByRole('status').textContent).toBe(
      '40:Grace;30:Katherine;',
    )
    h.setData((draft) => {
      draft.records.c!.score = 5
    })
    flush()
    expect(h.table.getRowIds()).toEqual(['b', 'a'])
    expect(screen.getByRole('status').textContent).toBe('40:Grace;20:Ada;')
  } finally {
    h.dispose()
  }
})

test('reorder, native reconciliation, and column replacement preserve correct values', () => {
  const h = setup()
  try {
    render(h.View)
    flush()
    const a = document.querySelector('[data-id="a"]')
    h.setData((draft) => {
      draft.ids = ['b', 'a', 'c']
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('10:Grace;20:Ada;')
    expect(document.querySelector('[data-id="a"]')).toBe(a)
    h.setData((draft) => {
      reconcile({
        a: item(60, 'Refresh'),
        b: item(10, 'Grace'),
        c: item(30, 'Katherine'),
      })(draft.records)
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('10:Grace;60:Refresh;')
    h.setFactor(2)
    flush()
    expect(screen.getByRole('status').textContent).toBe('20:Grace;120:Refresh;')
    expect(document.querySelector('[data-id="a"]')).toBe(a)
  } finally {
    h.dispose()
  }
})

test('window disposal stops cell work while the canonical record remains available', () => {
  const h = setup()
  try {
    const view = render(h.View)
    flush()
    h.setStart(1)
    flush()
    expect(h.counts.mounts - h.counts.unmounts).toBe(2)
    const before = { ...h.counts }
    h.setData((draft) => {
      draft.records.a!.score = 70
    })
    flush()
    expect(h.counts).toEqual(before)
    h.setStart(0)
    flush()
    expect(screen.getByRole('status').textContent).toBe('70:Ada;10:Grace;')
    view.unmount()
    expect(h.counts.mounts).toBe(h.counts.unmounts)
    const after = { ...h.counts }
    h.setData((draft) => {
      draft.records.a!.score = 80
    })
    flush()
    expect(h.counts).toEqual(after)
    render(h.View)
    flush()
    expect(screen.getByRole('status').textContent).toBe('80:Ada;10:Grace;')
  } finally {
    h.dispose()
  }
})

test('batched removal clears visible rows and supports an empty collection', () => {
  const h = setup()
  try {
    render(h.View)
    h.setData((draft) => {
      draft.ids = ['b', 'c']
      delete draft.records.a
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe(
      '10:Grace;30:Katherine;',
    )
    h.setData((draft) => {
      draft.ids = []
      draft.records = {}
    })
    flush()
    expect(screen.getByRole('status').textContent).toBe('')
    expect(h.counts.mounts).toBe(h.counts.unmounts)
  } finally {
    h.dispose()
  }
})

test('sort ties retain source order and comparator keys are read once per derivation', () => {
  let reads = 0
  const harness = createRoot((dispose) => ({
    dispose,
    table: createNativeTable({
      source: {
        ids: () => ['b', 'a', 'c'],
        get: (id) => ({ value: id === 'c' ? 2 : 1 }),
      },
      columns: [
        {
          id: 'value',
          accessorFn: (row) => {
            reads++
            return row.value
          },
          sortFn: (a, b) => (a as number) - (b as number),
        },
      ],
    }),
  }))
  try {
    harness.table.setSorting([{ id: 'value', desc: false }])
    flush()
    expect(harness.table.getRowIds()).toEqual(['b', 'a', 'c'])
    expect(reads).toBe(3)
  } finally {
    harness.dispose()
  }
})

test('duplicate IDs and missing records fail explicitly without special object-key assumptions', () => {
  createRoot((dispose) => {
    try {
      const duplicate = createNativeTable({
        source: { ids: () => ['a', 'a'], get: () => item(1, '') },
        columns: [],
      })
      expect(() => duplicate.getRowIds()).toThrow('unique nonempty row IDs')
      const table = createNativeTable({
        source: {
          ids: () => ['__proto__', 'constructor'],
          get: (id) => (id === '__proto__' ? item(1, 'Reserved') : undefined),
        },
        columns: [{ id: 'label', accessorFn: (row) => row.details.label }],
      })
      expect(table.getRowIds()).toEqual(['__proto__', 'constructor'])
      expect(table.getValue('__proto__', 'label')).toBe('Reserved')
      expect(() => table.getValue('constructor', 'label')).toThrow(
        'Missing record: constructor',
      )
    } finally {
      dispose()
    }
  })
})
