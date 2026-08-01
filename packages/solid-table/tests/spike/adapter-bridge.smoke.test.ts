import { describe, expect, it, vi } from 'vitest'
import { createOwner, flush, runWithOwner } from 'solid-js'
import { createAtom, solidReactivity } from '../../src/reactivity'
import type { Owner } from 'solid-js'
import type { TableReactivityBindings } from '@tanstack/table-core/reactivity'

function withBindings<T>(
  fn: (bindings: TableReactivityBindings, owner: Owner) => T,
): T {
  const owner = createOwner()
  const bindings = solidReactivity(owner)
  return fn(bindings, owner)
}

describe('solidReactivity bridge (Solid 2)', () => {
  it('settles pending writes on imperative get (D10-A read-your-writes)', () => {
    withBindings((bindings) => {
      const atom = bindings.createWritableAtom(0, { debugName: 'test/atom' })
      atom.set(5)
      expect(atom.get()).toBe(5)
      atom.set((prev) => prev + 1)
      atom.set((prev) => prev + 1)
      expect(atom.get()).toBe(7)
    })
  })

  it('derived atoms recompute from settled state on imperative get', () => {
    withBindings((bindings) => {
      const base = bindings.createWritableAtom(2, { debugName: 'test/base' })
      const doubled = bindings.createReadonlyAtom(() => base.get() * 2, {
        debugName: 'test/doubled',
      })
      expect(doubled.get()).toBe(4)
      base.set(10)
      expect(doubled.get()).toBe(20)
    })
  })

  it('subscribe emits eagerly exactly once, then only on change', () => {
    withBindings((bindings) => {
      const atom = bindings.createWritableAtom(1, { debugName: 'test/sub' })
      const seen: Array<number> = []
      const subscription = atom.subscribe((value: number) => seen.push(value))
      expect(seen).toEqual([1])

      flush()
      expect(seen).toEqual([1])

      atom.set(2)
      flush()
      expect(seen).toEqual([1, 2])

      subscription.unsubscribe()
      subscription.unsubscribe()
      atom.set(3)
      flush()
      expect(seen).toEqual([1, 2])
    })
  })

  it('delivers a write that lands between subscribe and first flush', () => {
    withBindings((bindings) => {
      const atom = bindings.createWritableAtom('a', { debugName: 'test/race' })
      const seen: Array<string> = []
      atom.subscribe((value: string) => seen.push(value))
      atom.set('b')
      flush()
      expect(seen).toEqual(['a', 'b'])
    })
  })

  it('normalizes Observer-object subscribers', () => {
    withBindings((bindings) => {
      const atom = bindings.createWritableAtom(0, { debugName: 'test/obs' })
      const next = vi.fn()
      atom.subscribe({ next })
      atom.set(1)
      flush()
      expect(next.mock.calls.map((c) => c[0])).toEqual([0, 1])
    })
  })

  it('batch binding is the identity and unmount tears down subscriptions', () => {
    withBindings((bindings) => {
      const atom = bindings.createWritableAtom(0, { debugName: 'test/batch' })
      const seen: Array<number> = []
      bindings.addSubscription(
        atom.subscribe((value: number) => seen.push(value)),
      )

      bindings.batch(() => {
        atom.set(1)
        atom.set(2)
      })
      flush()
      expect(seen).toEqual([0, 2])

      bindings.unmount?.()
      atom.set(3)
      flush()
      expect(seen).toEqual([0, 2])
    })
  })
})

describe('createAtom (public external-atom factory)', () => {
  it('is reactive for tracked readers and settled for imperative ones', () => {
    const atom = createAtom(10, { name: 'user/atom' })
    atom.set((prev) => prev + 5)
    expect(atom.get()).toBe(15)

    const seen: Array<number> = []
    atom.subscribe((value: number) => seen.push(value))
    atom.set(20)
    flush()
    expect(seen).toEqual([15, 20])
  })

  it('respects a custom compare', () => {
    const atom = createAtom(
      { id: 1, label: 'a' },
      { compare: (prev, next) => prev.id === next.id },
    )
    const seen: Array<string> = []
    atom.subscribe((value: { id: number; label: string }) =>
      seen.push(value.label),
    )
    atom.set({ id: 1, label: 'b' })
    flush()
    expect(seen).toEqual(['a'])
    atom.set({ id: 2, label: 'c' })
    flush()
    expect(seen).toEqual(['a', 'c'])
  })

  it('writes from an owned scope do not throw (ownedWrite)', () => {
    const owner = createOwner()
    const atom = createAtom(0)
    expect(() => {
      runWithOwner(owner, () => {
        atom.set(1)
      })
    }).not.toThrow()
    expect(atom.get()).toBe(1)
  })
})
