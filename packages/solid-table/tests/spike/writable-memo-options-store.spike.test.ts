/**
 * bead: table-rcv.3 — Spike: function-form createSignal writable memo as the options store
 *
 * Design refs:
 *  - D14  writable-memo options store (pull-based), keyed on debugName === 'table/optionsStore'
 *  - D13  split createRenderEffect push-sync (the fallback D14 would supersede)
 *  - D11  dev runtime throws REACTIVE_WRITE_IN_OWNED_SCOPE unless `ownedWrite: true`
 *  - D10  settle-on-read for options reads
 *
 * Runtime under test: solid-js@2.0.0-beta.29 -> @solidjs/signals@2.0.0-beta.29,
 * resolved through the `browser` / `development` conditions (the live dev
 * runtime, NOT dist/server.js which is inert).
 *
 * These are CONTRACT tests: they encode OBSERVED beta.29 behaviour so that a
 * future Solid beta bump fails loudly rather than silently changing the
 * semantics the options store would depend on.
 *
 * Implementation facts these tests pin (verified in dist/dev.js @ beta.29):
 *  - `createSignal(fn, options)` -> `[accessor(computed), setMemo.bind(null, node)]`.
 *    TWO runtime parameters only. There is NO third `initialValue` argument,
 *    despite the JSDoc example claiming
 *    `createSignal<T>(fn, initialValue?, options?)`. The type declaration
 *    (`createSignal<T>(fn: ComputeFunction<T>, options?: SignalOptions<T> &
 *    MemoOptions<T>): Signal<T>`) matches the runtime; the prose does not.
 *  - `setMemo` = `setSignal` + `suppressComputedRecompute`, which sets
 *    REACTIVE_MANUAL_WRITE and removes the node from the dirty heap.
 *  - `insertIntoHeap()` early-returns on REACTIVE_MANUAL_WRITE => a manual
 *    write beats a same-tick dependency change.
 *  - `commitPendingNode()` clears REACTIVE_MANUAL_WRITE at the end of the tick.
 *  - `read()` only calls `updateIfNecessary` when `context && tracking`, and
 *    returns `_pendingValue` only when `context` is non-null. So UNOWNED reads
 *    neither pull a dirty recompute nor observe an uncommitted write.
 *  - `setupComputedNode` ends with `!options?.lazy && recompute(self, true)`:
 *    a non-lazy writable memo computes EAGERLY at creation.
 */

import { describe, expect, it } from 'vitest'
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createRoot,
  createSignal,
  flush,
  getObserver,
  latest,
  untrack,
} from 'solid-js'

// ---------------------------------------------------------------------------
// Fixture: a miniature "options store" shaped like the table adapter's.
// `dep` stands in for reactive user props; imperative writes stand in for
// `table.setOptions(...)`.
// ---------------------------------------------------------------------------

interface Opts {
  n: number
  origin: 'compute' | 'write'
  [k: string]: unknown
}

interface Fixture {
  dep: () => number
  setDep: (n: number) => number
  options: () => Opts
  setOptions: (v: Opts | ((prev: Opts) => Opts)) => Opts
  /** every `prev` the compute function has been handed, in order */
  computePrevs: Array<Opts | undefined>
  computeRuns: () => number
}

function makeOptionsStore(signalOptions?: {
  ownedWrite?: boolean
  equals?: false | ((a: Opts, b: Opts) => boolean)
  lazy?: boolean
}): Fixture {
  const [dep, setDep] = createSignal(1)
  const computePrevs: Array<Opts | undefined> = []
  const [options, setOptions] = createSignal<Opts>(
    ((prev: Opts | undefined) => {
      computePrevs.push(prev)
      return { n: dep(), origin: 'compute' }
    }) as never,
    { name: 'table/optionsStore', ...signalOptions } as never,
  )
  return {
    dep: dep,
    setDep: setDep,
    options: options,
    setOptions: setOptions,
    computePrevs,
    computeRuns: () => computePrevs.length,
  }
}

const written = (extra: Partial<Opts> = {}): Opts => ({
  n: 99,
  origin: 'write',
  ...extra,
})

