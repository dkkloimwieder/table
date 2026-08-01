import { expect, it } from 'vitest'
import { createEffect, createRoot, createSignal, flush } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'

// Note: writes INSIDE an owned scope (createRoot/component/computation) throw
// [REACTIVE_WRITE_IN_OWNED_SCOPE] in the dev runtime unless the signal sets
// `ownedWrite: true` — this is design ref D11. Writes here happen outside.
it('resolves the live reactive runtime (not the inert server build)', () => {
  let s!: Accessor<number>
  let set!: Setter<number>
  let runs = 0
  const seen: Array<number> = []
  createRoot(() => {
    ;[s, set] = createSignal(0)
    createEffect(
      () => s(),
      (v: number) => {
        runs++
        seen.push(v)
      },
    )
  })
  flush()
  expect(runs).toBeGreaterThan(0)
  const runsAfterFirstFlush = runs
  set(1)
  flush()
  expect(runs).toBe(runsAfterFirstFlush + 1)
  expect(seen[seen.length - 1]).toBe(1)
})
