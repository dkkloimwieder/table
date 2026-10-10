import type { EditColumn } from './createEditing'

export type FieldChoice = { value: string; label: string; disabled?: boolean }
export type EditingField = {
  label: string
  filterLabel: string
  emptyLabel: string
  choices?: ReadonlyArray<FieldChoice>
  placeholder?: string
}
export type EditingFields = Record<EditColumn, EditingField> & {
  priority: EditingField & {
    choices: ReadonlyArray<FieldChoice>
    initialValue: string
    invalidMessage: string
  }
}

export const defaultFields: EditingFields = {
  name: {
    label: 'Name',
    filterLabel: 'Filter saved names',
    emptyLabel: 'Empty value',
  },
  note: {
    label: 'Note',
    filterLabel: 'Filter saved notes',
    emptyLabel: 'Add note',
  },
  priority: {
    label: 'Priority',
    filterLabel: 'Filter priority',
    emptyLabel: 'Empty value',
    placeholder: 'Choose priority',
    initialValue: 'normal',
    invalidMessage: 'Choose Low, Normal, or High.',
    choices: [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
    ],
  },
}

// The popup demo supplies extra choices to exercise blank and disabled values.
export const popupFields: EditingFields = {
  ...defaultFields,
  priority: {
    ...defaultFields.priority,
    choices: [
      { value: '', label: 'No priority' },
      ...defaultFields.priority.choices,
      { value: 'unavailable', label: 'Unavailable', disabled: true },
    ],
  },
}

export const workflowFields: EditingFields = {
  name: {
    label: 'Work item',
    filterLabel: 'Filter work items',
    emptyLabel: 'Untitled item',
  },
  note: {
    label: 'Description',
    filterLabel: 'Filter descriptions',
    emptyLabel: 'Add description',
  },
  priority: {
    label: 'Workflow',
    filterLabel: 'Filter workflow',
    emptyLabel: 'No workflow',
    placeholder: 'Choose workflow',
    initialValue: 'active',
    invalidMessage: 'Choose Queued, Active, or Done.',
    choices: [
      { value: 'queued', label: 'Queued' },
      { value: 'active', label: 'Active' },
      { value: 'done', label: 'Done' },
      { value: 'blocked', label: 'Blocked', disabled: true },
    ],
  },
}
