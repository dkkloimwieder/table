/**
 * bead: table-rcv.1 — Spike: Solid 2 pending-write semantics
 * (staleness, functional prev, flush cost)
 *
 * Design refs:
 *   D3  — A1 (Solid-native signal atoms) vs A2 (store bridge, wrapExternalAtoms:false)
 *   D7  — delegate functional updates to Solid's setter
 *   D10 — settle-on-imperative-read (D10-A: settling get() on every table API call)
 *   D11 — writes inside owned scopes require `ownedWrite: true`
 *
 * Pinned against solid-js@2.0.0-beta.29 (delegates to @solidjs/signals@2.0.0-beta.29).
 * Every assertion below encodes OBSERVED runtime behavior, not the design
 * assumption it was written to check. A future Solid beta bump that changes
 * these semantics MUST fail this file loudly.
 *
 * Real-world patterns this file protects (TanStack table-core, branch beta):
 *   packages/table-core/src/core/table/coreTablesFeature.utils.ts:51
 *     -> untracked `baseAtom.get()` interleaved with same-batch `baseAtom.set()`
 *   packages/table-core/src/features/column-resizing/columnResizingFeature.utils.ts:222-238
 *     -> two consecutive functional `set(old => ...)` calls in one synchronous
 *        run that must see each other
 *
 * Runtime notes for anyone editing this file:
 *   - The vitest config routes solid-js through the `browser`/`development`
 *     export conditions. The default `node` condition resolves to an INERT
 *     server build where effects never run and reads are plain.
 *   - An effect callback must return a cleanup function or undefined. Returning
 *     anything else (e.g. `v => arr.push(v)`) throws and HALTS the reactive
 *     system for the whole test file.
 *   - Plain signal writes inside an owned scope throw REACTIVE_WRITE_IN_OWNED_SCOPE
 *     unless the signal opts in with `{ ownedWrite: true }` (D11).
 */
import { describe, expect, it } from 'vitest'
import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  isPending,
  latest,
  untrack,
} from 'solid-js'

// ---------------------------------------------------------------------------

describe('(a) imperative reads after set() are stale until flush()', () => {
  it('a plain read outside any scope returns the last COMMITTED value', () => {
    const [s, set] = createSignal(0)
    set(1)
    expect(s()).toBe(0) // stale — the write is queued, not committed
    flush()
    expect(s()).toBe(1)
  })

  it('untrack() does NOT settle — it reads the same stale value', () => {
    const [s, set] = createSignal(0)
    set(1)
    expect(untrack(() => s())).toBe(0)
    expect(s()).toBe(0)
    flush()
    expect(untrack(() => s())).toBe(1)
  })

  it('flush() followed by a read is the settling read (D10-A)', () => {
    const [s, set] = createSignal(0)
    set(1)
    flush()
    expect(untrack(() => s())).toBe(1)
  })

  it('flush(fn) does NOT settle before fn runs: the drain happens AFTER fn returns', () => {
    const [s, set] = createSignal(0)
    set(1)
    // The callback overload is a "run these writes then drain" scope, not a
    // "settle then read" helper. Reads inside fn still see the old value.
    expect(flush(() => s())).toBe(0)
    expect(s()).toBe(1) // drained on return
  })

  it('latest() returns the PENDING value synchronously, without flushing', () => {
    const [s, set] = createSignal(0)
    set(1)
    expect(latest(() => s())).toBe(1)
    expect(s()).toBe(0) // still uncommitted; latest() did not drain the queue
    expect(untrack(() => latest(() => s()))).toBe(1)
    expect(latest(() => untrack(() => s()))).toBe(1)
    flush()
    expect(s()).toBe(1)
  })

  it('isPending() reports the pending window', () => {
    const [s, set] = createSignal(0)
    expect(isPending(() => s())).toBe(false)
    set(1)
    expect(isPending(() => s())).toBe(true)
    flush()
    expect(isPending(() => s())).toBe(false)
  })

  it('mirrors coreTablesFeature.utils.ts:51 — an untracked get() after a same-run set() reads stale', () => {
    // table_syncExternalStateToBaseAtoms reads `untrack(() => baseAtom.get())`
    // and only writes when it differs from the incoming external state. If the
    // same slice is synced twice in one synchronous run, the second read does
    // not observe the first write.
    const [get, set] = createSignal('a')
    const writes: Array<string> = []
    const sync = (external: string) => {
      const current = untrack(() => get())
      if (current !== external) {
        writes.push(external)
        set(() => external)
      }
    }
    sync('b')
    sync('b') // would be skipped if the read saw the pending write
    expect(writes).toEqual(['b', 'b']) // OBSERVED: guard re-fires
    flush()
    expect(get()).toBe('b')

    // A flush() between the calls restores the intended guard behavior.
    const [get2, set2] = createSignal('a')
    const writes2: Array<string> = []
    const syncSettled = (external: string) => {
      flush()
      const current = untrack(() => get2())
      if (current !== external) {
        writes2.push(external)
        set2(() => external)
      }
    }
    syncSettled('b')
    syncSettled('b')
    expect(writes2).toEqual(['b'])
  })
})

