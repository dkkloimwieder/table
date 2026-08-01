/**
 * Spike contract tests — bead `table-rcv.2`
 * "two-arg createEffect timing, defer and sync options"
 *
 * Pinned runtime: solid-js@2.0.0-beta.29 (delegates to @solidjs/signals@2.0.0-beta.29),
 * live dev runtime (vitest resolve.conditions ['browser','development']).
 *
 * These are PERMANENT contract tests. They exist so that a future Solid 2 beta bump
 * fails loudly if any of the timing guarantees the adapter's subscribe bridge relies
 * on changes underneath us.
 *
 * Design refs:
 *   D4  — subscribe bridge = two-arg createEffect inside a nested createRoot under
 *         the table's owner.
 *   D5  — manual eager first emission guarded by `emitted && Object.is(last, next)`,
 *         instead of relying on `{ defer: true }`.
 *   D6  — unsubscribe = call the nested root's dispose; must tolerate double dispose.
 *   D11 — writes inside an owned scope hard-throw unless the signal opts in with
 *         `{ ownedWrite: true }`.
 *   D21 — devtools hook relies on effect-half cleanup running on owner disposal.
 *
 * OBSERVED-BEHAVIOUR NOTES (these contradict assumptions the bead was written under —
 * the assertions below encode reality, not the assumption):
 *   1. `EffectOptions.sync` is NOT "deliver every intermediate write synchronously".
 *      Per the shipped .d.ts it is an *async-shape assertion* ("asserts the compute
 *      function returns synchronous values only ... Skips the async-shape probe in
 *      `recompute`"). Delivery timing and coalescing are byte-for-byte identical to
 *      the default. See describe (c).
 *   2. The effect half must return `undefined` or a cleanup function. Returning any
 *      other value (e.g. the number from `arr.push(v)`) throws
 *      "effect callback returned an invalid cleanup value" and PERMANENTLY HALTS the
 *      reactive system. Covered in `effect-cleanup-return.spike.test.ts`, which is a
 *      separate file precisely because the halt is process-module-wide.
 */
import { describe, expect, it } from 'vitest'
import {
  createEffect,
  createRoot,
  createSignal,
  flush,
  getOwner,
  onCleanup,
  runWithOwner,
  untrack,
} from 'solid-js'
import type { Owner } from 'solid-js'

// Loose local aliases: the spike deliberately pokes at the runtime rather than
// modelling it, and Setter<T>'s overload set fights `let set!: Setter<number>`.
type Get<T> = () => T
type Set<T> = (v: T | ((prev: T) => T)) => unknown

describe('(a) two-arg createEffect first-run timing', () => {
  it('runs the compute half exactly once at creation and the effect half not at all', () => {
    let computeRuns = 0
    const seen: Array<number> = []
    let insideRootBody!: { computeRuns: number; seen: Array<number> }

    createRoot(() => {
      const [s] = createSignal(0)
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
      )
      insideRootBody = { computeRuns, seen: [...seen] }
    })

    // Observed at the end of the createRoot body...
    expect(insideRootBody).toEqual({ computeRuns: 1, seen: [] })
    // ...and still after createRoot returns: creation does not run the effect half.
    expect(computeRuns).toBe(1)
    expect(seen).toEqual([])
  })

  it('runs the effect half for the first time at the first explicit flush()', () => {
    let computeRuns = 0
    const seen: Array<number> = []
    let set!: Set<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
      )
    })

    flush()
    // First delivery carries the value the compute half produced at creation time.
    expect(seen).toEqual([0])
    expect(computeRuns).toBe(1)

    set(1)
    // A write alone does not deliver: the effect is queued, not run.
    expect(seen).toEqual([0])

    flush()
    expect(seen).toEqual([0, 1])
    expect(computeRuns).toBe(2)
  })

  it('runs the effect half on a plain awaited microtask with no explicit flush', async () => {
    let computeRuns = 0
    const seen: Array<number> = []

    createRoot(() => {
      const [s] = createSignal(7)
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
      )
    })

    // Synchronously after creation: nothing delivered.
    expect(seen).toEqual([])

    // The runtime auto-schedules `queueMicrotask(flush)`, so one awaited microtask
    // is enough — no explicit flush() and no macrotask needed.
    await Promise.resolve()
    expect(seen).toEqual([7])
    expect(computeRuns).toBe(1)

    // A macrotask turn adds nothing further.
    await new Promise((r) => setTimeout(r, 0))
    expect(seen).toEqual([7])
  })

  it('runs the effect half in a writable scope: a plain setter inside it does not throw (no ownedWrite needed)', () => {
    const seen: Array<number> = []
    let effectPhaseError: unknown = null
    let set!: Set<number>
    let readT!: Get<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      const [t, setT] = createSignal(100)
      set = setS
      readT = t
      createEffect(
        () => s(),
        (v: number) => {
          try {
            // Plain signal, NO { ownedWrite: true } — legal in the effect half.
            setT(v + 1)
            seen.push(v)
          } catch (e) {
            effectPhaseError = e
          }
        },
      )
    })

    flush()
    set(5)
    flush()

    expect(effectPhaseError).toBeNull()
    expect(seen).toEqual([0, 5])
    expect(readT()).toBe(6)
  })

  it('D11: a plain setter called in the createRoot body hard-throws; { ownedWrite: true } suppresses it', () => {
    let plainError: unknown = null
    let ownedError: unknown = null
    let readB!: Get<number>

    createRoot(() => {
      const [, setA] = createSignal(0)
      try {
        setA(1)
      } catch (e) {
        // Caught INSIDE the owned scope on purpose: letting this escape would
        // unwind through the runtime and can halt the reactive system.
        plainError = e
      }

      const [b, setB] = createSignal(0, { ownedWrite: true })
      readB = b
      try {
        setB(1)
      } catch (e) {
        ownedError = e
      }
    })

    expect(String(plainError)).toContain('[REACTIVE_WRITE_IN_OWNED_SCOPE]')
    expect(ownedError).toBeNull()
    flush()
    expect(readB()).toBe(1)
  })
})

