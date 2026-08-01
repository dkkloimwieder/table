// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { mergeObjects } from '../src/merge-objects'
import MergedOptionsHarness from './fixtures/MergedOptionsHarness.svelte'
import type { OnChangeFn, SortingState } from '@tanstack/table-core'

function outputText(name: string) {
  return screen.getByRole('status', { name }).textContent
}

/**
 * The wrapper pattern this whole helper exists for: an optional prop that the
 * caller never set, forwarded as `{ onSortingChange: props.onSortingChange }`.
 */
const wrapperProps: { onSortingChange?: OnChangeFn<SortingState> } = {}

describe('Svelte merged table options', () => {
  test('an unset optional onSortingChange keeps the feature default handler', async () => {
    render(MergedOptionsHarness, {
      onSortingChange: wrapperProps.onSortingChange,
    })

    expect(outputText('Sorting change handler')).toBe('function')
    expect(outputText('Sorted row ids')).toBe('1,2')

    await fireEvent.click(
      screen.getByRole('button', { name: 'Sort title ascending' }),
    )

    expect(outputText('Sorting state')).toBe('[{"id":"title","desc":false}]')
    expect(outputText('Sorted row ids')).toBe('2,1')

    await fireEvent.click(
      screen.getByRole('button', { name: 'Sort title descending' }),
    )

    expect(outputText('Sorting state')).toBe('[{"id":"title","desc":true}]')
    expect(outputText('Sorted row ids')).toBe('1,2')
  })
})

describe('mergeObjects', () => {
  test('a present-but-undefined value never overrides an earlier source', () => {
    const defaultHandler = vi.fn<OnChangeFn<SortingState>>()
    const merged = mergeObjects(
      { enableSorting: true, onSortingChange: defaultHandler },
      { enableSorting: false, ...wrapperProps },
    )

    expect(merged.onSortingChange).toBe(defaultHandler)
    expect(merged.enableSorting).toBe(false)
  })

  test('leaves an all-undefined key off the result so spreads cannot re-apply it', () => {
    const merged: Record<string, unknown> = mergeObjects(
      { enableSorting: true },
      { onSortingChange: undefined },
    )

    expect(Object.hasOwn(merged, 'onSortingChange')).toBe(false)

    // `constructTable` spreads the options over the feature defaults, so an own
    // key holding `undefined` would erase the default handler right there even
    // though every merge along the way skips it.
    const spread = { onSortingChange: 'feature-default', ...merged }

    expect(spread.onSortingChange).toBe('feature-default')
  })
})
