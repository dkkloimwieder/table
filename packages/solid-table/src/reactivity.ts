import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  flush,
  getObserver,
  getOwner,
  runWithOwner,
  untrack,
} from 'solid-js'
import { mergeObjects } from './merge-objects'
import type {
  Atom,
  AtomOptions,
  Observer,
  ReadonlyAtom,
  Subscription,
} from '@tanstack/store'
import type { Accessor, Owner, Signal } from 'solid-js'
import type {
  TableAtomOptions,
  TableReactivityBindings,
} from '@tanstack/table-core/reactivity'

const optionsStoreDebugName = 'table/optionsStore'

function observerToCallback<T>(
  observerOrNext: Observer<T> | ((value: T) => void),
): (value: T) => void {
  return typeof observerOrNext === 'function'
    ? observerOrNext
    : (value) => observerOrNext.next?.(value)
}

/**
 * Reads a signal with settle-on-imperative-read semantics (design D10-A).
 *
 * Inside a reactive scope (JSX, memo, effect compute) the read is tracked and
 * left un-settled — computations already observe pending values, and calling
 * `flush()` from inside the graph is either a no-op or an error. Outside any
 * observer AND any owner the pending queue is flushed first so imperative
 * callers get read-your-writes (`table.setPageSize(50)` then
 * `pagination.get()`), then the value is read untracked.
 *
 * The owner guard matters: an untracked read during component construction
 * (e.g. table-core resolving options) must NOT drain the queue — `flush()`
 * would run pending effect halves synchronously inside the mounting
 * component's owned scope, where their otherwise-legal plain signal writes
 * hard-throw `REACTIVE_WRITE_IN_OWNED_SCOPE`. Owned-but-untracked reads see
 * the committed value instead.
 */
function readSettled<T>(signal: Accessor<T>): T {
  if (getObserver() !== null) return signal()
  if (getOwner() === null) flush()
  return untrack(signal)
}

/**
 * Bridges a Solid signal to the TanStack Store `subscribe` contract (designs
 * D4/D5/D6).
 *
 * The effect lives in a `createRoot` nested under `owner`, so it is disposed
 * with the table while `unsubscribe` can still dispose it early — Solid 2
 * nested roots are parent-owned and double-dispose safe. The subscriber is
 * initialised by a manual eager emission (a `defer` effect would never fire
 * for a source that never changes), and the effect's own first delivery is
 * deduplicated against it. The dedup guard must not swallow a write that
 * lands between `subscribe()` and the first flush, hence the `Object.is`
 * comparison rather than skipping the first delivery outright.
 */
function subscribeToSignal<T>(
  signal: Accessor<T>,
  owner: Owner | null,
  observerOrNext: Observer<T> | ((value: T) => void),
): Subscription {
  const callback = observerToCallback(observerOrNext)
  let emitted = false
  let last: T | undefined

  const dispose = runWithOwner(owner, () =>
    createRoot((disposeRoot) => {
      createEffect(
        () => signal(),
        (value: T) => {
          if (emitted && Object.is(value, last)) {
            return
          }
          emitted = true
          last = value
          callback(value)
        },
      )
      return disposeRoot
    }),
  )

  // The effect's first delivery is flush-deferred (pinned by
  // tests/spike/create-effect-timing.spike.test.ts), so `emitted` is still
  // false here today; the guard only matters if a future Solid beta makes the
  // initial run synchronous.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!emitted) {
    const initial = untrack(signal)
    emitted = true
    last = initial
    callback(initial)
  }

  return {
    unsubscribe: () => {
      dispose()
    },
  }
}

function signalToReadonlyAtom<T>(
  signal: Accessor<T>,
  owner: Owner | null,
): ReadonlyAtom<T> {
  return Object.assign(signal, {
    get: () => readSettled(signal),
    subscribe: ((observerOrNext: Observer<T> | ((value: T) => void)) =>
      subscribeToSignal(
        signal,
        owner,
        observerOrNext,
      )) as ReadonlyAtom<T>['subscribe'],
  })
}

function signalToWritableAtom<T>(
  signalTuple: Signal<T>,
  owner: Owner | null,
): Atom<T> {
  const [signal, setSignal] = signalTuple
  return Object.assign(signal, {
    set: (updater: T | ((prevVal: T) => T)) => {
      // Delegate to Solid's setter so consecutive functional updates see each
      // other's pending value (design D7).
      typeof updater === 'function'
        ? setSignal(updater as unknown as (prev: T) => T)
        : setSignal(updater as Exclude<T, Function>)
    },
    get: () => readSettled(signal),
    subscribe: ((observerOrNext: Observer<T> | ((value: T) => void)) =>
      subscribeToSignal(signal, owner, observerOrNext)) as Atom<T>['subscribe'],
  })
}