// ---------------------------------------------------------------------------

describe('(b) memo reads during the pending window', () => {
  it('an OWNED memo returns the last committed value until flush()', () => {
    let s!: () => number
    let set!: (v: number) => unknown
    let m!: () => number
    createRoot(() => {
      const sig = createSignal(0)
      s = sig[0]
      set = sig[1] as (v: number) => unknown
      m = createMemo(() => s() * 10)
    })
    expect(m()).toBe(0)
    set(1)
    expect(m()).toBe(0) // stale
    expect(untrack(() => m())).toBe(0) // untrack does not settle it either
    expect(s()).toBe(0)
    flush()
    expect(m()).toBe(10)
    expect(s()).toBe(1)
  })

  it('an OBSERVED memo returns the last committed value until flush()', () => {
    let s!: () => number
    let set!: (v: number) => unknown
    let m!: () => number
    createRoot(() => {
      const sig = createSignal(0)
      s = sig[0]
      set = sig[1] as (v: number) => unknown
      m = createMemo(() => s() * 10)
      createEffect(
        () => m(),
        () => {},
      )
    })
    flush()
    expect(m()).toBe(0)
    set(1)
    expect(m()).toBe(0)
    expect(untrack(() => m())).toBe(0)
    flush()
    expect(m()).toBe(10)
  })

  it('TEARING: an UNOWNED memo that already computed recomputes eagerly and returns the PENDING value', () => {
    // This is the sharpest edge found in this spike. An unowned memo (created
    // outside any createRoot / owner) that has a cached value recomputes on
    // read against the *pending* source value, while a direct read of that
    // same source still returns the committed value in the same instant.
    const [s, set] = createSignal(0)
    const m = createMemo(() => s() * 10)
    expect(m()).toBe(0) // prime the cache
    set(1)
    expect(m()).toBe(10) // derived from the PENDING 1
    expect(s()).toBe(0) // ...while the source still reads the COMMITTED 0
    flush()
    expect(m()).toBe(10)
    expect(s()).toBe(1)
  })

  it('TEARING is read-order independent', () => {
    const mk = () => {
      const [s, set] = createSignal(0)
      const m = createMemo(() => s() * 10)
      m()
      set(1)
      return { s, m }
    }
    const a = mk()
    const sigFirst = { sig: a.s(), memo: a.m() }
    const b = mk()
    const memoFirst = { memo: b.m(), sig: b.s() }
    expect(sigFirst).toEqual({ sig: 0, memo: 10 })
    expect(memoFirst).toEqual({ memo: 10, sig: 0 })
  })

  it('an unowned memo that has NEVER computed returns the committed-derived value', () => {
    const [s, set] = createSignal(0)
    const m = createMemo(() => s() * 10)
    set(1) // no read before the write -> nothing cached, nothing marked
    expect(m()).toBe(0)
    expect(s()).toBe(0)
    flush()
    expect(m()).toBe(10)
  })

  it('unowned memo chains propagate the pending value through every link', () => {
    const [s, set] = createSignal(0)
    const a = createMemo(() => s() + 1)
    const b = createMemo(() => a() * 10)
    expect(b()).toBe(10)
    set(1)
    expect(b()).toBe(20)
    expect(a()).toBe(2)
    expect(s()).toBe(0)
  })

  it('latest() forces even an observed memo to its pending value', () => {
    let s!: () => number
    let set!: (v: number) => unknown
    let m!: () => number
    createRoot(() => {
      const sig = createSignal(0)
      s = sig[0]
      set = sig[1] as (v: number) => unknown
      m = createMemo(() => s() * 10)
      createEffect(
        () => m(),
        () => {},
      )
    })
    flush()
    set(1)
    expect(m()).toBe(0)
    expect(latest(() => m())).toBe(10)
    expect(latest(() => s())).toBe(1)
    expect(isPending(() => m())).toBe(true)
    flush()
    expect(m()).toBe(10)
  })
})

