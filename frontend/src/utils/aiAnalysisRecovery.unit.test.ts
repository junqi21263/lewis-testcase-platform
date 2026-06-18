import { describe, expect, it, vi } from 'vitest'
import {
  loadHumanReviewPreference,
  saveHumanReviewPreference,
  resolveRecoveredAnalysisStatus,
} from './aiAnalysisRecovery'

describe('ai analysis recovery helpers', () => {
  it('persists the human review preference across page entries', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    })

    saveHumanReviewPreference(false)

    expect(loadHumanReviewPreference()).toBe(false)
  })

  it('keeps a processing record in analyzing state when only a stream snapshot is available', () => {
    expect(resolveRecoveredAnalysisStatus('PROCESSING', true, 'partial report')).toBe('analyzing')
  })

  it('uses saved human review preference when recovering a completed report', () => {
    expect(resolveRecoveredAnalysisStatus('SUCCESS', true, 'complete report')).toBe('review')
    expect(resolveRecoveredAnalysisStatus('SUCCESS', false, 'complete report')).toBe('approved')
  })
})
