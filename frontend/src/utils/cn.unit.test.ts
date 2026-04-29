import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('merges tailwind classes with later wins for conflicts', () => {
    expect(cn('px-2 py-1', 'px-4')).toMatch(/px-4/)
    expect(cn('px-2 py-1', 'px-4')).not.toMatch(/px-2/)
  })

  it('handles conditional class names', () => {
    expect(cn('base', false && 'hidden', true && 'block')).toBe('base block')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})
