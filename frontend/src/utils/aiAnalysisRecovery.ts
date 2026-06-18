import type { GenerationStatus } from '@/types'

const HUMAN_REVIEW_STORAGE_KEY = 'ai-analysis-human-review-enabled'

export type RecoveredAnalysisStatus = 'analyzing' | 'review' | 'approved' | 'error' | 'idle'

export function loadHumanReviewPreference(): boolean {
  try {
    const raw = localStorage.getItem(HUMAN_REVIEW_STORAGE_KEY)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  } catch {
    /* storage unavailable */
  }
  return true
}

export function saveHumanReviewPreference(enabled: boolean): void {
  try {
    localStorage.setItem(HUMAN_REVIEW_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* storage unavailable */
  }
}

export function resolveRecoveredAnalysisStatus(
  recordStatus: GenerationStatus,
  humanReviewEnabled: boolean,
  reportText: string,
): RecoveredAnalysisStatus {
  const hasReport = reportText.trim().length > 0
  if (recordStatus === 'PROCESSING' || recordStatus === 'PENDING') return hasReport ? 'analyzing' : 'idle'
  if (recordStatus === 'FAILED' || recordStatus === 'CANCELLED') return 'error'
  if (recordStatus === 'SUCCESS') return humanReviewEnabled ? 'review' : 'approved'
  return 'idle'
}
