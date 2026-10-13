import { callHandler } from '../../../../ownedEvents.ts'
import type { JSX } from '@solidjs/web'

export { callHandler }

/** Create a new event handler which calls all given handlers in the order they were chained with the same event. */
export function composeEventHandlers<T>(
  handlers: Array<JSX.EventHandlerUnion<T, any> | undefined>,
) {
  return (event: any) => {
    for (const handler of handlers) {
      callHandler(event, handler)
    }
  }
}
