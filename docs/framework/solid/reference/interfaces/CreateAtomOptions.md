---
id: CreateAtomOptions
title: CreateAtomOptions
---

# Interface: CreateAtomOptions\<T\>

Defined in: [packages/solid-table/src/reactivity.ts:199](https://github.com/TanStack/table/blob/main/packages/solid-table/src/reactivity.ts#L199)

## Extends

- `AtomOptions`\<`T`\>

## Type Parameters

### T

`T`

## Properties

### compare()?

```ts
optional compare: (prev, next) => boolean;
```

Defined in: node\_modules/.pnpm/@tanstack+store@0.11.0/node\_modules/@tanstack/store/dist/types.d.ts:34

#### Parameters

##### prev

`T`

##### next

`T`

#### Returns

`boolean`

#### Inherited from

```ts
AtomOptions.compare
```

***

### name?

```ts
optional name: string;
```

Defined in: [packages/solid-table/src/reactivity.ts:203](https://github.com/TanStack/table/blob/main/packages/solid-table/src/reactivity.ts#L203)

A debug name for the atom, shown by Solid's dev tooling.
