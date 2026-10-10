import * as z from 'zod/mini'
import { defaultFields } from './fields'
import type { EditingFields } from './fields'
import type { EditColumn, EditValues, ValidationResult } from './createEditing'

/** Application rules for this fixture, not limits imposed by Table. */
export function createEditValidator(fields: EditingFields) {
  const allowed = new Set(
    fields.priority.choices
      .filter((choice) => choice.value && !choice.disabled)
      .map((choice) => choice.value),
  )
  const editSchema = z.object({
    priority: z.string().check(
      z.refine((value) => allowed.has(value), {
        error: fields.priority.invalidMessage,
      }),
    ),
    name: z.string().check(
      z.refine((value) => Boolean(value.trim()), {
        error: `Enter a ${fields.name.label.toLowerCase()} before saving.`,
      }),
      z.maxLength(80, {
        error: `Use 80 characters or fewer for the ${fields.name.label.toLowerCase()}.`,
      }),
    ),
    note: z.string().check(
      z.maxLength(240, {
        error: `Use 240 characters or fewer for the ${fields.note.label.toLowerCase()}.`,
      }),
    ),
  })
  return createValidator(editSchema)
}

/** The editing controller receives values and messages, not Zod internals. */
export function createValidator(schema: z.ZodMiniType<EditValues>) {
  return (values: EditValues): ValidationResult => {
    const result = schema.safeParse(values)
    if (result.success) return { success: true, data: result.data }
    const fieldErrors: Partial<Record<EditColumn, string>> = {}
    const rowErrors: Array<string> = []
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (field === 'name' || field === 'note' || field === 'priority')
        fieldErrors[field] = [fieldErrors[field], issue.message]
          .filter(Boolean)
          .join(' ')
      else rowErrors.push(issue.message)
    }
    return {
      success: false,
      fieldErrors,
      message:
        rowErrors.join(' ') || 'Correct the marked fields before saving.',
    }
  }
}

export const validateEdits = createEditValidator(defaultFields)
