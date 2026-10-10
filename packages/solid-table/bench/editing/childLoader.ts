import { onCleanup } from 'solid-js'
import { createRecords } from './model'
import type { ChildLoad } from './createSubTables'
import type { RecordData } from './createEditing'

type LoadFault = 'none' | 'hold' | 'late' | 'empty' | 'refuse' | 'throw'

// Replace this transport at the App boundary. No parent record is copied.
export function createChildLoader(priority = 'normal') {
  let next: LoadFault = 'none'
  const held = new Set<() => void>()
  const pending = new Set<() => void>()
  onCleanup(() => {
    for (const cancel of pending) cancel()
    pending.clear()
    held.clear()
  })
  return {
    fault: (value: LoadFault) => {
      next = value
    },
    release: () => {
      for (const release of [...held]) release()
    },
    load(request: ChildLoad): Promise<Array<RecordData>> {
      const fault = next
      next = 'none'
      if (fault === 'throw')
        throw new Error('Sub-table load failed. Try again.')
      return new Promise((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        const cleanup = () => {
          clearTimeout(timer)
          held.delete(finish)
          pending.delete(cancel)
          request.signal.removeEventListener('abort', abort)
        }
        const finish = () => {
          cleanup()
          if (fault === 'refuse')
            reject(new Error('The server refused this sub-table. Try again.'))
          else
            resolve(
              createRecords(
                fault === 'empty' ? 0 : 5,
                `${request.parentId} ${request.scope} · `,
                priority,
              ),
            )
        }
        const cancel = () => {
          cleanup()
          reject(new Error('Loading canceled.'))
        }
        // A late transport deliberately ignores abort to exercise obsolete results.
        const abort = () => {
          if (fault !== 'late') cancel()
        }
        pending.add(cancel)
        request.signal.addEventListener('abort', abort, { once: true })
        if (fault === 'hold' || fault === 'late') held.add(finish)
        else timer = setTimeout(finish, 250)
        if (request.signal.aborted) abort()
      })
    },
  }
}
export type ChildLoader = ReturnType<typeof createChildLoader>
