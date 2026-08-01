/**
 * Spike contract test — bead `table-rcv.2` (companion file)
 * "the effect half's return value is a cleanup slot, and violating it halts everything"
 *
 * Pinned runtime: solid-js@2.0.0-beta.29 / @solidjs/signals@2.0.0-beta.29, dev build.
 *
 * WHY THIS IS ITS OWN FILE: the failure under test permanently halts the reactive
 * system for the whole module instance ([REACTIVITY_HALTED] — `schedule()` returns
 * early forever after). Any test co-located after it would silently observe a dead
 * runtime. Keep this file to exactly one test.
 *
 * Design refs: D4/D5 — the subscribe bridge's effect half calls the subscriber's
 * listener. If it is written as `v => listener(v)` (expression body) and the
 * listener returns anything that is not `undefined` or a function — e.g. TanStack
 * Table's own notify helpers, or a plain `arr.push(v)` — the dev runtime throws and
 * kills the app's reactivity. The bridge MUST use a block body that returns nothing.
 */
import { expect, it } from 'vitest'
import { createEffect, createRoot, createSignal, flush } from 'solid-js'

it('throws and permanently halts the reactive system when the effect half returns a non-function, non-undefined value', () => {
  const seen: Array<number> = []

  createRoot(() => {
    const [s] = createSignal(0)
    createEffect(
      () => s(),
      // `Array.prototype.push` returns a number — the exact shape an
      // expression-bodied `v => listener(v)` bridge would produce.
      (v: number) => seen.push(v) as unknown as void,
    )
  })

  expect(() => flush()).toThrow(
    /callback returned an invalid cleanup value\. Return a cleanup function or undefined\./,
  )
  // The effect body itself DID run before the guard rejected its return value.
  expect(seen).toEqual([0])

  // The halt is global and permanent for this module instance: a brand new,
  // well-formed effect created afterwards never runs at all.
  const later: Array<number> = []
  let set!: (v: number) => unknown
  createRoot(() => {
    const [s, setS] = createSignal(0)
    set = setS
    createEffect(
      () => s(),
      (v: number) => {
        later.push(v)
      },
    )
  })
  flush()
  set(1)
  flush()
  expect(later).toEqual([])
})
