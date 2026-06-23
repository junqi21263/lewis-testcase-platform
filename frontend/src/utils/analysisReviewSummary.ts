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

function deriveStrategyFallbacks(s: AnalysisStructuredResult) {
  const requirements = (s.requirements ?? []).slice(0, 4)
  const hasExceptionPath = (s.flowchart?.paths ?? []).some((p) => p.type === 'exception')
  const hasRisk = (s.risks ?? []).length > 0
  const hasSignal = requirements.length > 0 || (s.flowchart?.paths?.length ?? 0) > 0 || hasRisk
  if (!hasSignal) {
    return { scope: [], types: [], entryCriteria: [], exitCriteria: [] }
  }

  return {
    scope: requirements.length
      ? requirements.map((r) => `${r.id} ${r.text}`)
      : ['核心业务主流程、异常路径与高风险规则'],
    types: [
      '功能测试',
      hasExceptionPath ? '异常路径测试' : '',
      hasRisk ? '风险回归测试' : '',
      '接口契约测试',
    ].filter(Boolean),
    entryCriteria: ['需求文本已确认', '关键角色/权限/边界已补齐', '测试账号与基础数据可用'],
    exitCriteria: ['P0/P1 用例全部通过', '未覆盖需求已记录原因', '阻塞缺陷完成回归验证'],
  }
}

function deriveAutomationFallbacks(s: AnalysisStructuredResult) {
  const paths = s.flowchart?.paths ?? []
  const requirements = s.requirements ?? []
  const hasSignal = paths.length > 0 || requirements.length > 0 || (s.openQuestions?.length ?? 0) > 0
  if (!hasSignal) {
    return { automatable: [], manual: [], blocked: [] }
  }
  const automatable = paths.length
    ? paths.slice(0, 4).map((p) => `${p.id} ${p.nodes.join(' -> ')}`)
    : requirements.slice(0, 3).map((r) => `${r.id} ${r.text}`)
  const openQuestions = (s.openQuestions ?? [])
    .map((q) => (typeof q === 'string' ? q : q.text))
    .filter(Boolean)
    .slice(0, 3)

  return {
    automatable: automatable.length ? automatable : ['接口稳定且可通过页面或 API 断言的主流程'],
    manual: openQuestions.length ? openQuestions : ['视觉一致性、复杂权限审批、外部系统人工确认'],
    blocked: ['测试账号/权限数据', '第三方依赖或回调环境', '可复现的异常数据样本'],
  }
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
  const strategyFallbacks = deriveStrategyFallbacks(s)
  const automationFallbacks = deriveAutomationFallbacks(s)

  return {
    coverageText: `REQ ${reqCount} 个 · TP ${pathCount} 条`,
    qualityItems,
    warnings,
    openQuestions,
    testStrategyText: {
      scope: joinOrFallback(s.testStrategy?.scope, joinOrFallback(strategyFallbacks.scope, '待补充')),
      types: joinOrFallback(s.testStrategy?.types, joinOrFallback(strategyFallbacks.types, '待补充')),
      entryCriteria: joinOrFallback(s.testStrategy?.entryCriteria, joinOrFallback(strategyFallbacks.entryCriteria, '待补充')),
      exitCriteria: joinOrFallback(s.testStrategy?.exitCriteria, joinOrFallback(strategyFallbacks.exitCriteria, '待补充')),
    },
    automationText: {
      automatable: joinOrFallback(s.automationReadiness?.automatable, joinOrFallback(automationFallbacks.automatable, '待识别')),
      manual: joinOrFallback(s.automationReadiness?.manual, joinOrFallback(automationFallbacks.manual, '待识别')),
      blocked: joinOrFallback(s.automationReadiness?.blocked, joinOrFallback(automationFallbacks.blocked, '无')),
    },
    reviewPriority,
  }
}