// ---------------------------------------------------------------------------

describe("(c) the functional setter's prev sees pending (uncommitted) writes", () => {
  it('two back-to-back set(v => v + 1) commit +2 — prev saw the pending write', () => {
    const [c, setC] = createSignal(0)
    setC((v) => v + 1)
    setC((v) => v + 1)
    expect(c()).toBe(0) // read is still stale in the pending window
    flush()
    expect(c()).toBe(2) // +2, NOT +1 => prev is pending-aware
  })

  it('a stale read interleaved between the two writes does not reset prev', () => {
    const [c, setC] = createSignal(0)
    setC((v) => v + 1)
    expect(c()).toBe(0)
    setC((v) => v + 1)
    expect(c()).toBe(0)
    flush()
    expect(c()).toBe(2)
  })

  it('latest() observes each pending functional write as it lands', () => {
    const [c, setC] = createSignal(0)
    setC((v) => v + 1)
    expect(latest(() => c())).toBe(1)
    setC((v) => v + 1)
    expect(latest(() => c())).toBe(2)
    flush()
    expect(c()).toBe(2)
  })

  it('columnResizingFeature mirror: two functional object writes to the SAME signal in one synchronous run', () => {
    // columnResizingFeature.utils.ts:222-238 — inside one batch, updateOffset()
    // writes the resizing slice functionally, then the reset writes it again
    // functionally, spreading `...old`. The second `old` must be the first
    // write's result or the first write is silently lost.
    type Resizing = { deltaOffset: number | null; isResizingColumn: boolean }
    const [resizing, setResizing] = createSignal<Resizing>({
      deltaOffset: null,
      isResizingColumn: true,
    })
    const seenBySecondUpdater: Array<Resizing> = []

    setResizing((old) => ({ ...old, deltaOffset: 42 }))
    setResizing((old) => {
      seenBySecondUpdater.push(old)
      return { ...old, isResizingColumn: false }
    })

    expect(seenBySecondUpdater).toEqual([
      { deltaOffset: 42, isResizingColumn: true },
    ])
    flush()
    expect(resizing()).toEqual({ deltaOffset: 42, isResizingColumn: false })
  })

  it('same guarantee inside an owned scope with { ownedWrite: true } (D11)', () => {
    let read!: () => { a: number; b: number }
    createRoot(() => {
      const [v, setV] = createSignal({ a: 0, b: 0 }, { ownedWrite: true })
      read = v
      setV((old) => ({ ...old, a: old.a + 1 }))
      setV((old) => ({ ...old, b: old.a + 100 })) // sees pending a === 1
      expect(v()).toEqual({ a: 0, b: 0 }) // in-scope read is still stale
    })
    flush()
    expect(read()).toEqual({ a: 1, b: 101 })
  })

  it('a plain setter inside an owned scope throws REACTIVE_WRITE_IN_OWNED_SCOPE (D11)', () => {
    createRoot(() => {
      const [, setA] = createSignal(0)
      expect(() => setA(1)).toThrow(/REACTIVE_WRITE_IN_OWNED_SCOPE/)
    })
  })
})