describe('(b) { defer: true } semantics', () => {
  it('skips the initial effect invocation entirely, but still runs the compute half once at creation', () => {
    let computeRuns = 0
    const seen: Array<number> = []

    createRoot(() => {
      const [s] = createSignal(0)
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
        { defer: true },
      )
    })

    expect(computeRuns).toBe(1)
    expect(seen).toEqual([])
    flush()
    // The first run is skipped, not merely postponed.
    expect(seen).toEqual([])
    expect(computeRuns).toBe(1)
  })

  it('order (create, flush, write, flush): the write IS delivered', () => {
    let computeRuns = 0
    const seen: Array<number> = []
    let set!: Set<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
        { defer: true },
      )
    })

    flush()
    expect(seen).toEqual([])

    set(1)
    flush()
    expect(seen).toEqual([1])
    expect(computeRuns).toBe(2)

    set(2)
    flush()
    expect(seen).toEqual([1, 2])
    expect(computeRuns).toBe(3)
  })

  it('order (create, write, flush) with no flush in between: the write is NOT folded into the skipped first run', () => {
    let computeRuns = 0
    const seen: Array<number> = []
    let set!: Set<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
        { defer: true },
      )
    })

    set(1)
    expect(seen).toEqual([])

    flush()
    // Identical to the (create, flush, write, flush) ordering: exactly one
    // delivery carrying the written value. `defer` only ever eats the initial run.
    expect(seen).toEqual([1])
    expect(computeRuns).toBe(2)

    set(2)
    flush()
    expect(seen).toEqual([1, 2])
    expect(computeRuns).toBe(3)
  })

  it('D5 rationale: with { defer: true } a source that never changes value delivers NOTHING, ever', () => {
    const seen: Array<number> = []
    let set!: Set<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => s(),
        (v: number) => {
          seen.push(v)
        },
        { defer: true },
      )
    })

    // Writing the SAME value is deduped by signal equality, so it is not a "change"
    // and does not resurrect the skipped first run.
    set(0)
    flush()
    expect(seen).toEqual([])

    set(1)
    flush()
    expect(seen).toEqual([1])
  })
})

