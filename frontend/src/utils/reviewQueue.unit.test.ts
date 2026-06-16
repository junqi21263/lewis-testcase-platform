import { describe, expect, it } from 'vitest'
import {
  getReviewQueueBadges,
  matchesReviewQueueFilter,
  type ReviewQueueFilter,
} from './reviewQueue'
import type { ReviewWorkspaceCase } from '@/types/reviews'

function item(patch: Partial<ReviewWorkspaceCase>): ReviewWorkspaceCase {
  return {
    id: 'case-1',
    title: '默认用例',
    priority: 'P2',
    type: 'FUNCTIONAL',
    tags: [],
    reviewStatus: 'pending_review',
    currentVersionNumber: 1,
    latestComment: null,
    reviewedAt: null,
    reviewId: 'review-1',
    updatedAt: '2026-06-16T00:00:00.000Z',
    ...patch,
  }
}

describe('review queue filters', () => {
  const cases: Record<ReviewQueueFilter, ReviewWorkspaceCase> = {
    all: item({}),
    low_quality: item({ reviewStatus: 'changes_requested', latestComment: '缺少预期结果' }),
    ai_modified: item({ tags: ['ai-closed-loop'], latestComment: 'AI 闭环优化：补充步骤' }),
    high_priority: item({ priority: 'P1' }),
    duplicate: item({ tags: ['ai-duplicate'], latestComment: 'AI 闭环标记重复' }),
    unhandled: item({ reviewStatus: 'pending_review' }),
  }

  it('按快捷队列识别用例', () => {
    expect(matchesReviewQueueFilter(cases.low_quality, 'low_quality')).toBe(true)
    expect(matchesReviewQueueFilter(cases.ai_modified, 'ai_modified')).toBe(true)
    expect(matchesReviewQueueFilter(cases.high_priority, 'high_priority')).toBe(true)
    expect(matchesReviewQueueFilter(cases.duplicate, 'duplicate')).toBe(true)
    expect(matchesReviewQueueFilter(cases.unhandled, 'unhandled')).toBe(true)
  })

  it('健康普通用例不会误入特殊队列', () => {
    const healthy = item({ reviewStatus: 'approved', priority: 'P2', tags: ['auth'] })
    expect(matchesReviewQueueFilter(healthy, 'low_quality')).toBe(false)
    expect(matchesReviewQueueFilter(healthy, 'ai_modified')).toBe(false)
    expect(matchesReviewQueueFilter(healthy, 'duplicate')).toBe(false)
    expect(matchesReviewQueueFilter(healthy, 'unhandled')).toBe(false)
  })

  it('输出列表徽标', () => {
    expect(getReviewQueueBadges(cases.ai_modified)).toContain('AI 修改')
    expect(getReviewQueueBadges(cases.duplicate)).toContain('重复建议')
    expect(getReviewQueueBadges(cases.low_quality)).toContain('低质量')
  })
})