/** Read a memo from inside a real tracking scope (what JSX / memos do). */
function readTracked<T>(read: () => T): T {
  let out!: T
  const dispose = createRoot((d) => {
    const m = createMemo(read)
    out = m()
    return d
  })
  dispose()
  return out
}

// ===========================================================================
// (a) Does an imperative write persist until a dependency actually changes?
// ===========================================================================

describe('(a) an imperative write persists until the next dependency change', () => {
  it('the writable memo computes EAGERLY at creation, not on first read', () => {
    const f = makeOptionsStore()
    expect(f.computeRuns()).toBe(1)
    expect(f.options()).toEqual({ n: 1, origin: 'compute' })
    expect(f.computeRuns()).toBe(1)
  })

  it('{ lazy: true } defers the first compute to the first read', () => {
    const f = makeOptionsStore({ lazy: true })
    expect(f.computeRuns()).toBe(0)
    expect(f.options()).toEqual({ n: 1, origin: 'compute' })
    expect(f.computeRuns()).toBe(1)
  })

  it('CONTRADICTS D14: an UNOWNED read right after a write is STALE until the tick commits', () => {
    // D14 assumed "no read-after-write staleness". That holds for tracked
    // reads, NOT for reads from unowned code (event handlers, imperative APIs
    // — which is exactly where `table.options` gets read).
    const f = makeOptionsStore()
    const initial = f.options()
    const x = written()
    f.setOptions(x)

    expect(f.options()).toBe(initial) // <- stale
    expect(f.options()).not.toBe(x)

    flush()
    expect(f.options()).toBe(x) // committed, identity preserved
  })

  it('a TRACKED read right after a write is current with no flush', () => {
    const f = makeOptionsStore()
    f.options()
    const x = written()
    f.setOptions(x)
    expect(readTracked(() => f.options())).toBe(x)
  })

  it('the written value survives flush() and unrelated graph activity', () => {
    const f = makeOptionsStore()
    const x = written()
    f.setOptions(x)
    flush()
    expect(f.options()).toBe(x)

    const [other, setOther] = createSignal(0)
    const seen: Array<number> = []
    const dispose = createRoot((d) => {
      createEffect(
        () => other(),
        (v: number) => {
          seen.push(v)
        },
      )
      return d
    })
    flush()
    setOther(1)
    flush()
    setOther(2)
    flush()

    expect(seen).toEqual([0, 1, 2])
    expect(f.options()).toBe(x) // untouched by unrelated graph churn
    expect(f.computeRuns()).toBe(1) // never recomputed
    dispose()
  })

  it('repeated writes with no dependency change never recompute', () => {
    const f = makeOptionsStore()
    expect(f.computeRuns()).toBe(1)
    for (let i = 0; i < 5; i++) {
      const v = written({ n: i })
      f.setOptions(v)
      flush()
      expect(f.options()).toBe(v)
    }
    expect(f.computeRuns()).toBe(1)
  })

  it('a dependency change (in a later tick) replaces the written value', () => {
    const f = makeOptionsStore()
    f.setOptions(written())
    flush()
    f.setDep(3)
    flush()
    expect(f.options()).toEqual({ n: 3, origin: 'compute' })
    expect(f.computeRuns()).toBe(2)
  })

  it('CONTRADICTS D14: an UNOWNED read does NOT pull a dependency-driven recompute', () => {
    // Reads are only pull-based inside a tracking scope. `read()` gates
    // `updateIfNecessary` on `context && tracking`.
    const f = makeOptionsStore()
    const initial = f.options()
    f.setDep(2)
    expect(f.options()).toBe(initial) // stale, no recompute
    expect(f.computeRuns()).toBe(1)

    // A tracked read DOES pull...
    expect(readTracked(() => f.options())).toEqual({ n: 2, origin: 'compute' })
    expect(f.computeRuns()).toBe(2)
    // ...but the recompute lands in _pendingValue, so the unowned read is
    // STILL stale until the tick commits.
    expect(f.options()).toBe(initial)

    flush()
    expect(f.options()).toEqual({ n: 2, origin: 'compute' })
  })
})

// ===========================================================================
// (b) On a dependency-driven recompute, what is `prev`?
// ===========================================================================

