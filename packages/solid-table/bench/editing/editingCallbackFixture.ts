import { createEditValidator } from './validation'
import type { EditingFields } from './fields'
import type {
  EditingCallbackFactory,
  EditingCollection,
} from './editingCallbacks'
import type { SaveRequest } from './createEditing'

// Application callbacks for browser qualification, with manually released saves.
export function createEditingCallbackFixture(fields: EditingFields) {
  const validate = createEditValidator(fields)
  const collections: Array<EditingCollection> = []
  const sent: Array<{
    collection: EditingCollection
    request: SaveRequest
    signal: AbortSignal
  }> = []
  const waiting = new Set<() => void>()
  let next: 'none' | 'hold' | 'refuse' | 'throw' | 'wrong-id' = 'none'
  let validations = 0
  let revisions = 0
  const createCallbacks: EditingCallbackFactory = (collection) => {
    collections.push(collection)
    return {
      validate(values) {
        validations++
        const result = validate({ ...values, name: values.name.trim() })
        if (!result.success) return result
        if (!result.data.name.startsWith('App '))
          return {
            success: false,
            fieldErrors: { name: 'Start the name with App.' },
            message: 'Use the application name rule.',
          }
        return result
      },
      async commit(request, signal) {
        sent.push({ collection, request, signal })
        const fault = next
        next = 'none'
        if (fault === 'hold')
          await new Promise<void>((resolve) => {
            const release = () => {
              waiting.delete(release)
              resolve()
            }
            waiting.add(release)
          })
        else await Promise.resolve()
        if (fault === 'throw') throw new Error('Application transport failed')
        if (fault === 'refuse')
          return {
            status: 'refused',
            message: 'Application refused this save.',
          }
        return {
          status: 'saved',
          id: fault === 'wrong-id' ? 'another-record' : request.id,
          revision: `application-${++revisions}`,
        }
      },
    }
  }
  return {
    createCallbacks,
    fault(value: typeof next) {
      next = value
    },
    release() {
      for (const release of [...waiting]) release()
    },
    read: () => ({
      collections,
      validations,
      pending: waiting.size,
      sent: sent.map(({ collection, request, signal }) => ({
        collection,
        request,
        aborted: signal.aborted,
      })),
    }),
  }
}
