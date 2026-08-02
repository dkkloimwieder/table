// @vitest-environment jsdom

/**
 * What Solid 2's `[STRICT_READ_UNTRACKED]` diagnostic means for a table
 * (v3p.13).
 *
 * `createComponent` runs a component body inside `untrack(fn, label)`, and the
 * label switches on Solid's strict-read diagnostic: every reactive read in that
 * body that is NOT inside a nested tracking scope warns, because it subscribes
 * to nothing. table-core resolves values lazily inside render functions —
 * `getValue()` walks `table.options` through the adapter's getter-preserving
 * merge and then reads `row.original` — so reads land there as well as at
 * `createTable()` itself, which `constructTable` evaluates with an object
 * spread.
 *
 * The question is not whether it warns (it does, thousands of times per scroll
 * in a virtualized example) but whether anything goes stale. The answer differs
 * per trigger, so each one is pinned separately below. In short: every read the
 * table itself performs is a redundant read of an already-current value,
 * because the surrounding JSX tracks the row/cell chain and re-invokes the
 * renderer with a fresh cell instance. A reactive value read ONLY by a renderer
 * that returns a plain value is the one case that really is stale — which is
 * exactly what the diagnostic says, and is fixed by the remedy it recommends.
 *
 * Diagnostics are read through `DEV.diagnostics.capture()` rather than by
 * spying on `console.warn`, so the assertions are about the reactive event
 * rather than about log formatting. The labels are Solid's own, e.g. `<cell>`
 * for table-core's default renderer (a function literal on a `cell:` property).
 */

import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { DEV, createMemo, createSignal, createStore } from 'solid-js'
import { stockFeatures } from '@tanstack/table-core'
import { FlexRender } from '../../src/FlexRender'
import { createTable } from '../../src/createTable'
import { settle } from '../utils/reactive'
import type { ColumnDef } from '@tanstack/table-core'

afterEach(() => cleanup())

type Data = { id: string; name: string }

function clickAndSettle(name: string): void {
  fireEvent.click(screen.getByRole('button', { name }))
  settle()
}

function textOf(label: string): string | null {
  return screen.getByRole('status', { name: label }).textContent
}

/**
 * Runs `body` with Solid's diagnostics captured, handing it an accessor for the
 * strict-read labels seen so far — the name of the scope whose untracked body
 * performed the read.
 */
function withStrictReads<T>(body: (labels: () => Array<string>) => T): T {
  const capture = DEV?.diagnostics.capture()
  if (!capture) {
    throw new Error(
      'Solid dev diagnostics are unavailable — this suite must run against ' +
        'the development build, where the strict-read warning exists at all.',
    )
  }
  try {
    return body(() =>
      capture.events
        .filter((event) => event.code === 'STRICT_READ_UNTRACKED')
        .map((event) => String(event.data?.strictRead ?? event.ownerName)),
    )
  } finally {
    capture.stop()
  }
}

