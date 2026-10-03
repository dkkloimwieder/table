import { expect, test, vi } from 'vitest'
import { createRoot, flush } from 'solid-js'
import * as z from 'zod/mini'
import { createValidator, validateEdits } from '../../bench/editing/validation'
import { createEditing } from '../../bench/editing/createEditing'

test('Zod Mini reports all invalid fields without changing the input', () => {
  const input = { name: '   ', note: 'x'.repeat(241), priority: 'normal' }
  expect(validateEdits(input)).toEqual({
    success: false,
    fieldErrors: {
      name: 'Enter a name before saving.',
      note: 'Use 240 characters or fewer for the note.',
    },
    message: 'Correct the marked fields before saving.',
  })
  expect(input.name).toBe('   ')
  expect(
    validateEdits({ name: '  Valid  ', note: '', priority: 'normal' }),
  ).toEqual({
    success: true,
    data: { name: '  Valid  ', note: '', priority: 'normal' },
  })
})

test('the select schema rejects values outside its options', () => {
  expect(
    validateEdits({ name: 'Valid', note: '', priority: 'urgent' }),
  ).toEqual({
    success: false,
    fieldErrors: { priority: 'Choose Low, Normal, or High.' },
    message: 'Correct the marked fields before saving.',
  })
})

const dependentSchema = z
  .object({ name: z.string(), note: z.string(), priority: z.string() })
  .check(
    z.refine((value) => value.name !== value.note, {
      path: ['note'],
      error: 'The note must differ from the name.',
    }),
    z.refine((value) => value.name !== 'Blocked', {
      error: 'This combination is unavailable.',
    }),
  )

test('application schemas can return cross-field and row errors together', () => {
  const validate = createValidator(dependentSchema)
  expect(
    validate({ name: 'Blocked', note: 'Blocked', priority: 'normal' }),
  ).toEqual({
    success: false,
    fieldErrors: { note: 'The note must differ from the name.' },
    message: 'This combination is unavailable.',
  })
})

test('editing a related field recomputes cross-field errors without committing', async () => {
  const row = {
    id: '1',
    revision: '1',
    name: 'Original',
    note: '',
    priority: 'normal',
  }
  const commit = vi.fn(() =>
    Promise.resolve({
      status: 'saved' as const,
      id: '1',
      revision: '2',
    }),
  )
  const h = createRoot((dispose) => ({
    dispose,
    editing: createEditing({
      get: () => row,
      validate: createValidator(dependentSchema),
      commit,
      apply: vi.fn(),
    }),
  }))
  try {
    h.editing.begin('1')
    flush()
    h.editing.change('1', 'name', 'Same')
    h.editing.change('1', 'note', 'Same')
    flush()
    expect(await h.editing.save('1')).toBe(false)
    flush()
    expect(h.editing.drafts['1']?.fieldErrors.note).toBe(
      'The note must differ from the name.',
    )
    expect(commit).not.toHaveBeenCalled()
    h.editing.change('1', 'name', 'Different')
    flush()
    expect(h.editing.drafts['1']?.fieldErrors).toEqual({})
    expect(h.editing.drafts['1']?.note).toBe('Same')
    expect(row.name).toBe('Original')
  } finally {
    h.dispose()
    flush()
  }
})

test('save sends parsed values and leaves the canonical record to apply', async () => {
  const row = {
    id: '1',
    revision: '1',
    name: 'Original',
    note: '',
    priority: 'normal',
  }
  const schema = z.object({
    name: z.string().check(z.trim()),
    note: z.string(),
    priority: z.string(),
  })
  const commit = vi.fn(() =>
    Promise.resolve({
      status: 'saved' as const,
      id: '1',
      revision: '2',
    }),
  )
  const apply = vi.fn()
  const h = createRoot((dispose) => ({
    dispose,
    editing: createEditing({
      get: () => row,
      validate: createValidator(schema),
      commit,
      apply,
    }),
  }))
  try {
    h.editing.begin('1')
    flush()
    h.editing.change('1', 'name', '  Updated  ')
    flush()
    expect(await h.editing.save('1')).toBe(true)
    flush()
    expect(commit).toHaveBeenCalledWith(
      { id: '1', expectedRevision: '1', changes: { name: 'Updated' } },
      expect.any(AbortSignal),
    )
    expect(apply).toHaveBeenCalledWith(
      { id: '1', expectedRevision: '1', changes: { name: 'Updated' } },
      { status: 'saved', id: '1', revision: '2' },
    )
    expect(row.name).toBe('Original')
    expect(h.editing.drafts['1']).toBeUndefined()
  } finally {
    h.dispose()
    flush()
  }
})