describe('(b) prev on recompute is the last COMMITTED value — i.e. the last WRITTEN value', () => {
  it('hands the compute the manually written object (by identity) as prev', () => {
    const f = makeOptionsStore()
    const computed1 = f.options()
    expect(f.computePrevs).toEqual([undefined])

    const x = written()
    f.setOptions(x)
    flush()
    f.setDep(2)
    flush()

    expect(f.computeRuns()).toBe(2)
    expect(f.computePrevs[1]).toBe(x)
    expect(f.computePrevs[1]).not.toBe(computed1)
  })

  it('prev is the last computed value when no write happened in between', () => {
    const f = makeOptionsStore()
    const computed1 = f.options()
    f.setDep(2)
    flush()
    const computed2 = f.options()
    expect(f.computePrevs[1]).toBe(computed1)

    f.setDep(3)
    flush()
    expect(f.computePrevs[2]).toBe(computed2)
  })

  it('merge-into-prev semantics survive: table.setOptions(prev => merge(prev, next)) round-trips', () => {
    // The compute is the "recompute from reactive props, keep whatever
    // imperative state lives in prev" direction — the D14 shape.
    const [dep, setDep] = createSignal(1)
    const prevs: Array<Record<string, unknown> | undefined> = []
    const [opts, setOpts] = createSignal<Record<string, unknown>>(((
      prev: Record<string, unknown> | undefined,
    ) => {
      prevs.push(prev)
      return { ...(prev ?? {}), n: dep(), origin: 'compute' }
    }) as never)

    expect(opts()).toEqual({ n: 1, origin: 'compute' })

    setOpts((prev) => ({ ...prev, sorting: ['a'], origin: 'write' }))
    flush()
    expect(opts()).toEqual({ n: 1, origin: 'write', sorting: ['a'] })

    setDep(2)
    flush()
    // The imperative override survived the dependency-driven recompute.
    expect(opts()).toEqual({ n: 2, origin: 'compute', sorting: ['a'] })
    expect(prevs[1]).toEqual({ n: 1, origin: 'write', sorting: ['a'] })
  })
})

// ===========================================================================
// (c) Interleaving writes and dependency changes inside one tick
// ===========================================================================

