import { describe, it, expect } from 'vitest'
import { normalizeApiBase } from './apiBaseUrl'

describe('normalizeApiBase', () => {
  it('strips trailing slashes', () => {
    expect(normalizeApiBase('https://api.example.com/api///')).toBe('https://api.example.com/api')
  })

  it('trims whitespace', () => {
    expect(normalizeApiBase('  /api  ')).toBe('/api')
  })

  it('falls back to /api when empty after trim', () => {
    expect(normalizeApiBase('   ')).toBe('/api')
    expect(normalizeApiBase('///')).toBe('/api')
  })
})
