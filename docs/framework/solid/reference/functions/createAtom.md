---
id: createAtom
title: createAtom
---

# Function: createAtom()

```ts
function createAtom<T>(initialValue, options?): Atom<T>;
```

Defined in: [packages/solid-table/src/reactivity.ts:215](https://github.com/TanStack/table/blob/main/packages/solid-table/src/reactivity.ts#L215)

Creates a Solid-native writable atom for use as external table state.

The returned atom satisfies the TanStack Store `Atom` contract, so it can be
passed directly to table options that accept external atoms. Calling `.get()`
(or the atom itself) inside JSX or any reactive scope is tracked like any
Solid signal; calling it imperatively settles pending updates first, so a
`.set()` is immediately visible to the next `.get()`.

## Type Parameters

### T

`T`

## Parameters

### initialValue

`T`

### options?

[`CreateAtomOptions`](../interfaces/CreateAtomOptions.md)\<`T`\>

## Returns

`Atom`\<`T`\>