// ---------------------------------------------------------------------------

describe('(d) cost of flush() with an empty queue', () => {
  // Reference numbers below were taken at N = 1_000_000 in an isolated run;
  // N is kept lower here so the permanent suite stays fast. min-of-REPS is
  // what makes the measurement stable, not the iteration count.
  const N = 250_000
  const WARMUP = 100_000
  const REPS = 5
  const BENCH_LOG = !!process.env.SPIKE_BENCH_LOG

  /**
   * Each call returns a FRESH closure, so the `fn()` call site inside the
   * timing loop stays monomorphic per measurement. Sharing one higher-order
   * `bench` across every case makes that site megamorphic and inflates every
   * number by 3-10x.
   */
  function makeRunner(fn: () => void): (n: number) => void {
    return (n: number) => {
      for (let i = 0; i < n; i++) fn()
    }
  }

  function bench(label: string, fn: () => void, n = N): number {
    const run = makeRunner(fn)
    run(WARMUP)
    let best = Infinity
    for (let r = 0; r < REPS; r++) {
      const t0 = process.hrtime.bigint()
      run(n)
      const t1 = process.hrtime.bigint()
      best = Math.min(best, Number(t1 - t0) / n)
    }
    if (BENCH_LOG) {
      process.stderr.write(`[bench] ${label}: ${best.toFixed(2)} ns/op\n`)
    }
    return best
  }

  it('an empty flush() is a few tens of nanoseconds and does not scale with graph size', () => {
    const baseline = bench('empty fn baseline', () => {})
    const emptyGraph = bench('flush() — empty graph', () => flush())

    // ~100 signals + ~100 memos + a few effects, all settled.
    const sigs: Array<() => number> = []
    const memos: Array<() => number> = []
    createRoot(() => {
      for (let i = 0; i < 100; i++) sigs.push(createSignal(i)[0])
      for (let i = 0; i < 100; i++) {
        memos.push(createMemo(() => sigs[i]!() * 2))
      }
      for (let i = 0; i < 5; i++) {
        createEffect(
          () => memos[i * 10]!(),
          () => {},
        )
      }
    })
    flush()
    const wideGraph = bench('flush() — 100 signals + 100 memos', () => flush())

    // 200-deep memo chain behind one effect, settled.
    createRoot(() => {
      const [root] = createSignal(0)
      let node: () => number = root
      for (let i = 0; i < 200; i++) {
        const prev = node
        node = createMemo(() => prev() + 1)
      }
      const tail = node
      createEffect(
        () => tail(),
        () => {},
      )
    })
    flush()
    const deepGraph = bench('flush() — 200-deep memo chain', () => flush())

    // Observed on the spike box (isolated run, N=1e6, min-of-5):
    //   empty fn baseline .................  1.12 ns/op
    //   flush() empty graph ............... 16.31 ns/op
    //   flush() 100 signals + 100 memos ... 18.23 ns/op
    //   flush() 200-deep memo chain ....... 16.61 ns/op
    // Absolute bound below is deliberately ~250x that headroom for CI.
    expect(emptyGraph).toBeLessThan(5_000)
    expect(wideGraph).toBeLessThan(5_000)
    expect(deepGraph).toBeLessThan(5_000)

    // An empty flush() is O(1) in graph size: a settled graph costs the same
    // as no graph at all (observed ratio ~1.1x).
    expect(wideGraph).toBeLessThan(emptyGraph * 10)
    expect(deepGraph).toBeLessThan(emptyGraph * 10)

    // ...and it is real work, not a no-op the JIT elides entirely.
    expect(emptyGraph).toBeGreaterThan(baseline)
  })

  it('a settling read (flush() + untracked get) is cheaper than latest()', () => {
    const [v] = createSignal(1)
    const plainRead = bench('untrack(v)', () => {
      untrack(() => v())
    })
    const settlingRead = bench('flush(); untrack(v)', () => {
      flush()
      untrack(() => v())
    })
    const latestRead = bench('latest(v)', () => {
      latest(() => v())
    })

    // Observed (isolated run, N=1e6, min-of-5):
    //   untrack(v) ............  27.76 ns/op
    //   flush(); untrack(v) ...  50.13 ns/op  (flush surcharge ~22 ns)
    //   latest(v) ............. 200.60 ns/op  (~4x the settling read)
    expect(settlingRead).toBeLessThan(5_000)
    // The flush() surcharge on an already-settled read is small.
    expect(settlingRead).toBeLessThan(plainRead * 5)
    // latest() is materially more expensive than flush()+read (observed ~6x).
    expect(latestRead).toBeGreaterThan(settlingRead)
  })
})

