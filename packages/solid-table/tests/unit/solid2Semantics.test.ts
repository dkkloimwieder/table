/**
 * D25 — the Solid 2 semantic contract tests (design D25.1-8 plus the rcv.3
 * additions). The type system catches none of these semantics; this file is
 * the migration's executable safety net against Solid beta churn.
 *
 * Coverage map:
 *   D25.1 coalescing, D25.2 consecutive functional updates, D25.3 imperative
 *   read-your-writes, D25.4 stale-window pin, D25.5 ownedWrite silence +
 *   bounded-loop tripwire, D25.6 subscribe contract, D25.8 two-way external
 *   atom sync — here.
 *   D25.7 context error messages — rendering.test.tsx ("context hooks fail
 *   with actionable errors outside their providers"), which needs jsdom.
 *   rcv.3(b) same-tick swallow regression — options-store.smoke.test.ts
 *   ("a data change and a setOptions in the same tick are both visible").
 */
import { describe, expect, test, vi } from 'vitest'
import { createEffect, createOwner, flush, untrack } from 'solid-js'
import { createAtom as createStoreAtom } from '@tanstack/store'
import { stockFeatures } from '@tanstack/table-core'
import { createTable } from '../../src/createTable'
import { solidReactivity } from '../../src/reactivity'
import { createEffectTestRoot, settle } from '../utils/reactive'
import type { ColumnDef, RowSelectionState } from '@tanstack/table-core'

type Data = { id: string; title: string }

const columns: Array<ColumnDef<typeof stockFeatures, Data>> = [
  { id: 'id', accessorKey: 'id' },
  { id: 'title', accessorKey: 'title' },
]

const data: Array<Data> = [
  { id: '1', title: 'One' },
  { id: '2', title: 'Two' },
]

function makeBindings() {
  return solidReactivity(createOwner())
}

