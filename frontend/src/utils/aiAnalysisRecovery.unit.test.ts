import { describe, expect, it, vi } from 'vitest'
import {
  clearPendingAnalysisRecordId,
  loadPendingAnalysisRecordId,
  loadHumanReviewPreference,
  resolveRecoveredAnalysisStatus,
  saveHumanReviewPreference,
  savePendingAnalysisRecordId,
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

  it('defaults human review on when storage is missing or malformed', () => {
    const storage = new Map<string, string>([['ai-analysis-human-review-enabled', 'maybe']])
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    })

    expect(loadHumanReviewPreference()).toBe(true)

    storage.set('ai-analysis-human-review-enabled', 'true')
    expect(loadHumanReviewPreference()).toBe(true)
  })

  it('keeps a processing record in analyzing state when only a stream snapshot is available', () => {
    expect(resolveRecoveredAnalysisStatus('PROCESSING', true, 'partial report')).toBe('analyzing')
  })

  it('uses saved human review preference when recovering a completed report', () => {
    expect(resolveRecoveredAnalysisStatus('SUCCESS', true, 'complete report')).toBe('review')
    expect(resolveRecoveredAnalysisStatus('SUCCESS', false, 'complete report')).toBe('approved')
  })

  it('persists the pending analysis record id for refresh recovery', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    })

    savePendingAnalysisRecordId('record-1')
    expect(loadPendingAnalysisRecordId()).toBe('record-1')

    clearPendingAnalysisRecordId()
    expect(loadPendingAnalysisRecordId()).toBeNull()
  })

  it('handles unavailable storage without breaking recovery helpers', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('denied')
      }),
      setItem: vi.fn(() => {
        throw new Error('denied')
      }),
      removeItem: vi.fn(() => {
        throw new Error('denied')
      }),
    })

    expect(loadHumanReviewPreference()).toBe(true)
    expect(loadPendingAnalysisRecordId()).toBeNull()
    expect(() => saveHumanReviewPreference(true)).not.toThrow()
    expect(() => savePendingAnalysisRecordId('record-2')).not.toThrow()
    expect(() => clearPendingAnalysisRecordId()).not.toThrow()
  })
})
