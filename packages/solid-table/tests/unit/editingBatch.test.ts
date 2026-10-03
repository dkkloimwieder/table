import { createRoot, flush } from 'solid-js'
import { expect, test, vi } from 'vitest'
import * as z from 'zod/mini'
import { createEditing } from '../../bench/editing/createEditing'
import { createValidator, validateEdits } from '../../bench/editing/validation'
import type {
  RecordData,
  SaveRequest,
  SaveResult,
} from '../../bench/editing/createEditing'

function harness(size: number, validate = validateEdits) {
  const records = new Map(
    Array.from({ length: size }, (_, i) => {
      const id = String(i + 1)
      return [
        id,
        {
          id,
          name: `Record ${id}`,
          note: '',
          priority: 'normal',
          revision: '1',
        } satisfies RecordData,
      ] as const
    }),
  )
  const waiting = new Map<string, () => void>()
  const commit = vi.fn(
    (request: SaveRequest, signal: AbortSignal) =>
      new Promise<SaveResult>((resolve, reject) => {
        const cleanup = () => {
          waiting.delete(request.id)
          signal.removeEventListener('abort', abort)
        }
        const abort = () => {
          cleanup()
          reject(new Error('Aborted'))
        }
        waiting.set(request.id, () => {
          cleanup()
          resolve({ status: 'saved', id: request.id, revision: '2' })
        })
        signal.addEventListener('abort', abort, { once: true })
      }),
  )
  const h = createRoot((dispose) => ({
    dispose,
    editing: createEditing({
      get: (id) => records.get(id),
      validate,
      commit,
      apply: (request, result) =>
        Object.assign(records.get(request.id)!, request.changes, {
          revision: result.revision,
        }),
    }),
  }))
  function draft(id: string, note = `Draft ${id}`) {
    h.editing.begin(id)
    flush()
    h.editing.change(id, 'note', note)
    flush()
  }
  async function release() {
    for (const resolve of [...waiting.values()]) resolve()
    await Promise.resolve()
    await Promise.resolve()
    flush()
  }
  return { ...h, records, waiting, commit, draft, release }
}

test('Save all checks every draft before sending any valid row', async () => {
  const validate = vi.fn(validateEdits)
  const h = harness(3, validate)
  try {
    h.draft('1')
    h.draft('2')
    h.editing.change('2', 'name', '')
    flush()
    const result = await h.editing.saveAll()
    flush()
    expect(result).toEqual({
      status: 'blocked',
      saved: [],
      unchanged: [],
      failed: ['2'],
    })
    expect(validate).toHaveBeenCalledTimes(2)
    expect(h.commit).not.toHaveBeenCalled()
    expect(h.editing.drafts['1']?.note).toBe('Draft 1')
    expect(h.editing.drafts['2']?.fieldErrors.name).toBeTruthy()
    expect(h.editing.savingAll()).toBe(false)
  } finally {
    h.dispose()
    flush()
  }
})

test('Save all sends parsed values once and skips unchanged drafts', async () => {
  const validate = vi.fn(
    createValidator(
      z.object({
        name: z.string().check(z.trim()),
        note: z.string(),
        priority: z.string(),
      }),
    ),
  )
  const h = harness(2, validate)
  try {
    h.draft('1', '')
    h.editing.change('1', 'name', '  Updated  ')
    h.editing.begin('2')
    flush()
    const result = h.editing.saveAll()
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.commit.mock.calls[0]![0]).toEqual({
      id: '1',
      expectedRevision: '1',
      changes: { name: 'Updated' },
    })
    await h.release()
    expect(await result).toEqual({
      status: 'complete',
      saved: ['1'],
      unchanged: ['2'],
      failed: [],
    })
    flush()
    expect(validate).toHaveBeenCalledTimes(2)
    expect(h.records.get('1')?.name).toBe('Updated')
    expect(Object.keys(h.editing.drafts)).toEqual([])
  } finally {
    h.dispose()
    flush()
  }
})

test('Save all bounds concurrency, locks queued drafts and rechecks their revisions', async () => {
  const h = harness(6)
  try {
    for (let i = 1; i <= 6; i++) h.draft(String(i))
    const result = h.editing.saveAll()
    expect(h.commit).toHaveBeenCalledTimes(4)
    expect(await h.editing.saveAll()).toBeUndefined()
    expect(await h.editing.save('5')).toBe(false)
    h.editing.change('5', 'note', 'Late change')
    expect(h.editing.cancel('5')).toBe(false)
    flush()
    expect(h.editing.drafts['5']?.note).toBe('Draft 5')
    h.records.get('5')!.revision = '2'
    await h.release()
    expect(h.commit).toHaveBeenCalledTimes(5)
    expect(h.commit.mock.calls.some(([request]) => request.id === '5')).toBe(
      false,
    )
    expect(h.waiting.size).toBe(1)
    await h.release()
    const value = await result
    flush()
    expect(value?.status).toBe('partial')
    expect(value?.saved.sort()).toEqual(['1', '2', '3', '4', '6'])
    expect(value?.failed).toEqual(['5'])
    expect(h.editing.drafts['5']?.status).toBe('conflict')
    expect(h.editing.drafts['5']?.note).toBe('Draft 5')
  } finally {
    h.dispose()
    flush()
  }
})

test('new drafts after activation remain outside the running Save all', async () => {
  const h = harness(2)
  try {
    h.draft('1')
    const result = h.editing.saveAll()
    h.draft('2')
    await h.release()
    expect((await result)?.saved).toEqual(['1'])
    flush()
    expect(h.commit).toHaveBeenCalledTimes(1)
    expect(h.editing.drafts['2']?.note).toBe('Draft 2')
    expect(h.records.get('2')?.note).toBe('')
  } finally {
    h.dispose()
    flush()
  }
})

test('disposal aborts active batch requests and never starts queued rows', async () => {
  const h = harness(6)
  for (let i = 1; i <= 6; i++) h.draft(String(i))
  const result = h.editing.saveAll()
  expect(h.commit).toHaveBeenCalledTimes(4)
  h.dispose()
  flush()
  expect((await result)?.status).toBe('aborted')
  expect(h.commit).toHaveBeenCalledTimes(4)
  expect(h.waiting.size).toBe(0)
  expect(h.commit.mock.calls.every(([, signal]) => signal.aborted)).toBe(true)
  expect([...h.records.values()].every((row) => row.revision === '1')).toBe(
    true,
  )
})