describe('D25 Solid 2 semantic contracts', () => {
  test('D25.1 — N writes coalesce into exactly one effect run per flush', () => {
    const { dispose, value } = createEffectTestRoot(() => {
      const bindings = makeBindings()
      const atom = bindings.createWritableAtom(0, { debugName: 'd25/coalesce' })
      const runs = vi.fn<(value: number) => void>()
      createEffect(
        () => atom.get(),
        (current: number) => {
          runs(current)
        },
      )
      return { atom, runs }
    })
    const { atom, runs } = value

    try {
      settle()
      expect(runs.mock.calls).toEqual([[0]])

      atom.set(1)
      atom.set(2)
      atom.set(3)
      atom.set(4)
      atom.set(5)
      settle()

      expect(runs.mock.calls).toEqual([[0], [5]])
    } finally {
      dispose()
    }
  })

  test('D25.2 — consecutive functional updates in one tick see each other', () => {
    // Guards columnResizingFeature.utils.ts, which issues two functional
    // set() calls in one synchronous run that must compose.
    const bindings = makeBindings()
    const atom = bindings.createWritableAtom(
      { deltaOffset: 0, deltaPercentage: 0 },
      { debugName: 'd25/functional' },
    )

    atom.set((old) => ({ ...old, deltaOffset: old.deltaOffset + 5 }))
    atom.set((old) => ({ ...old, deltaOffset: old.deltaOffset + 5 }))

    expect(atom.get().deltaOffset).toBe(10)
  })

  test('D25.3 — imperative read-your-writes with NO flush (settle-on-read spec)', () => {
    // The executable spec for D10-A: this test must never gain a flush()
    // between the write and the read.
    const { dispose, value } = createEffectTestRoot(() =>
      createTable({ data, columns, features: stockFeatures }),
    )
    const table = value

    try {
      table.setPageSize(50)
      expect(table.atoms.pagination.get().pageSize).toBe(50)
    } finally {
      dispose()
    }
  })

  test('D25.4 — raw reads in the pending window stay committed and converge on flush', () => {
    // Pins the Solid 2 pending-window semantics settle-on-read depends on: a
    // raw (un-settled) read returns the last COMMITTED value until flush(),
    // and an owned derived memo never tears against its base. A Solid beta
    // that changes either must fail here loudly.
    const { dispose, value } = createEffectTestRoot(() => {
      const bindings = makeBindings()
      const base = bindings.createWritableAtom(1, { debugName: 'd25/base' })
      const derived = bindings.createReadonlyAtom(() => base.get() * 2, {
        debugName: 'd25/derived',
      })
      return { base, derived }
    })
    const { base, derived } = value

    // Adapter atoms are Solid accessors carrying the Atom interface; calling
    // them directly bypasses settle-on-read (the store types don't declare
    // the call signature, hence the casts).
    const rawBase = base as unknown as () => number
    const rawDerived = derived as unknown as () => number

    try {
      settle()
      base.set(2)

      expect(untrack(rawBase)).toBe(1)
      expect(untrack(rawDerived)).toBe(2)

      flush()
      expect(untrack(rawBase)).toBe(2)
      expect(untrack(rawDerived)).toBe(4)
    } finally {
      dispose()
    }
  })

  test('D25.5 — table writes from reactive scopes are warning-free, and write loops stay bounded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { dispose, value } = createEffectTestRoot(() => {
        const table = createTable({
          data,
          columns,
          features: stockFeatures,
          getRowId: (row) => row.id,
        })
        // A write issued from an effect (reactive scope) — the exact pattern
        // ownedWrite: true exists for.
        createEffect(
          () => table.atoms.rowSelection.get(),
          (selection: RowSelectionState) => {
            if (Object.keys(selection).length === 0) {
              table.setRowSelection({ 1: true })
            }
          },
        )

        // Bounded self-perpetuating loop: replaces the runaway-write
        // tripwire that ownedWrite: true forfeits. If Solid ever delivers
        // these writes recursively/synchronously this test hangs or throws
        // instead of passing.
        const bindings = solidReactivity(createOwner())
        const counter = bindings.createWritableAtom(0, {
          debugName: 'd25/loop',
        })
        const loopRuns = vi.fn()
        createEffect(
          () => counter.get(),
          (current: number) => {
            loopRuns()
            if (current < 10) {
              counter.set(current + 1)
            }
          },
        )

        return { counter, loopRuns, table }
      })
      const { counter, loopRuns, table } = value

      try {
        for (let i = 0; i < 20; i++) {
          flush()
        }

        expect(table.atoms.rowSelection.get()).toEqual({ 1: true })
        expect(counter.get()).toBe(10)
        expect(loopRuns.mock.calls.length).toBe(11)
        expect(warn).not.toHaveBeenCalled()
        expect(error).not.toHaveBeenCalled()
      } finally {
        dispose()
      }
    } finally {
      warn.mockRestore()
      error.mockRestore()
    }
  })

  test('D25.6 — subscribe contract: eager once, no duplicate, idempotent unsubscribe, disposal stops delivery', () => {
    const { dispose, value } = createEffectTestRoot(() => {
      const bindings = makeBindings()
      const atom = bindings.createWritableAtom('a', { debugName: 'd25/sub' })
      return { atom }
    })
    const { atom } = value

    const seen: Array<string> = []
    const subscription = atom.subscribe((current: string) =>
      seen.push(current),
    )

    // First emission is synchronous (eager), exactly once.
    expect(seen).toEqual(['a'])
    // The effect's own first delivery is deduplicated.
    settle()
    expect(seen).toEqual(['a'])

    atom.set('b')
    settle()
    expect(seen).toEqual(['a', 'b'])

    subscription.unsubscribe()
    subscription.unsubscribe()
    atom.set('c')
    settle()
    expect(seen).toEqual(['a', 'b'])

    // Owner disposal alone stops delivery for still-open subscriptions.
    const late: Array<string> = []
    atom.subscribe((current: string) => late.push(current))
    dispose()
    atom.set('d')
    settle()
    expect(late).toEqual(['c'])
  })

  test('D25.8 — interleaved external-atom write and table write converge without a loop', () => {
    // Guards constructTable's two-way sync, whose syncExternal flag assumed
    // synchronous delivery. Under deferral both writes land in one tick; the
    // last write must win on BOTH sides with no notification ping-pong.
    const externalAtom = createStoreAtom<RowSelectionState>({})
    const externalSeen = vi.fn()
    externalAtom.subscribe(() => externalSeen())

    const { dispose, value } = createEffectTestRoot(() =>
      createTable({
        data,
        columns,
        features: stockFeatures,
        getRowId: (row) => row.id,
        atoms: { rowSelection: externalAtom },
      }),
    )
    const table = value

    try {
      externalSeen.mockClear()

      externalAtom.set({ 1: true })
      table.setRowSelection({ 2: true })
      settle()

      expect(table.atoms.rowSelection.get()).toEqual({ 2: true })
      expect(externalAtom.get()).toEqual({ 2: true })
      // Bounded notification count = no ping-pong between the two sides.
      expect(externalSeen.mock.calls.length).toBeLessThanOrEqual(3)

      settle()
      expect(externalAtom.get()).toEqual({ 2: true })
      expect(table.atoms.rowSelection.get()).toEqual({ 2: true })
    } finally {
      dispose()
    }
  })

  test('rcv.3(a) — flush-around-write setOptions cost stays sane relative to coalesced state writes', () => {
    // The D14 options-store recipe drains the global queue on both sides of
    // every setOptions write (N writes = N drains, vs one coalesced drain for
    // state atoms). This bounds the regression so a pathological blowup in a
    // Solid beta fails loudly; absolute numbers land in the bead notes.
    const { dispose, value } = createEffectTestRoot(() =>
      createTable({
        data,
        columns,
        features: stockFeatures,
        getRowId: (row) => row.id,
      }),
    )
    const table = value

    try {
      const writes = 50

      const optionsStart = performance.now()
      for (let i = 0; i < writes; i++) {
        table.setOptions((prev) => prev)
      }
      const optionsMs = performance.now() - optionsStart

      const stateStart = performance.now()
      for (let i = 0; i < writes; i++) {
        table.setPageSize(10 + (i % 5))
      }
      settle()
      const stateMs = performance.now() - stateStart

      // Generous ceilings: catch orders-of-magnitude regressions only.
      expect(optionsMs).toBeLessThan(250)
      expect(stateMs).toBeLessThan(250)
    } finally {
      dispose()
    }
  })
})