describe('(c) { sync: true } semantics', () => {
  it('does NOT deliver intermediate writes: three writes in one tick coalesce to one delivery of the last value', () => {
    let computeRuns = 0
    const seen: Array<number> = []
    let set!: Set<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
        { sync: true },
      )
    })

    flush()
    expect(seen).toEqual([0])

    set(1)
    set(2)
    set(3)
    expect(seen).toEqual([0])

    flush()
    // Intermediates 1 and 2 are never delivered, and the compute half runs once
    // for the whole batch.
    expect(seen).toEqual([0, 3])
    expect(computeRuns).toBe(2)
  })

  it('has the same first-run timing as the default: not at creation, first at flush', () => {
    let computeRuns = 0
    const seen: Array<number> = []

    createRoot(() => {
      const [s] = createSignal(0)
      createEffect(
        () => {
          computeRuns++
          return s()
        },
        (v: number) => {
          seen.push(v)
        },
        { sync: true },
      )
    })

    expect(computeRuns).toBe(1)
    expect(seen).toEqual([])
    flush()
    expect(seen).toEqual([0])
  })

  it('matches the default option-less effect exactly; only an explicit flush between writes yields per-write delivery', () => {
    const mk = () => {
      const seen: Array<number> = []
      let set!: Set<number>
      createRoot(() => {
        const [s, setS] = createSignal(0)
        set = setS
        createEffect(
          () => s(),
          (v: number) => {
            seen.push(v)
          },
        )
      })
      flush()
      return { seen, set }
    }

    const plain = mk()
    plain.set(1)
    plain.set(2)
    plain.set(3)
    flush()
    expect(plain.seen).toEqual([0, 3])

    // flush(fn) makes the WRITES drain synchronously at callback exit — it still
    // coalesces them into one delivery, it does not replay intermediates.
    const wrapped = mk()
    flush(() => {
      wrapped.set(1)
      wrapped.set(2)
      wrapped.set(3)
    })
    expect(wrapped.seen).toEqual([0, 3])

    // The only way to observe intermediates is a flush per write.
    const stepped = mk()
    stepped.set(1)
    flush()
    stepped.set(2)
    flush()
    stepped.set(3)
    flush()
    expect(stepped.seen).toEqual([0, 1, 2, 3])
  })

  it('composes with { defer: true }', () => {
    const seen: Array<number> = []
    let set!: Set<number>

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => s(),
        (v: number) => {
          seen.push(v)
        },
        { sync: true, defer: true },
      )
    })

    flush()
    expect(seen).toEqual([])
    set(1)
    flush()
    expect(seen).toEqual([1])
  })
})

describe('(d) cleanup + disposal contract', () => {
  it('runs the effect-half cleanup before the next effect invocation and on owner dispose, and stops firing after dispose', () => {
    const log: Array<string> = []
    let set!: Set<number>
    let dispose!: () => void

    createRoot((d) => {
      dispose = d
      const [s, setS] = createSignal(0)
      set = setS
      createEffect(
        () => {
          onCleanup(() => log.push('computeCleanup'))
          return s()
        },
        (v: number) => {
          log.push('effect:' + v)
          return () => log.push('effectCleanup:' + v)
        },
      )
    })

    flush()
    expect(log).toEqual(['effect:0'])

    set(1)
    flush()
    // Compute-half onCleanup fires first, then the effect-half cleanup, then the
    // next effect invocation.
    expect(log).toEqual([
      'effect:0',
      'computeCleanup',
      'effectCleanup:0',
      'effect:1',
    ])

    dispose()
    expect(log).toEqual([
      'effect:0',
      'computeCleanup',
      'effectCleanup:0',
      'effect:1',
      'computeCleanup',
      'effectCleanup:1',
    ])

    // Disposed: further writes deliver nothing.
    const afterDispose = [...log]
    set(2)
    flush()
    expect(log).toEqual(afterDispose)
  })

  it('D6: disposing a nested createRoot stops only that effect; the outer owner stays live', () => {
    const outer: Array<number> = []
    const inner: Array<number> = []
    const innerCleanups: Array<string> = []
    let set!: Set<number>
    let innerDispose!: () => void

    createRoot(() => {
      const [s, setS] = createSignal(0)
      set = setS

      createEffect(
        () => s(),
        (v: number) => {
          outer.push(v)
        },
      )

      createRoot((d) => {
        innerDispose = d
        createEffect(
          () => s(),
          (v: number) => {
            inner.push(v)
            return () => innerCleanups.push('cleanup:' + v)
          },
        )
      })
    })

    flush()
    expect(outer).toEqual([0])
    expect(inner).toEqual([0])
    expect(innerCleanups).toEqual([])

    set(1)
    flush()
    expect(outer).toEqual([0, 1])
    expect(inner).toEqual([0, 1])
    expect(innerCleanups).toEqual(['cleanup:0'])

    innerDispose()
    // Disposal runs the pending effect-half cleanup.
    expect(innerCleanups).toEqual(['cleanup:0', 'cleanup:1'])

    set(2)
    flush()
    expect(inner).toEqual([0, 1])
    expect(outer).toEqual([0, 1, 2])
  })

  it('parents a nested createRoot to the enclosing owner: disposing the OUTER root alone stops the nested effect', () => {
    const seen: Array<number> = []
    let set!: Set<number>
    let outerDispose!: () => void
    let innerDispose!: () => void
    let innerOwner: Owner | null = null
    let outerOwner: Owner | null = null

    createRoot((od) => {
      outerDispose = od
      outerOwner = getOwner()
      const [s, setS] = createSignal(0)
      set = setS
      createRoot((id) => {
        innerDispose = id
        innerOwner = getOwner()
        createEffect(
          () => s(),
          (v: number) => {
            seen.push(v)
          },
        )
      })
    })

    expect(innerOwner).not.toBeNull()
    expect((innerOwner as unknown as { _parent: unknown })._parent).toBe(
      outerOwner,
    )

    flush()
    expect(seen).toEqual([0])

    outerDispose()
    set(1)
    flush()
    expect(seen).toEqual([0])

    // Double dispose tolerance: the nested dispose after the owner already tore it
    // down, and repeated calls, must not throw (D6 unsubscribe-after-unmount).
    expect(() => innerDispose()).not.toThrow()
    expect(() => innerDispose()).not.toThrow()
    expect(() => outerDispose()).not.toThrow()
  })
})

