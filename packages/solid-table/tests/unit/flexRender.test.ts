import { describe, expect, test, vi } from 'vitest'
import { createRoot, flush } from 'solid-js'
import { flexRender } from '../../src/FlexRender'

describe('flexRender', () => {
  test('handles empty, static, and component templates', () => {
    createRoot((dispose) => {
      flush()
      expect(flexRender(undefined, { value: 'unused' })).toBeNull()
      flush()
      expect(flexRender('static', { value: 'unused' })).toBe('static')
      flush()
      expect(flexRender(0, { value: 'unused' })).toBe(0)

      const Component = vi.fn((props: { value: string }) => {
        return `component:${props.value}`
      })

      flush()

      expect(flexRender(Component, { value: 'rendered' })).toBe(
        'component:rendered',
      )
      flush()
      expect(Component).toHaveBeenCalledWith({ value: 'rendered' })
      dispose()
    })
  })
})
