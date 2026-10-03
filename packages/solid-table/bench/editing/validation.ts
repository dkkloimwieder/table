import * as z from 'zod/mini'
import type { EditValues, TextColumn, ValidationResult } from './createEditing'

/** Application rules for this fixture, not limits imposed by Table. */
const editSchema = z.object({
  name: z.string().check(
    z.refine((value) => Boolean(value.trim()), {
      error: 'Enter a name before saving.',
    }),
    z.maxLength(80, { error: 'Use 80 characters or fewer for the name.' }),
  ),
  note: z
    .string()
    .check(
      z.maxLength(240, { error: 'Use 240 characters or fewer for the note.' }),
    ),
})

/** The editing controller receives values and messages, not Zod internals. */
export function createValidator(schema: z.ZodMiniType<EditValues>) {
  return (values: EditValues): ValidationResult => {
    const result = schema.safeParse(values)
    if (result.success) return { success: true, data: result.data }
    const fieldErrors: Partial<Record<TextColumn, string>> = {}
    const rowErrors: Array<string> = []
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (field === 'name' || field === 'note')
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

export const validateEdits = createValidator(editSchema)
