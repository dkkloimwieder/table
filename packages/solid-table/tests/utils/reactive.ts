import { createRoot, flush } from 'solid-js'

/**
 * Drains the Solid 2 reactive queue (design D23).
 *
 * Solid 2 defers every update to a microtask, so tests that assert effect run
 * counts (or read raw signals outside table APIs) must settle explicitly
 * after each mutation. Idempotent and ~free when the queue is empty.
 *
 * MUST NOT be called from inside `onSettled` or `createTrackedEffect`
 * callbacks — `flush()` is not reentrant there and throws.
 *
 * Reads that go through table APIs (`atom.get()`, `table.options`,
 * `table.getRowModel()`, ...) do NOT need a prior `settle()`: the adapter's
 * settle-on-imperative-read (D10-A) flushes for them. Keeping those reads
 * flush-free in tests is deliberate — they are the regression tests for that
 * design decision.
 */
export function settle(): void {
  flush()
}

/**
 * Settles work that takes an extra microtask turn because it is scheduled
 * through the adapter's `schedule()` binding (e.g. `table_autoResetPageIndex`
 * runs `queueMicrotask`, so its effects land one turn after the flush).
 */
export async function settleAsync(): Promise<void> {
  flush()
  await Promise.resolve()
  flush()
}

/**
 * Runs `setup` inside a disposable root and hands back both the root's value
 * and its `dispose`. Writes to plain signals created in `setup` must happen
 * AFTER this returns — the Solid 2 dev runtime hard-throws
 * [REACTIVE_WRITE_IN_OWNED_SCOPE] for writes inside owned scopes unless the
 * signal opted into `ownedWrite`.
 */
export function createEffectTestRoot<T>(setup: () => T): {
  dispose: () => void
  value: T
} {
  let dispose!: () => void
  const value = createRoot((rootDispose) => {
    dispose = rootDispose
    return setup()
  })
  return { dispose, value }
}