describe('(c) same-tick interleaving is deterministic — the manual write always wins the tick', () => {
  it('order [set(X); setDep(2); flush] commits X and does NOT recompute', () => {
    const f = makeOptionsStore()
    const x = written()
    f.setOptions(x)
    f.setDep(2)
    flush()
    expect(f.options()).toBe(x)
    expect(f.computeRuns()).toBe(1)
  })

  it('order [setDep(2); set(X); flush] commits X and does NOT recompute', () => {
    const f = makeOptionsStore()
    const x = written()
    f.setDep(2)
    f.setOptions(x)
    flush()
    expect(f.options()).toBe(x)
    expect(f.computeRuns()).toBe(1)
  })

  it('both orders produce identical committed values and identical compute history', () => {
    const a = makeOptionsStore()
    a.setOptions(written())
    a.setDep(2)
    flush()

    const b = makeOptionsStore()
    b.setDep(2)
    b.setOptions(written())
    flush()

    expect(a.options()).toEqual(b.options())
    expect(a.computePrevs).toEqual(b.computePrevs)
    expect(a.computeRuns()).toBe(b.computeRuns())
  })

  it('is deterministic across repeated runs of both orders', () => {
    const results: Array<string> = []
    for (let i = 0; i < 3; i++) {
      const a = makeOptionsStore()
      a.setOptions(written({ n: 10 + i }))
      a.setDep(2)
      flush()
      results.push(
        `A:${a.options().n}:${a.options().origin}:${a.computeRuns()}`,
      )

      const b = makeOptionsStore()
      b.setDep(2)
      b.setOptions(written({ n: 10 + i }))
      flush()
      results.push(
        `B:${b.options().n}:${b.options().origin}:${b.computeRuns()}`,
      )
    }
    expect(results).toEqual([
      'A:10:write:1',
      'B:10:write:1',
      'A:11:write:1',
      'B:11:write:1',
      'A:12:write:1',
      'B:12:write:1',
    ])
  })

  it('HAZARD: the swallowed dependency change is PERMANENTLY lost, not deferred', () => {
    const f = makeOptionsStore()
    const x = written()
    f.setOptions(x)
    f.setDep(2)
    flush()

    expect(f.dep()).toBe(2)
    expect(f.options()).toBe(x)
    flush()
    expect(f.options()).toBe(x) // never catches up to dep === 2
    expect(f.computeRuns()).toBe(1)

    // Only the NEXT dependency change recomputes, and it jumps straight to 3.
    f.setDep(3)
    flush()
    expect(f.options()).toEqual({ n: 3, origin: 'compute' })
    expect(f.computePrevs[1]).toBe(x)
  })

  it('HAZARD restated as the adapter hits it: a props change + setOptions in one tick drops the props change', () => {
    const f = makeOptionsStore()
    f.setDep(2) // "reactive user props changed"
    f.setOptions((prev) => ({ ...prev, sorting: ['a'] })) // "table.setOptions(...)"
    flush()

    expect(f.dep()).toBe(2)
    // n is still 1: the props change never reached the merged options.
    expect(f.options()).toEqual({ n: 1, origin: 'compute', sorting: ['a'] })
    expect(f.computeRuns()).toBe(1)
  })

  it('equals: false does NOT change the swallow', () => {
    const f = makeOptionsStore({ equals: false })
    const x = written()
    f.setOptions(x)
    f.setDep(2)
    flush()
    expect(f.options()).toBe(x)
    expect(f.computeRuns()).toBe(1)
  })

  it('a tracked read between the write and the dep change does NOT avoid the swallow', () => {
    const f = makeOptionsStore()
    const x = written()
    f.setOptions(x)
    readTracked(() => f.options())
    f.setDep(2)
    flush()
    expect(f.options()).toBe(x)
    expect(f.computeRuns()).toBe(1)
  })

  it('MITIGATION 1: flush() between the write and the dep change preserves both', () => {
    const f = makeOptionsStore()
    const x = written()
    f.setOptions(x)
    flush()
    f.setDep(2)
    flush()
    expect(f.options()).toEqual({ n: 2, origin: 'compute' })
    expect(f.computeRuns()).toBe(2)
    expect(f.computePrevs[1]).toBe(x)
  })

  it('MITIGATION 2: writing from an effect APPLY phase in the same flush preserves both', () => {
    // The compute phase drains before the effect phase, so the recompute has
    // already happened by the time the imperative write lands.
    const f = makeOptionsStore()
    const seen: Array<number> = []
    const dispose = createRoot((d) => {
      createEffect(
        () => f.dep(),
        (v: number) => {
          seen.push(v)
          if (v === 2) f.setOptions((prev) => ({ ...prev, tagged: true }))
        },
      )
      return d
    })
    flush()
    f.setDep(2)
    flush()

    expect(seen).toEqual([1, 2])
    expect(f.computeRuns()).toBe(2)
    expect(f.options()).toEqual({ n: 2, origin: 'compute', tagged: true })
    flush()
    expect(f.options()).toEqual({ n: 2, origin: 'compute', tagged: true })
    dispose()
  })
})

// ===========================================================================
// (d) Owned-scope writes (the adapter's reality) + functional writes
// ===========================================================================

