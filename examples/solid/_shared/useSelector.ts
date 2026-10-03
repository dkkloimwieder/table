import { createSignal, onCleanup } from 'solid-js'
import type { ReadonlyAtom } from '@tanstack/store'

export function useSelector<T>(atom: ReadonlyAtom<T>) {
  const [read, write] = createSignal(() => atom.get(), { ownedWrite: true })
  const subscription = atom.subscribe((value) => write(() => value))
  onCleanup(() => subscription.unsubscribe())
  return read
}
