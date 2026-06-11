import type { QualityIssueItem, QualityReport } from '@/types'

const ISSUE_SEVERITY_ORDER: Record<QualityIssueItem['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function buildCoverageSummaryLabel(report: QualityReport): string {
  if (report.coverageRate == null || report.requirementPointsTotal === 0) {
    return '当前输入不足以提取需求点'
  }
  const covered = report.coverage.filter((item) => item.status === 'covered').length
  return `已覆盖 ${covered} / ${report.requirementPointsTotal} 个需求点（${report.coverageRate}%）`
}

export function pickTopQualityIssues(report: QualityReport, limit = 5): QualityIssueItem[] {
  return [...report.issues]
    .sort((a, b) => {
      const sev = ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity]
      if (sev !== 0) return sev
      return a.caseTitle.localeCompare(b.caseTitle, 'zh-CN')
    })
    .slice(0, limit)
}

export function summarizeQualitySuggestions(report: QualityReport): string {
  return report.suggestions.filter(Boolean).join('；')
}
