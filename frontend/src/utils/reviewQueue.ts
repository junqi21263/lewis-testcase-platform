import type { ReviewWorkspaceCase } from '@/types/reviews'

export type ReviewQueueFilter =
  | 'all'
  | 'low_quality'
  | 'ai_modified'
  | 'high_priority'
  | 'duplicate'
  | 'unhandled'

export const REVIEW_QUEUE_OPTIONS: Array<{ value: ReviewQueueFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'low_quality', label: '低质量' },
  { value: 'ai_modified', label: 'AI 修改' },
  { value: 'high_priority', label: 'P0/P1' },
  { value: 'duplicate', label: '重复建议' },
  { value: 'unhandled', label: '未处理' },
]

function tagsOf(item: ReviewWorkspaceCase): string[] {
  if (Array.isArray(item.tags)) return item.tags.map((tag) => String(tag).toLowerCase())
  return []
}

function commentOf(item: ReviewWorkspaceCase): string {
  return String(item.latestComment ?? '').toLowerCase()
}

export function isAiModifiedCase(item: ReviewWorkspaceCase): boolean {
  const tags = tagsOf(item)
  const comment = commentOf(item)
  return tags.includes('ai-closed-loop') || comment.includes('ai 闭环') || comment.includes('自动质量修复')
}

export function isDuplicateSuggestionCase(item: ReviewWorkspaceCase): boolean {
  const tags = tagsOf(item)
  const comment = commentOf(item)
  return tags.includes('ai-duplicate') || tags.includes('待合并') || comment.includes('重复')
}

export function isLowQualityCase(item: ReviewWorkspaceCase): boolean {
  const tags = tagsOf(item)
  const comment = commentOf(item)
  if (item.reviewStatus === 'changes_requested' || item.reviewStatus === 'rejected') return true
  if (isDuplicateSuggestionCase(item)) return true
  return (
    tags.includes('ai-closed-loop') ||
    comment.includes('缺少') ||
    comment.includes('不可执行') ||
    comment.includes('空泛') ||
    comment.includes('待修改')
  )
}

export function isHighPriorityCase(item: ReviewWorkspaceCase): boolean {
  return item.priority === 'P0' || item.priority === 'P1'
}

export function isUnhandledCase(item: ReviewWorkspaceCase): boolean {
  return item.reviewStatus === 'draft' || item.reviewStatus === 'pending_review'
}

export function matchesReviewQueueFilter(item: ReviewWorkspaceCase, filter: ReviewQueueFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'low_quality':
      return isLowQualityCase(item)
    case 'ai_modified':
      return isAiModifiedCase(item)
    case 'high_priority':
      return isHighPriorityCase(item)
    case 'duplicate':
      return isDuplicateSuggestionCase(item)
    case 'unhandled':
      return isUnhandledCase(item)
    default:
      return true
  }
}

export function getReviewQueueBadges(item: ReviewWorkspaceCase): string[] {
  const badges: string[] = []
  if (isHighPriorityCase(item)) badges.push('P0/P1')
  if (isAiModifiedCase(item)) badges.push('AI 修改')
  if (isDuplicateSuggestionCase(item)) badges.push('重复建议')
  if (isLowQualityCase(item)) badges.push('低质量')
  return [...new Set(badges)]
}
