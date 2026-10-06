import {
  createRoot,
  createSignal,
  flush,
  onCleanup,
  runWithOwner,
} from 'solid-js'
import { beforeEach, expect, test, vi } from 'vitest'
import { createSubTables } from '../../bench/editing/createSubTables'
import { createModel } from '../../bench/editing/model'
import type { ChildLoad } from '../../bench/editing/createSubTables'
import type { RecordData } from '../../bench/editing/createEditing'
import type { EditingModel } from '../../bench/editing/model'

vi.mock('../../bench/editing/model', () => ({ createModel: vi.fn() }))

const records: Array<RecordData> = [
  { id: 'child', name: 'Child', note: '', priority: 'normal', revision: '1' },
]
const cleanup = vi.fn()
const modelFactory = vi.mocked(createModel)

beforeEach(() => {
  cleanup.mockReset()
  modelFactory.mockReset()
  modelFactory.mockImplementation(() => {
    onCleanup(cleanup)
    const [locked, setLocked] = createSignal(false)
    return {
      locked,
      setLocked,
      editing: { drafts: {}, collapse: vi.fn() },
    } as unknown as EditingModel
  })
})

function harness(
  load: (request: ChildLoad) => Promise<Array<RecordData>>,
  ready?: (model: EditingModel, scope: string, parentId: string) => void,
) {
  return createRoot((dispose) => {
    const [ids, setIds] = createSignal<ReadonlyArray<string>>(['parent'])
    const [scope, setScope] = createSignal('dataset')
    const onEditingChange = vi.fn()
    const tables = createSubTables({
      ids,
      scope,
      locked: () => false,
      onEditingChange,
      load,
      ready,
    })
    return { tables, dispose, setIds, setScope, onEditingChange }
  })
}

async function settle() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  flush()
}

test('a throwing ready callback releases its model and permits retry with editing locks', async () => {
  const ready = vi.fn().mockImplementationOnce(() => {
    throw new Error('Ready failed')
  })
  const h = harness(() => Promise.resolve(records), ready)
  try {
    const entry = h.tables.open('parent')!
    await settle()
    expect(entry.state()).toEqual({ status: 'error', message: 'Ready failed' })
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(h.tables.counts.created).toBe(0)
    expect(h.onEditingChange).not.toHaveBeenCalledWith(true)
    entry.load()
    await settle()
    const state = entry.state()
    expect(state.status).toBe('ready')
    if (state.status !== 'ready') throw new Error('Expected a ready child')
    const model = state.model as EditingModel & {
      setLocked: (locked: boolean) => void
    }
    model.setLocked(true)
    flush()
    expect(h.onEditingChange).toHaveBeenLastCalledWith(true)
    model.setLocked(false)
    flush()
    expect(h.onEditingChange).toHaveBeenLastCalledWith(false)
    expect(h.tables.counts.created).toBe(1)
  } finally {
    h.dispose()
    flush()
  }
  expect(cleanup).toHaveBeenCalledTimes(2)
})

test.each([undefined, null, 2, {}])(
  'invalid loader data %j produces a recoverable error',
  async (invalid) => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValue(records)
    const h = harness(load)
    try {
      const entry = h.tables.open('parent')!
      await settle()
      expect(entry.state()).toEqual({
        status: 'error',
        message: 'The sub-table loader must return records.',
      })
      expect(modelFactory).not.toHaveBeenCalled()
      entry.load()
      await settle()
      expect(entry.state().status).toBe('ready')
    } finally {
      h.dispose()
      flush()
    }
  },
)

test('a model initialization failure disposes partial resources before retry', async () => {
  modelFactory.mockImplementationOnce(() => {
    onCleanup(cleanup)
    throw new Error('Invalid child records')
  })
  const h = harness(() => Promise.resolve(records))
  try {
    const entry = h.tables.open('parent')!
    await settle()
    expect(entry.state()).toEqual({
      status: 'error',
      message: 'Invalid child records',
    })
    expect(cleanup).toHaveBeenCalledTimes(1)
    entry.load()
    await settle()
    expect(entry.state().status).toBe('ready')
  } finally {
    h.dispose()
    flush()
  }
  expect(cleanup).toHaveBeenCalledTimes(2)
})

test('a synchronous loader failure uses the same recoverable error state', async () => {
  const load = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('Loader failed')
    })
    .mockResolvedValue(records)
  const h = harness(load)
  try {
    const entry = h.tables.open('parent')!
    await settle()
    expect(entry.state()).toEqual({
      status: 'error',
      message: 'Loader failed',
    })
    entry.load()
    await settle()
    expect(entry.state().status).toBe('ready')
  } finally {
    h.dispose()
    flush()
  }
})

test.each(['resolve', 'reject'] as const)(
  'a replaced request ignores its late %s',
  async (outcome) => {
    let resolve!: (value: Array<RecordData>) => void
    let reject!: (error: Error) => void
    let signal!: AbortSignal
    const load = vi
      .fn()
      .mockImplementationOnce((request: ChildLoad) => {
        signal = request.signal
        return new Promise<Array<RecordData>>((accept, fail) => {
          resolve = accept
          reject = fail
        })
      })
      .mockResolvedValue(records)
    const h = harness(load)
    try {
      const entry = h.tables.open('parent')!
      await settle()
      entry.load()
      await settle()
      expect(signal.aborted).toBe(true)
      if (outcome === 'resolve') resolve(records)
      else reject(new Error('Old failure'))
      await settle()
      expect(entry.state().status).toBe('ready')
      expect(modelFactory).toHaveBeenCalledTimes(1)
      expect(h.tables.counts.ignored).toBe(1)
    } finally {
      h.dispose()
      flush()
    }
  },
)

test('disposal aborts the loader and ignores its late response', async () => {
  let resolve!: (value: Array<RecordData>) => void
  let signal!: AbortSignal
  const h = harness((request) => {
    signal = request.signal
    return new Promise((accept) => {
      resolve = accept
    })
  })
  h.tables.open('parent')
  await settle()
  h.dispose()
  flush()
  expect(signal.aborted).toBe(true)
  resolve(records)
  await settle()
  expect(modelFactory).not.toHaveBeenCalled()
  expect(h.tables.counts.ignored).toBe(1)
})

test('a ready callback that removes the parent releases the attempt without publishing it', async () => {
  // Simulate a parent event outside the child's setup scope.
  const h = harness(
    () => Promise.resolve(records),
    () =>
      runWithOwner(null, () => {
        h.setIds([])
        flush()
      }),
  )
  try {
    const entry = h.tables.open('parent')!
    await settle()
    expect(entry.state().status).toBe('loading')
    expect(h.tables.get('parent')).toBeUndefined()
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(h.tables.counts.created).toBe(0)
    expect(h.tables.counts.ignored).toBe(1)
  } finally {
    h.dispose()
    flush()
  }
  expect(cleanup).toHaveBeenCalledTimes(1)
})

test('a retry from the ready callback releases only the superseded model scope', async () => {
  // Simulate a retry event outside the child's setup scope.
  const ready = vi
    .fn()
    .mockImplementationOnce(() => runWithOwner(null, () => entry.load()))
  const h = harness(() => Promise.resolve(records), ready)
  const entry = h.tables.open('parent')!
  try {
    await settle()
    expect(entry.state().status).toBe('ready')
    expect(ready).toHaveBeenCalledTimes(2)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(h.tables.counts.created).toBe(1)
    expect(h.tables.counts.ignored).toBe(1)
  } finally {
    h.dispose()
    flush()
  }
  expect(cleanup).toHaveBeenCalledTimes(2)
})