describe('(d) owned-scope writes and functional imperative writes', () => {
  it('set() from a createRoot body throws REACTIVE_WRITE_IN_OWNED_SCOPE without ownedWrite', () => {
    const f = makeOptionsStore()
    expect(() =>
      createRoot((dispose) => {
        try {
          f.setOptions(written())
        } finally {
          dispose()
        }
      }),
    ).toThrowError(/REACTIVE_WRITE_IN_OWNED_SCOPE/)
  })

  it('set() from inside a createMemo compute throws without ownedWrite', () => {
    const f = makeOptionsStore()
    expect(() =>
      createRoot((d) => {
        const m = createMemo(() => {
          untrack(() => f.setOptions(written()))
          return 1
        })
        try {
          m()
        } finally {
          d()
        }
      }),
    ).toThrowError(/REACTIVE_WRITE_IN_OWNED_SCOPE/)
  })

  it('ownedWrite: true works on the FUNCTION form — write from a createRoot body succeeds', () => {
    const f = makeOptionsStore({ ownedWrite: true })
    const x = written()
    createRoot((dispose) => {
      f.setOptions(x)
      dispose()
    })
    flush()
    expect(f.options()).toBe(x)
  })

  it('ownedWrite: true also permits writes from inside a createMemo compute', () => {
    const f = makeOptionsStore({ ownedWrite: true })
    const x = written({ n: 7 })
    const dispose = createRoot((d) => {
      const m = createMemo(() => {
        untrack(() => f.setOptions(x))
        return 1
      })
      m()
      return d
    })
    flush()
    expect(f.options()).toBe(x)
    dispose()
  })

  it('a write from the createEffect APPLY phase needs no ownedWrite', () => {
    const f = makeOptionsStore()
    const [tick, setTick] = createSignal(0)
    const x = written({ n: 42 })
    const dispose = createRoot((d) => {
      createEffect(
        () => tick(),
        (t: number) => {
          if (t === 1) f.setOptions(x)
        },
      )
      return d
    })
    flush()
    setTick(1)
    flush()
    expect(f.options()).toBe(x)
    dispose()
  })

  it('a write from the createRenderEffect APPLY phase needs no ownedWrite', () => {
    const f = makeOptionsStore()
    const [tick, setTick] = createSignal(0)
    const x = written({ n: 33 })
    const dispose = createRoot((d) => {
      createRenderEffect(
        () => tick(),
        (t: number) => {
          if (t === 1) f.setOptions(x)
        },
      )
      return d
    })
    flush()
    setTick(1)
    flush()
    expect(f.options()).toBe(x)
    dispose()
  })

  it('functional writes set(prev => ...) work; prev is the last COMMITTED value', () => {
    const f = makeOptionsStore()
    const computed1 = f.options()
    const seen: Array<Opts | undefined> = []

    f.setOptions((prev) => {
      seen.push(prev)
      return { ...prev, origin: 'write', tag: 'w1' }
    })
    expect(seen[0]).toBe(computed1)
    flush()
    const afterW1 = f.options()
    expect(afterW1.tag).toBe('w1')

    f.setOptions((prev) => {
      seen.push(prev)
      return { ...prev, origin: 'write', tag: 'w2' }
    })
    expect(seen[1]).toBe(afterW1)
    flush()
    expect(f.options().tag).toBe('w2')
    expect(f.options().n).toBe(1)
  })

  it('two functional writes in ONE tick chain: the second sees the first (uncommitted) value', () => {
    const f = makeOptionsStore()
    const computed1 = f.options()
    const seen: Array<Opts | undefined> = []
    f.setOptions((prev) => {
      seen.push(prev)
      return { ...prev, origin: 'write', tag: 'w1' }
    })
    f.setOptions((prev) => {
      seen.push(prev)
      return { ...prev, origin: 'write', tag: 'w2' }
    })
    flush()

    expect(seen[0]).toBe(computed1)
    expect(seen[1]).toEqual({ n: 1, origin: 'write', tag: 'w1' })
    expect(f.options()).toEqual({ n: 1, origin: 'write', tag: 'w2' })
  })

  it('HAZARD: a functional write after an UN-FLUSHED dep change sees the STALE prev and swallows the change', () => {
    const f = makeOptionsStore()
    f.setDep(5)
    const seen: Array<Opts | undefined> = []
    f.setOptions((prev) => {
      seen.push(prev)
      return { ...prev, origin: 'write' }
    })
    flush()

    expect(seen[0]).toEqual({ n: 1, origin: 'compute' }) // NOT n: 5
    expect(f.options()).toEqual({ n: 1, origin: 'write' })
    expect(f.computeRuns()).toBe(1)
  })
})

// ===========================================================================
// (e) Memo duality: do observers see BOTH causes of change?
// ===========================================================================

