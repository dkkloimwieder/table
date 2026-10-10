import type {
  EditValues,
  SaveRequest,
  SaveResult,
  ValidationResult,
} from './createEditing'

export type EditingCallbacks = {
  validate: (values: EditValues) => ValidationResult
  commit: (request: SaveRequest, signal: AbortSignal) => Promise<SaveResult>
}

export type EditingCollection =
  { kind: 'root' } | { kind: 'child'; scope: string; parentId: string }

export type EditingCallbackFactory = (
  collection: EditingCollection,
) => EditingCallbacks