// ---------------------------------------------------------------------------

describe('(e) nested flush()', () => {
  it('flush() inside an effect callback does not throw, and does not drain (no-op)', () => {
    const log: Array<string> = []
    let setA!: (v: number) => unknown
    let b!: () => number
    createRoot(() => {
      const [a, sa] = createSignal(0, { ownedWrite: true })
      const [bb, sbb] = createSignal(0, { ownedWrite: true })
      setA = sa as (v: number) => unknown
      b = bb
      createEffect(
        () => a(),
        (v: number) => {
          if (v !== 1) return
          sbb(99)
          log.push(`before nested flush b=${bb()}`)
          flush() // does NOT throw
          log.push(`after nested flush b=${bb()}`)
          log.push(`latest b=${latest(() => bb())}`)
        },
      )
    })
    flush()
    setA(1)
    flush()
    expect(log).toEqual([
      'before nested flush b=0',
      'after nested flush b=0', // the nested flush committed nothing
      'latest b=99', // the write is queued and visible via latest()
    ])
    expect(b()).toBe(99) // committed by the outer flush
  })

  it('the flush(fn) overload nested inside an effect callback is also inert', () => {
    const log: Array<string> = []
    let setA!: (v: number) => unknown
    let b!: () => number
    createRoot(() => {
      const [a, sa] = createSignal(0, { ownedWrite: true })
      const [bb, sbb] = createSignal(0, { ownedWrite: true })
      setA = sa as (v: number) => unknown
      b = bb
      createEffect(
        () => a(),
        (v: number) => {
          if (v !== 1) return
          const returned = flush(() => {
            sbb(99)
            return bb()
          })
          log.push(`flush(fn) returned=${returned}`)
          log.push(`after flush(fn) b=${bb()}`)
        },
      )
    })
    flush()
    setA(1)
    flush()
    expect(log).toEqual(['flush(fn) returned=0', 'after flush(fn) b=0'])
    expect(b()).toBe(99)
  })

  it('flush() inside a compute half does not throw', () => {
    const calls: Array<string> = []
    let setS!: (v: number) => unknown
    createRoot(() => {
      const [s, ss] = createSignal(0)
      setS = ss as (v: number) => unknown
      createEffect(
        () => {
          flush() // must not throw
          calls.push('compute ran')
          return s()
        },
        () => {},
      )
    })
    flush()
    setS(1)
    flush()
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })

  it('flush() inside a memo compute does not throw, and the compute reads the PENDING value', () => {
    const [s, set] = createSignal(0)
    const m = createMemo(() => {
      flush()
      return s()
    })
    expect(m()).toBe(0)
    set(1)
    expect(m()).toBe(1) // compute scope sees the pending write (see (b) tearing)
    flush()
    expect(m()).toBe(1)
  })

  it('one flush() drains ALL pending writes globally, not just the triggering one', () => {
    const log: Array<string> = []
    let setTrigger!: (v: number) => unknown
    let setUnrelated!: (v: number) => unknown
    let unrelated!: () => number
    createRoot(() => {
      const [trigger, st] = createSignal(0)
      const [u, su] = createSignal(0, { ownedWrite: true })
      setTrigger = st as (v: number) => unknown
      setUnrelated = su as (v: number) => unknown
      unrelated = u
      createEffect(
        () => trigger(),
        (v: number) => {
          if (v === 1) log.push(`effect sees unrelated=${u()}`)
        },
      )
    })
    flush()
    setUnrelated(42) // never explicitly flushed
    setTrigger(1)
    flush()
    expect(log).toEqual(['effect sees unrelated=42'])
    expect(unrelated()).toBe(42)
  })

  it('a write made in an effect callback re-runs downstream effects within the SAME outer flush()', () => {
    const log: Array<string> = []
    let setTrigger!: (v: number) => unknown
    createRoot(() => {
      const [trigger, st] = createSignal(0)
      const [x, setX] = createSignal(0, { ownedWrite: true })
      setTrigger = st as (v: number) => unknown
      createEffect(
        () => trigger(),
        (v: number) => {
          if (v === 1) setX(7)
        },
      )
      createEffect(
        () => [trigger(), x()] as const,
        ([t, xv]) => {
          log.push(`t=${t} x=${xv}`)
        },
      )
    })
    flush()
    setTrigger(1)
    flush()
    expect(log).toEqual(['t=0 x=0', 't=1 x=0', 't=1 x=7'])
  })
})