describe('(D4/D5) subscribe-bridge shape end to end', () => {
  /** The planned adapter bridge, written exactly as D4 + D5 specify. */
  const makeBridge = <T>(
    tableOwner: Owner,
    atom: Get<T>,
    listener: (v: T) => void,
  ) => {
    let emitted = false
    let last: T | undefined
    const emit = (v: T) => {
      if (emitted && Object.is(last, v)) return
      emitted = true
      last = v
      listener(v)
    }

    let dispose!: () => void
    runWithOwner(tableOwner, () => {
      createRoot((d) => {
        dispose = d
        createEffect(
          () => atom(),
          (v: T) => {
            emit(v)
          },
        )
      })
    })

    // D5: manual eager first emission — the effect half will not run until the
    // next flush, and { defer: true } would swallow the initial value entirely.
    emit(untrack(atom))

    return () => dispose()
  }

  it('emits synchronously at subscribe time and the dedup guard swallows the effect half first run', () => {
    const seen: Array<number> = []
    let tableOwner!: Owner
    let set!: Set<number>
    let atom!: Get<number>
    let disposeTable!: () => void

    createRoot((d) => {
      disposeTable = d
      tableOwner = getOwner() as Owner
      const [s, setS] = createSignal(0)
      atom = s
      set = setS
    })

    const unsubscribe = makeBridge(tableOwner, atom, (v) => seen.push(v))

    // Eager first emission is synchronous — no flush, no microtask.
    expect(seen).toEqual([0])

    flush()
    // The effect half's own first run delivers 0 again; `emitted && Object.is`
    // suppresses the duplicate.
    expect(seen).toEqual([0])

    set(1)
    flush()
    expect(seen).toEqual([0, 1])

    // Same-value write: coalesced by signal equality before it reaches the guard.
    set(1)
    flush()
    expect(seen).toEqual([0, 1])

    unsubscribe()
    set(2)
    flush()
    expect(seen).toEqual([0, 1])

    // D6: unsubscribe is idempotent, and survives the table owner going away.
    expect(() => unsubscribe()).not.toThrow()
    disposeTable()
    expect(() => unsubscribe()).not.toThrow()
  })

  it('stops emitting when the table owner is disposed without an explicit unsubscribe', () => {
    const seen: Array<number> = []
    let tableOwner!: Owner
    let set!: Set<number>
    let atom!: Get<number>
    let disposeTable!: () => void

    createRoot((d) => {
      disposeTable = d
      tableOwner = getOwner() as Owner
      const [s, setS] = createSignal(0)
      atom = s
      set = setS
    })

    const unsubscribe = makeBridge(tableOwner, atom, (v) => seen.push(v))
    flush()
    set(1)
    flush()
    expect(seen).toEqual([0, 1])

    disposeTable()
    set(2)
    flush()
    expect(seen).toEqual([0, 1])
    expect(() => unsubscribe()).not.toThrow()
  })
})
