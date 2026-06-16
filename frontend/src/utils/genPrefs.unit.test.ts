import { beforeEach, describe, expect, it } from 'vitest'
import { loadGenPrefs, normalizeGenPrefs, saveGenPrefs } from './genPrefs'

describe('generation preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to a long-output max token budget', () => {
    expect(loadGenPrefs().defaultMaxTokens).toBe(32768)
  })

  it('normalizes max token preferences into the backend supported range', () => {
    expect(normalizeGenPrefs({ defaultTemperature: 0.7, defaultMaxTokens: 128 }).defaultMaxTokens).toBe(256)
    expect(normalizeGenPrefs({ defaultTemperature: 0.7, defaultMaxTokens: 200000 }).defaultMaxTokens).toBe(128000)
  })

  it('persists normalized generation preferences', () => {
    saveGenPrefs({ defaultTemperature: 0.9, defaultMaxTokens: 65536 })
    expect(loadGenPrefs()).toEqual({ defaultTemperature: 0.9, defaultMaxTokens: 65536 })
  })
})
