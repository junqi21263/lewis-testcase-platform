import type { CaseReviewStatus, RecordReviewStatus } from '@/types/reviews'
import {
  caseReviewBadgeClass,
  caseReviewStatusLabel,
  recordReviewBadgeClass,
  recordReviewStatusLabel,
} from '@/utils/reviewsUi'

export function CaseReviewStatusBadge({ status }: { status: CaseReviewStatus }) {
  return <span className={caseReviewBadgeClass(status)}>{caseReviewStatusLabel(status)}</span>
}

export function RecordReviewStatusBadge({ status }: { status: RecordReviewStatus }) {
  return <span className={recordReviewBadgeClass(status)}>{recordReviewStatusLabel(status)}</span>
}
