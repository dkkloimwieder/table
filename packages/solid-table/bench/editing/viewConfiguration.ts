import * as z from 'zod/mini'
import type { EditingModel } from './model'

const strings = z.array(z.string())
const sort = z.strictObject({ id: z.string(), desc: z.boolean() })
const summary = z.enum([
  'none',
  'count',
  'filled',
  'empty',
  'distinct',
  'first',
  'last',
  'sum',
  'min',
  'max',
  'mean',
  'median',
  'range',
  'span',
])
const configurationSchema = z.strictObject({
  version: z.literal(1),
  columnFilters: z.array(z.strictObject({ id: z.string(), value: z.string() })),
  globalFilter: z.string(),
  sorting: z.array(sort),
  grouping: strings,
  groupSorting: z.array(
    z.strictObject({
      id: z.string(),
      desc: z.boolean(),
      depth: z.number().check(z.int(), z.minimum(0)),
    }),
  ),
  summaries: z.record(z.string(), summary),
  columnOrder: strings,
  columnVisibility: z.record(z.string(), z.boolean()),
  columnPinning: z.strictObject({ start: strings, end: strings }),
  controls: z.strictObject({
    filters: z.enum(['external', 'headers', 'both', 'none']),
    headerSorting: z.boolean(),
    globalSearch: z.boolean(),
    grouping: z.boolean(),
    columnResizing: z.boolean(),
    columnReordering: z.boolean(),
    resizeBehavior: z.enum(['grow', 'fixed']),
  }),
})
const viewSchema = z.strictObject({
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  configuration: configurationSchema,
})
export type ViewConfiguration = z.infer<typeof configurationSchema>
export type TableView = z.infer<typeof viewSchema>

// Saved views use a fixed allowlist. Record values and transient row state
// cannot enter the payload through a spread of the whole Table state.
export function parseView(value: unknown, model: EditingModel): TableView {
  const parsed = viewSchema.safeParse(value)
  if (!parsed.success)
    throw new Error('This view has an unsupported or invalid configuration.')
  const view = parsed.data
  view.name = view.name.trim()
  if (!view.name) throw new Error('Enter a view name.')
  const c = view.configuration
  const ids = new Set(model.columnIds)
  const referenced = [
    ...c.columnFilters.map((item) => item.id),
    ...c.sorting.map((item) => item.id),
    ...c.groupSorting.map((item) => item.id),
    ...c.grouping,
    ...c.columnOrder,
    ...Object.keys(c.columnVisibility),
    ...Object.keys(c.summaries),
    ...c.columnPinning.start,
    ...c.columnPinning.end,
  ]
  const missing = [...new Set(referenced.filter((id) => !ids.has(id)))]
  if (missing.length)
    throw new Error(
      `This view refers to missing columns: ${missing.join(', ')}.`,
    )
  for (const values of [
    c.grouping,
    c.columnOrder,
    c.columnFilters.map((item) => item.id),
    c.sorting.map((item) => item.id),
    c.groupSorting.map((item) => String(item.depth)),
    [...c.columnPinning.start, ...c.columnPinning.end],
  ])
    if (new Set(values).size !== values.length)
      throw new Error('This view repeats a column or grouping level.')
  for (const id of model.columnIds) {
    const choices = model.table.getColumn(id)?.columnDef?.meta?.summaryChoices
    if (!choices?.some((choice) => choice.value === c.summaries[id]))
      throw new Error(`This view has an unsupported aggregate for ${id}.`)
  }
  if (
    c.grouping.some(
      (id) => !model.table.getColumn(id)?.columnDef?.meta?.groupingLabel,
    )
  )
    throw new Error('This view groups a column that does not support grouping.')
  if (c.groupSorting.some((item) => item.depth >= c.grouping.length))
    throw new Error('This view refers to a missing grouping level.')
  return view
}
