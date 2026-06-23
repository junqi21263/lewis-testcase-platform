import type { AnalysisStructuredResult } from '@/types'

export type AnalysisReviewPriority = 'normal' | 'needs_attention'

export type AnalysisReviewSummary = {
  coverageText: string
  qualityItems: Array<{ label: string; value: number }>
  warnings: string[]
  openQuestions: string[]
  testStrategyText: {
    scope: string
    types: string
    entryCriteria: string
    exitCriteria: string
  }
  automationText: {
    automatable: string
    manual: string
    blocked: string
  }
  reviewPriority: AnalysisReviewPriority
}

function joinOrFallback(items: string[] | undefined, fallback: string) {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean)
  return clean.length ? clean.join('、') : fallback
}

export function buildAnalysisReviewSummary(
  structured: AnalysisStructuredResult | null | undefined,
): AnalysisReviewSummary {
  const s = structured ?? {}
  const reqCount = s.requirements?.length ?? 0
  const pathCount = s.flowchart?.paths?.length ?? 0
  const warnings = (s.inputWarnings ?? []).map((w) => w.message).filter(Boolean)
  const openQuestions = (s.openQuestions ?? [])
    .map((q) => (typeof q === 'string' ? q : q.text))
    .filter(Boolean)

  const qualityItems = s.qualityScores
    ? [
        { label: '完整性', value: s.qualityScores.completeness },
        { label: '可测试性', value: s.qualityScores.testability },
        { label: '接口明确', value: s.qualityScores.interfaceClarity },
        { label: '风险覆盖', value: s.qualityScores.riskCoverage },
        { label: '流程完整', value: s.qualityScores.flowCompleteness },
      ]
    : []

  const lowScore = qualityItems.some((item) => item.value < 70)
  const reviewPriority: AnalysisReviewPriority =
    warnings.length > 0 || openQuestions.length > 0 || lowScore
      ? 'needs_attention'
      : 'normal'

  return {
    coverageText: `REQ ${reqCount} 个 · TP ${pathCount} 条`,
    qualityItems,
    warnings,
    openQuestions,
    testStrategyText: {
      scope: joinOrFallback(s.testStrategy?.scope, '待补充'),
      types: joinOrFallback(s.testStrategy?.types, '待补充'),
      entryCriteria: joinOrFallback(s.testStrategy?.entryCriteria, '待补充'),
      exitCriteria: joinOrFallback(s.testStrategy?.exitCriteria, '待补充'),
    },
    automationText: {
      automatable: joinOrFallback(s.automationReadiness?.automatable, '待识别'),
      manual: joinOrFallback(s.automationReadiness?.manual, '待识别'),
      blocked: joinOrFallback(s.automationReadiness?.blocked, '无'),
    },
    reviewPriority,
  }
}
