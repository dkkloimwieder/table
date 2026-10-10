import { action, createRoot, flush } from 'solid-js'
import { expect, test } from 'vitest'
import { createModel } from '../../bench/editing/model'
import type { RecordData } from '../../bench/editing/createEditing'

test('background updates accept application revision strings and preserve record identity', () => {
  const records: ReadonlyArray<RecordData> = Object.freeze([
    {
      id: 'app:1',
      name: 'Application record',
      note: '',
      priority: 'normal',
      revision: 'server:first',
    },
  ])
  const h = createRoot((dispose) => ({ dispose, model: createModel(records) }))
  // eslint-disable-next-line require-yield -- Synchronous disposal action.
  const dispose = action(function* () {
    h.dispose()
  })
  try {
    const row = h.model.records['app:1']!
    h.model.patch('app:1', {
      name: 'Background update',
      revision: 'server:second',
    })
    flush()
    expect(h.model.records['app:1']).toBe(row)
    expect(row.name).toBe('Background update')
    expect(row.revision).toBe('server:second')
    expect(h.model.table.getSourceIds()).toEqual(['app:1'])
    expect(records.map(({ id }) => id)).toEqual(['app:1'])
  } finally {
    dispose()
    flush()
  }
})

test('missing application revisions cannot partially update records with nonnumeric revision strings', () => {
  const h = createRoot((dispose) => ({
    dispose,
    model: createModel([
      {
        id: 'app:1',
        name: 'Application record',
        note: '',
        priority: 'normal',
        revision: 'server:first',
      },
    ]),
  }))
  // eslint-disable-next-line require-yield -- Synchronous disposal action.
  const dispose = action(function* () {
    h.dispose()
  })
  try {
    expect(() =>
      h.model.patch('app:1', { name: 'Incomplete update' }),
    ).toThrow()
    flush()
    expect(h.model.records['app:1']?.name).toBe('Application record')
    expect(h.model.records['app:1']?.revision).toBe('server:first')
  } finally {
    dispose()
    flush()
  }
})