/**
 * The options store as a Solid writable memo (design D14, validated by the
 * writable-memo spike): `createSignal(fn, options)` keeps `table.options`
 * pull-based — the stored object carries the caller's live option getters, so
 * row-model reads are always current without an eager push-sync loop.
 *
 * `constructTable` builds the store's initial value with an object spread,
 * which EVALUATES every user option getter into a snapshot. The compute
 * re-layers the adapter's getter-carrying merged options (`getLiveOptions`)
 * on top, doing eagerly-at-creation what the Solid 1 `createComputed`
 * push-sync did on its synchronous first run. Later `setOptions` writes stay
 * getter-preserving through the adapter's `mergeOptions` binding.
 *
 * `set` settles the queue on BOTH sides of the write: a manual write on a
 * writable memo permanently swallows a same-tick pending dep change
 * (REACTIVE_MANUAL_WRITE unschedules the recompute and nothing reschedules
 * it), so the queue must be drained before writing; the trailing flush keeps
 * the write immediately visible to the imperative reads that follow it inside
 * table-core's synchronous update paths.
 */
function createOptionsStoreAtom<T>(
  initialValue: T,
  owner: Owner | null,
  getLiveOptions?: () => unknown,
): Atom<T> {
  const [raw, setRaw] = runWithOwner(owner, () =>
    createSignal<T>(
      (prev) => mergeObjects(prev ?? initialValue, getLiveOptions?.()),
      {
        name: optionsStoreDebugName,
        ownedWrite: true,
      },
    ),
  )
  return Object.assign(raw, {
    set: (updater: T | ((prevVal: T) => T)) => {
      flush()
      typeof updater === 'function'
        ? setRaw(updater as unknown as (prev: T) => T)
        : setRaw(updater as Exclude<T, Function>)
      flush()
    },
    get: () => readSettled(raw),
    subscribe: ((observerOrNext: Observer<T> | ((value: T) => void)) =>
      subscribeToSignal(raw, owner, observerOrNext)) as Atom<T>['subscribe'],
  })
}

export interface CreateAtomOptions<T> extends AtomOptions<T> {
  /**
   * A debug name for the atom, shown by Solid's dev tooling.
   */
  name?: string
}

/**
 * Creates a Solid-native writable atom for use as external table state.
 *
 * The returned atom satisfies the TanStack Store `Atom` contract, so it can be
 * passed directly to table options that accept external atoms. Calling `.get()`
 * (or the atom itself) inside JSX or any reactive scope is tracked like any
 * Solid signal; calling it imperatively settles pending updates first, so a
 * `.set()` is immediately visible to the next `.get()`.
 */
export function createAtom<T>(
  initialValue: T,
  options?: CreateAtomOptions<T>,
): Atom<T> {
  // Function values are reserved by the Atom contract for functional updates,
  // so a bare function can never be atom state; the cast keeps Solid's
  // value-form createSignal overload.
  const signalTuple = createSignal<T>(initialValue as Exclude<T, Function>, {
    equals: options?.compare,
    name: options?.name,
    ownedWrite: true,
  })
  return signalToWritableAtom(signalTuple, getOwner())
}

/**
 * Creates the table-core reactivity bindings used by the Solid adapter.
 *
 * Atoms are plain Solid signals and memos carrying the TanStack Store atom
 * interface. Solid 2 batches every write and settles on a microtask, so the
 * `batch` binding is the identity — auto-batching already coalesces — and
 * imperative reads settle the queue themselves (see `readSettled`). Memos are
 * created under the table's owner: an unowned memo that has already computed
 * recomputes against pending values while its source still reads the committed
 * one, i.e. it tears. All writable atoms set `ownedWrite: true` because
 * table-core legitimately writes from reactive scopes.
 */
export function solidReactivity(
  owner: Owner,
  getLiveOptions?: () => unknown,
): TableReactivityBindings {
  const subscriptions = new Set<Subscription>()

  return {
    createOptionsStore: true,
    wrapExternalAtoms: true,
    addSubscription: (subscription) => {
      subscriptions.add(subscription)
    },
    unmount: () => {
      subscriptions.forEach((s) => s.unsubscribe())
      subscriptions.clear()
    },
    schedule: (fn) => queueMicrotask(() => fn()),
    createReadonlyAtom: <T>(fn: () => T, options?: TableAtomOptions<T>) => {
      const signal = runWithOwner(owner, () =>
        createMemo(() => fn(), {
          equals: options?.compare,
          name: options?.debugName,
        }),
      )
      return signalToReadonlyAtom(signal, owner)
    },
    createWritableAtom: <T>(
      value: T,
      options?: TableAtomOptions<T>,
    ): Atom<T> => {
      if (options?.debugName === optionsStoreDebugName) {
        return createOptionsStoreAtom(value, owner, getLiveOptions)
      }
      const writableSignal = createSignal<T>(value as Exclude<T, Function>, {
        equals: options?.compare,
        name: options?.debugName,
        ownedWrite: true,
      })
      return signalToWritableAtom(writableSignal, owner)
    },
    untrack: untrack,
    batch: (fn) => {
      fn()
    },
  }
}