describe('strict-read diagnostics around reactive table options', () => {
  test('`createTable` in a component body warns once for a reactive option, and the table is still reactive', () => {
    withStrictReads((labels) => {
      function Harness() {
        const [data, setData] = createSignal<Array<Data>>([
          { id: '1', name: 'Ada' },
        ])
        // `constructTable` builds the options-store seed with an object spread,
        // which evaluates this getter right here in the untracked component
        // body. That single read is what the bead was originally filed for.
        const table = createTable({
          get data() {
            return data()
          },
          columns: [
            {
              id: 'name',
              accessorKey: 'name',
              cell: (c) => `cell:${c.getValue()}`,
            },
          ] satisfies Array<ColumnDef<typeof stockFeatures, Data>>,
          features: stockFeatures,
          getRowId: (row) => row.id,
        })

        return (
          <>
            <output aria-label="cell">
              <FlexRender
                cell={table.getRowModel().rows[0]!.getAllCells()[0]!}
              />
            </output>
            <button onClick={() => setData([{ id: '1', name: 'Grace' }])}>
              Replace data
            </button>
          </>
        )
      }

      render(() => <Harness />)

      expect(textOf('cell')).toBe('cell:Ada')
      // Named for the component, not the cell: this is the construction-time
      // spread, and it happens exactly once per table.
      expect(labels()).toEqual(['<Harness>'])

      clickAndSettle('Replace data')

      // Benign: the snapshot the spread took is immediately re-layered by the
      // options store's live getters, so every later read of `options.data`
      // goes through the getter inside a tracking scope.
      expect(textOf('cell')).toBe('cell:Grace')
      expect(labels()).toEqual(['<Harness>'])
    })
  })

  test('a reactive `columns` option warns from inside the cell renderer, and is still not stale', () => {
    withStrictReads((labels) => {
      function Harness() {
        const [prefix, setPrefix] = createSignal('a')
        const table = createTable({
          data: [{ id: '1', name: 'Ada' }] as Array<Data>,
          // Trigger 1 from the wave-14 stacks: `getValue()` walks
          // `table.getColumn()` -> `getAllFlatColumnsById` -> its `memoDeps`,
          // which reads `table.options.columns` — i.e. this getter — from
          // inside the untracked renderer body.
          //
          // The signal is read HERE, in the getter, not inside the `cell`
          // closure. That distinction is the whole test: a read in the closure
          // would only ever run untracked (see the next test), while a read in
          // the getter runs in whatever scope asks for the option.
          get columns(): Array<ColumnDef<typeof stockFeatures, Data>> {
            const currentPrefix = prefix()
            return [
              {
                id: 'name',
                accessorKey: 'name',
                cell: (c) => `${currentPrefix}:${c.getValue()}`,
              },
            ]
          },
          features: stockFeatures,
          getRowId: (row) => row.id,
        })

        return (
          <>
            <output aria-label="cell">
              <FlexRender
                cell={table.getRowModel().rows[0]!.getAllCells()[0]!}
              />
            </output>
            <button onClick={() => setPrefix('b')}>Change columns</button>
          </>
        )
      }

      render(() => <Harness />)

      expect(textOf('cell')).toBe('a:Ada')
      expect(labels()).toContain('<cell>')

      clickAndSettle('Change columns')

      // The untracked read inside the renderer subscribed to nothing, but the
      // JSX above reads the same option through a tracked chain, so the column
      // rebuild produces a new cell instance and `<Match keyed>` re-invokes the
      // renderer.
      expect(textOf('cell')).toBe('b:Ada')
    })
  })

  test('ADVERSARIAL: a signal read only by a plain-value renderer goes stale', () => {
    withStrictReads((labels) => {
      function Harness() {
        const [suffix, setSuffix] = createSignal('A')
        const table = createTable({
          // Deliberately non-reactive, so `suffix()` is the only reactive read
          // the renderer performs and nothing else in the tree observes it.
          data: [{ id: '1', name: 'Ada' }] as Array<Data>,
          columns: [
            {
              id: 'name',
              accessorKey: 'name',
              // Returns a plain value, so `createComponent` invokes it once and
              // there is no tracking scope anywhere inside the renderer.
              cell: (c) => `${c.getValue()}:${suffix()}`,
            },
          ] satisfies Array<ColumnDef<typeof stockFeatures, Data>>,
          features: stockFeatures,
          getRowId: (row) => row.id,
        })

        return (
          <>
            <output aria-label="cell">
              <FlexRender
                cell={table.getRowModel().rows[0]!.getAllCells()[0]!}
              />
            </output>
            <button onClick={() => setSuffix('B')}>Bump suffix</button>
          </>
        )
      }

      render(() => <Harness />)

      expect(textOf('cell')).toBe('Ada:A')
      expect(labels()).toEqual(['<cell>'])

      clickAndSettle('Bump suffix')

      // The one genuinely stale case: nothing else observes `suffix`, the cell
      // instance is unchanged, so the renderer never runs again. The warning
      // was right, and silencing it wholesale would hide this.
      expect(textOf('cell')).toBe('Ada:A')
    })
  })

  test('the same signal updates when the renderer returns JSX, and stops warning', () => {
    withStrictReads((labels) => {
      function Harness() {
        const [suffix, setSuffix] = createSignal('A')
        const table = createTable({
          data: [{ id: '1', name: 'Ada' }] as Array<Data>,
          columns: [
            {
              id: 'name',
              accessorKey: 'name',
              // The JSX expression compiles to an insert effect — exactly the
              // "tracking scope" the diagnostic asks for.
              cell: (c) => <span>{`${c.getValue()}:${suffix()}`}</span>,
            },
          ] satisfies Array<ColumnDef<typeof stockFeatures, Data>>,
          features: stockFeatures,
          getRowId: (row) => row.id,
        })

        return (
          <>
            <output aria-label="cell">
              <FlexRender
                cell={table.getRowModel().rows[0]!.getAllCells()[0]!}
              />
            </output>
            <button onClick={() => setSuffix('B')}>Bump suffix</button>
          </>
        )
      }

      render(() => <Harness />)

      expect(textOf('cell')).toBe('Ada:A')

      clickAndSettle('Bump suffix')

      expect(textOf('cell')).toBe('Ada:B')
      // The remedy the diagnostic recommends also silences it: the warning
      // discriminates, it does not fire for every renderer.
      expect(labels()).toEqual([])
    })
  })

  test('a Solid store passed as `data` never updates, in any renderer shape', () => {
    function Harness() {
      const [rows, setRows] = createStore<Array<Data>>([
        { id: '1', name: 'Ada' },
      ])
      const table = createTable({
        get data() {
          return rows
        },
        columns: [
          { id: 'plain', accessorKey: 'name', cell: (c) => `${c.getValue()}` },
          {
            id: 'jsx',
            accessorKey: 'name',
            cell: (c) => <span>{`${c.getValue()}`}</span>,
          },
        ] satisfies Array<ColumnDef<typeof stockFeatures, Data>>,
        features: stockFeatures,
        getRowId: (row) => row.id,
      })
      const cells = () => table.getRowModel().rows[0]!.getAllCells()

      return (
        <>
          <output aria-label="plain">
            <FlexRender cell={cells()[0]!} />
          </output>
          <output aria-label="jsx">
            <FlexRender cell={cells()[1]!} />
          </output>
          <button
            onClick={() =>
              setRows((draft) => {
                draft[0]!.name = 'Grace'
              })
            }
          >
            Mutate in place
          </button>
          <button onClick={() => setRows(() => [{ id: '1', name: 'Hopper' }])}>
            Replace the array
          </button>
        </>
      )
    }

    render(() => <Harness />)

    expect(textOf('plain')).toBe('Ada')
    expect(textOf('jsx')).toBe('Ada')

    clickAndSettle('Mutate in place')

    // Not a tracking problem, and not fixable by moving the read into a
    // tracking scope: `table.options.data` is the store PROXY, whose identity
    // never changes, so `createCoreRowModel`'s `memoDeps: [table.options.data]`
    // never sees a change and the row model is never rebuilt. A tracked read
    // would still be served from `row._valuesCache`, which is why the JSX
    // column is stale too.
    expect(textOf('plain')).toBe('Ada')
    expect(textOf('jsx')).toBe('Ada')

    clickAndSettle('Replace the array')

    // The usual escape hatch does not apply either: a store setter merges into
    // the SAME proxy instead of handing back a new array. A store has to be
    // projected into a plain array (e.g. through a `createMemo`) before it is
    // handed to `data` — which is exactly what the solid-query example does
    // with `pages.flatMap`, and what the next test pins.
    expect(textOf('plain')).toBe('Ada')
    expect(textOf('jsx')).toBe('Ada')
  })

  test('a store projected through a memo does update — the documented escape hatch', () => {
    function Harness() {
      const [rows, setRows] = createStore<Array<Data>>([
        { id: '1', name: 'Ada' },
      ])
      // Copying each row is what makes this work twice over: the memo reads
      // every property, so a nested mutation invalidates it, and it returns a
      // new array whose identity the row-model memo can see.
      const data = createMemo(() => rows.map((row) => ({ ...row })))
      const table = createTable({
        get data() {
          return data()
        },
        columns: [
          { id: 'name', accessorKey: 'name', cell: (c) => `${c.getValue()}` },
        ] satisfies Array<ColumnDef<typeof stockFeatures, Data>>,
        features: stockFeatures,
        getRowId: (row) => row.id,
      })

      return (
        <>
          <output aria-label="cell">
            <FlexRender cell={table.getRowModel().rows[0]!.getAllCells()[0]!} />
          </output>
          <button
            onClick={() =>
              setRows((draft) => {
                draft[0]!.name = 'Grace'
              })
            }
          >
            Mutate in place
          </button>
        </>
      )
    }

    render(() => <Harness />)

    expect(textOf('cell')).toBe('Ada')

    clickAndSettle('Mutate in place')

    expect(textOf('cell')).toBe('Grace')
  })
})
