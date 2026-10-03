import {
  createEffect,
  createMemo,
  createRoot,
  createSignal,
  onCleanup,
  runWithOwner,
  untrack,
} from 'solid-js'
import type {
  Atom,
  Observer,
  ReadonlyAtom,
  Subscription,
} from '@tanstack/store'
import type { Accessor, Owner } from 'solid-js'
import type {
  TableAtomOptions,
  TableReactivityBindings,
} from '@tanstack/table-core/reactivity'

function bindAtom<T>(read: Accessor<T>, owner: Owner): ReadonlyAtom<T> {
  return Object.assign(read, {
    get: read,
    subscribe(observer: Observer<T>): Subscription {
      const notify =
        typeof observer === 'function'
          ? observer
          : observer.next
            ? (value: T) => observer.next!(value)
            : undefined
      let dispose = () => {}
      if (notify) {
        runWithOwner(owner, () => {
          createRoot((stop) => {
            dispose = stop
            // Solid 2 effects deliver the initial committed value after settle.
            createEffect(read, (value) => {
              notify(value)
            })
          })
        })
      }
      return { unsubscribe: () => dispose() }
    },
  })
}

/** Creates native Solid atoms for table-core. */
export function solidReactivity(owner: Owner): TableReactivityBindings {
  const subscriptions = new Set<Subscription>()
  const unmount = () => {
    subscriptions.forEach((subscription) => subscription.unsubscribe())
    subscriptions.clear()
  }
  onCleanup(unmount)

  return {
    // Getters keep option dependencies local to each reader.
    createOptionsStore: false,
    wrapExternalAtoms: true,
    addSubscription: (subscription) => subscriptions.add(subscription),
    unmount,
    schedule: (callback) => queueMicrotask(callback),
    untrack,
    // Solid 2 batches writes until the next microtask by default.
    batch: (fn) => fn(),
    createReadonlyAtom: <T>(fn: () => T, options?: TableAtomOptions<T>) =>
      bindAtom(
        createMemo(fn, {
          equals: options?.compare,
          name: options?.debugName,
        }),
        owner,
      ),
    createWritableAtom: <T>(
      value: T,
      options?: TableAtomOptions<T>,
    ): Atom<T> => {
      const [read, write] = createSignal(() => value, {
        equals: options?.compare,
        name: options?.debugName,
        // Core synchronizes controlled state and external atoms in owned scopes.
        ownedWrite: true,
      })
      return Object.assign(bindAtom(read, owner), {
        set: (updater: T | ((previous: T) => T)) => {
          write(updater as Parameters<typeof write>[0])
        },
      })
    },
  }
}
