---
id: AccessorKeyColumnDef
title: AccessorKeyColumnDef
---

# Type Alias: AccessorKeyColumnDef\<TFeatures, TData, TValue\>

```ts
type AccessorKeyColumnDef<TFeatures, TData, TValue> = AccessorKeyColumnDefBase<TFeatures, TData, TValue> & Partial<ColumnIdentifiers<TFeatures, TData, TValue>>;
```

Defined in: [types/ColumnDef.ts:230](https://github.com/TanStack/table/blob/main/packages/table-core/src/types/ColumnDef.ts#L230)

## Type Parameters

### TFeatures

`TFeatures` *extends* [`TableFeatures`](../interfaces/TableFeatures.md)

### TData

`TData` *extends* [`RowData`](RowData.md)

### TValue

`TValue` *extends* [`CellData`](CellData.md) = [`CellData`](CellData.md)
