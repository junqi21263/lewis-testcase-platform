import type { AnalysisCrossReviewStatus } from './analysis-structured-report.util'

export type AnalysisVersionLike = {
  versionNumber: number
}

export type AnalysisDiffInput = {
  markdown: string
  structured?: unknown
}

export type AnalysisVersionDiffField = {
  field: string
  label: string
  before: string
  after: string
  changed: boolean
}

const CROSS_REVIEW_STATUSES: AnalysisCrossReviewStatus[] = [
  'pending',
  'running',
  'success',
  'skipped',
  'failed',
]

export function normalizeCrossReviewStatus(value: unknown): AnalysisCrossReviewStatus {
  return CROSS_REVIEW_STATUSES.includes(value as AnalysisCrossReviewStatus)
    ? (value as AnalysisCrossReviewStatus)
    : 'pending'
}

export function nextAnalysisVersionNumber(versions: AnalysisVersionLike[]): number {
  if (!versions.length) return 1
  return Math.max(...versions.map((v) => Number(v.versionNumber) || 0)) + 1
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stable(value: unknown): string {
  if (value == null) return '无'
  if (typeof value === 'string') return value.trim() || '无'
  if (Array.isArray(value) && value.length === 0) return '无'
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        const obj = asRecord(item)
        return String(obj.text ?? obj.id ?? JSON.stringify(item))
      })
      .join('\n')
  }
  return JSON.stringify(value, null, 2)
}

export function buildAnalysisVersionDiff(
  left: AnalysisDiffInput,
  right: AnalysisDiffInput,
): AnalysisVersionDiffField[] {
  const leftStructured = asRecord(left.structured)
  const rightStructured = asRecord(right.structured)
  const fields: AnalysisVersionDiffField[] = []
  const push = (field: string, label: string, before: unknown, after: unknown) => {
    const b = stable(before)
    const a = stable(after)
    fields.push({ field, label, before: b, after: a, changed: b !== a })
  }

  push('markdown', '报告正文', left.markdown, right.markdown)
  push('qualityScores', '质量评分', leftStructured.qualityScores, rightStructured.qualityScores)
  push('openQuestions', '待确认问题', leftStructured.openQuestions, rightStructured.openQuestions)
  push('inputWarnings', '输入质量提醒', leftStructured.inputWarnings, rightStructured.inputWarnings)
  push('testStrategy', '测试策略', leftStructured.testStrategy, rightStructured.testStrategy)
  push('automationReadiness', 'Agent 执行准备', leftStructured.automationReadiness, rightStructured.automationReadiness)
  return fields
}