// ---------------------------------------------------------------------------

describe('(f) microtask auto-settle', () => {
  it('a single await Promise.resolve() commits reads AND runs effects — no explicit flush needed', async () => {
    const seen: Array<number> = []
    let s!: () => number
    let set!: (v: number) => unknown
    createRoot(() => {
      const sig = createSignal(0)
      s = sig[0]
      set = sig[1] as (v: number) => unknown
      createEffect(
        () => s(),
        (v: number) => {
          seen.push(v)
        },
      )
    })
    expect(seen).toEqual([]) // two-arg effect does not run at creation
    flush()
    expect(seen).toEqual([0])

    set(1)
    expect(s()).toBe(0) // synchronous window: still stale

    await Promise.resolve()
    expect(s()).toBe(1)
    expect(seen).toEqual([0, 1])

    await Promise.resolve()
    expect(seen).toEqual([0, 1]) // idempotent, no extra run
  })

  it('auto-settles even when the graph contains no effects at all', async () => {
    const [s, set] = createSignal(0)
    set(1)
    expect(s()).toBe(0)
    await Promise.resolve()
    expect(s()).toBe(1)
  })

  it('a microtask queued BEFORE the set still observes the stale value', async () => {
    const [t, setT] = createSignal(0)
    const order: Array<string> = []
    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        order.push(`pre-scheduled microtask t=${t()}`)
        resolve()
      })
      setT(1)
      order.push(`sync after set t=${t()}`)
    })
    order.push(`after await t=${t()}`)
    expect(order).toEqual([
      'sync after set t=0',
      'pre-scheduled microtask t=0',
      'after await t=1',
    ])
  })

  it('a macrotask boundary is likewise settled (already settled by the microtask)', async () => {
    const [s, set] = createSignal(0)
    set(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(s()).toBe(1)
  })

  it('the staleness window is exactly the synchronous tick that performed the write', async () => {
    const [c, setC] = createSignal(0)
    setC((v) => v + 1)
    setC((v) => v + 1)
    expect(c()).toBe(0)
    await Promise.resolve()
    expect(c()).toBe(2)
    setC((v) => v + 1)
    expect(c()).toBe(2) // stale again, new window
    await Promise.resolve()
    expect(c()).toBe(3)
  })
})