describe('(e) observers are notified for imperative writes and dependency recomputes alike', () => {
  it('a downstream createEffect is notified for both causes', () => {
    const f = makeOptionsStore()
    const seen: Array<string> = []
    const dispose = createRoot((d) => {
      createEffect(
        () => f.options(),
        (v: Opts) => {
          seen.push(`${v.origin}:${v.n}`)
        },
      )
      return d
    })
    flush()
    expect(seen).toEqual(['compute:1'])

    f.setOptions(written())
    flush()
    expect(seen).toEqual(['compute:1', 'write:99'])

    f.setDep(4)
    flush()
    expect(seen).toEqual(['compute:1', 'write:99', 'compute:4'])
    dispose()
  })

  it('a downstream createMemo re-derives for both causes (read from a tracking scope)', () => {
    const f = makeOptionsStore()
    let derived!: () => string
    const dispose = createRoot((d) => {
      derived = createMemo(() => `${f.options().origin}:${f.options().n}`)
      return d
    })
    expect(derived()).toBe('compute:1')

    f.setOptions(written())
    flush()
    expect(derived()).toBe('write:99')

    f.setDep(4)
    flush()
    expect(derived()).toBe('compute:4')
    dispose()
  })

  it('a same-tick write + dep change delivers exactly ONE notification (the written value)', () => {
    const f = makeOptionsStore()
    const seen: Array<string> = []
    const dispose = createRoot((d) => {
      createEffect(
        () => f.options(),
        (v: Opts) => {
          seen.push(`${v.origin}:${v.n}`)
        },
      )
      return d
    })
    flush()
    seen.length = 0

    f.setOptions(written())
    f.setDep(4)
    flush()
    expect(seen).toEqual(['write:99'])

    // The next dep change jumps straight to 5 — value 4 is never observed.
    f.setDep(5)
    flush()
    expect(seen).toEqual(['write:99', 'compute:5'])
    dispose()
  })

  it('a write of the identical reference does not notify (default equality)', () => {
    const f = makeOptionsStore()
    const seen: Array<number> = []
    const dispose = createRoot((d) => {
      createEffect(
        () => f.options(),
        (v: Opts) => {
          seen.push(v.n)
        },
      )
      return d
    })
    flush()
    f.setOptions(f.options())
    flush()
    expect(seen).toEqual([1])
    dispose()
  })

  it('writes auto-settle on a microtask: no explicit flush() needed if you await', async () => {
    const f = makeOptionsStore()
    const x = written({ n: 77 })
    f.setOptions(x)
    expect(f.options()).not.toBe(x) // sync read is stale
    await Promise.resolve()
    expect(f.options()).toBe(x)
  })

  it('dependency changes also auto-settle on a microtask', async () => {
    const f = makeOptionsStore()
    f.setDep(3)
    await Promise.resolve()
    expect(f.options()).toEqual({ n: 3, origin: 'compute' })
    expect(f.computeRuns()).toBe(2)
  })

  it('effects auto-settle on a macrotask without an explicit flush()', async () => {
    const f = makeOptionsStore()
    const seen: Array<string> = []
    const dispose = createRoot((d) => {
      createEffect(
        () => f.options(),
        (v: Opts) => {
          seen.push(`${v.origin}:${v.n}`)
        },
      )
      return d
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual(['compute:1'])

    f.setOptions(written({ n: 55 }))
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual(['compute:1', 'write:55'])
    dispose()
  })
})

// ===========================================================================
// (f) The D14 implementation recipe, validated end to end.
//     createWritableAtom special-cases debugName === 'table/optionsStore' and
//     returns this shape.
// ===========================================================================

describe('(f) D14 implementation recipe: ownedWrite + flush-before-write + settle-on-read', () => {
  function makeOptionsAtom() {
    const [dep, setDep] = createSignal(1)
    const computePrevs: Array<Record<string, unknown> | undefined> = []
    const [raw, setRaw] = createSignal<Record<string, unknown>>(
      ((prev: Record<string, unknown> | undefined) => {
        computePrevs.push(prev)
        return { ...(prev ?? {}), n: dep(), origin: 'compute' }
      }) as never,
      { name: 'table/optionsStore', ownedWrite: true } as never,
    )
    return {
      dep,
      setDep,
      computePrevs,
      /** D10 settle-on-read: only flush when the read is NOT tracked. */
      get: () => {
        if (!getObserver()) flush()
        return raw()
      },
      /**
       * flush-AROUND-write. Both halves are load-bearing:
       *  - the leading flush lands any pending dependency recompute so the
       *    updater's `prev` is fresh;
       *  - the trailing flush commits the write and clears REACTIVE_MANUAL_WRITE
       *    so a dependency change later in the same tick is not swallowed.
       */
      set: (
        updater: (prev: Record<string, unknown>) => Record<string, unknown>,
      ) => {
        flush()
        const out = setRaw(updater as never)
        flush()
        return out
      },
    }
  }

  it('settle-on-read makes unowned reads current after a write', () => {
    const a = makeOptionsAtom()
    a.set((prev) => ({ ...prev, sorting: ['a'], origin: 'write' }))
    expect(a.get()).toEqual({ n: 1, origin: 'write', sorting: ['a'] })
  })

  it('settle-on-read makes unowned reads current after a dependency change', () => {
    const a = makeOptionsAtom()
    a.get()
    a.setDep(4)
    expect(a.get()).toEqual({ n: 4, origin: 'compute' })
  })

  it('a LEADING flush alone is NOT enough — the trailing flush is required', () => {
    // Documents why `set` flushes on both sides: with only a leading flush,
    // REACTIVE_MANUAL_WRITE is still set when the later setDep lands, and the
    // dependency change is dropped.
    const [dep, setDep] = createSignal(1)
    const [raw, setRaw] = createSignal<Record<string, unknown>>(
      ((prev: Record<string, unknown> | undefined) => ({
        ...(prev ?? {}),
        n: dep(),
        origin: 'compute',
      })) as never,
      { name: 'table/optionsStore', ownedWrite: true } as never,
    )
    const leadingFlushOnly = (u: (p: any) => any) => {
      flush()
      return setRaw(u as never)
    }
    leadingFlushOnly((prev: any) => ({ ...prev, sorting: ['b'] }))
    setDep(2)
    flush()
    expect(raw()).toEqual({ n: 1, origin: 'compute', sorting: ['b'] }) // n stayed 1
  })

  it('flush-around-write removes the same-tick swallow hazard in BOTH orders', () => {
    const a = makeOptionsAtom()
    a.get()
    a.setDep(2)
    a.set((prev) => ({ ...prev, sorting: ['a'] }))
    expect(a.get()).toEqual({ n: 2, origin: 'compute', sorting: ['a'] })

    const b = makeOptionsAtom()
    b.get()
    b.set((prev) => ({ ...prev, sorting: ['b'] }))
    b.setDep(2)
    expect(b.get()).toEqual({ n: 2, origin: 'compute', sorting: ['b'] })
  })

  it('writes from an owned scope (component body) are legal thanks to ownedWrite', () => {
    const a = makeOptionsAtom()
    createRoot((dispose) => {
      a.set((prev) => ({ ...prev, fromComponent: true }))
      dispose()
    })
    expect(a.get()).toMatchObject({ n: 1, fromComponent: true })
  })

  it('tracked reads never trigger the flush and stay current on their own', () => {
    const a = makeOptionsAtom()
    a.get()
    let observedInside: unknown
    const x = { n: 123, origin: 'write' }
    // Write outside, then read from a tracking scope with no flush in between.
    createRoot((d) => {
      d()
    })
    a.set(() => x)
    const dispose = createRoot((d) => {
      const m = createMemo(() => {
        expect(getObserver()).not.toBeNull()
        observedInside = a.get()
        return 1
      })
      m()
      return d
    })
    expect(observedInside).toEqual(x)
    dispose()
  })

  it('the recipe survives a set() issued from an effect APPLY phase (re-entrant flush)', () => {
    const a = makeOptionsAtom()
    const [tick, setTick] = createSignal(0)
    const dispose = createRoot((d) => {
      createEffect(
        () => tick(),
        (t: number) => {
          if (t === 1) a.set((prev) => ({ ...prev, fromEffect: true }))
        },
      )
      return d
    })
    flush()
    setTick(1)
    flush()
    expect(a.get()).toMatchObject({ n: 1, fromEffect: true })

    a.setDep(6)
    expect(a.get()).toMatchObject({ n: 6, fromEffect: true })
    dispose()
  })

  it('latest() is an alternative unowned escape hatch (pulls, but does not commit)', () => {
    const f = makeOptionsStore()
    const initial = f.options()
    f.setDep(7)
    expect(latest(() => f.options())).toEqual({ n: 7, origin: 'compute' })
    expect(f.computeRuns()).toBe(2)
    // latest() does NOT commit: a following plain unowned read is still stale.
    expect(f.options()).toBe(initial)
    flush()
    expect(f.options()).toEqual({ n: 7, origin: 'compute' })
  })
})
