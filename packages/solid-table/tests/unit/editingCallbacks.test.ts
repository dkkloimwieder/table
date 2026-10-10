import { action, createRoot, flush } from 'solid-js'
import { expect, test } from 'vitest'
import { createModel } from '../../bench/editing/model'
import { defaultFields } from '../../bench/editing/fields'
import type { SaveResult } from '../../bench/editing/createEditing'

test('a disposed model ignores application success even when transport ignores cancellation', async () => {
  let resolve!: (result: SaveResult) => void
  let signal: AbortSignal | undefined
  const pending = new Promise<SaveResult>((accept) => {
    resolve = accept
  })
  const h = createRoot((dispose) => ({
    dispose,
    model: createModel(1, 'row', defaultFields, {
      validate: (data) => ({ success: true, data }),
      commit: (_request, requestSignal) => {
        signal = requestSignal
        return pending
      },
    }),
  }))
  const row = h.model.records.R0001!
  h.model.editing.begin('R0001')
  flush()
  h.model.editing.change('R0001', 'name', 'Application value')
  flush()
  const saved = h.model.editing.save('R0001')
  flush()
  expect(row.name).toBe('Record 0001')
  // Same synchronous disposal action as the browser fixture.
  // eslint-disable-next-line require-yield -- Synchronous disposal action.
  const dispose = action(function* () {
    h.dispose()
  })
  dispose()
  flush()
  expect(signal?.aborted).toBe(true)
  resolve({ status: 'saved', id: 'R0001', revision: 'application-revision' })
  expect(await saved).toBe(false)
  flush()
  expect(row.name).toBe('Record 0001')
  expect(row.revision).toBe('9007199254740993')
})
