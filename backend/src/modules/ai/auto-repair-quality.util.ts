import type { QualityReport } from './quality-check.util'

export type AutoRepairCounts = {
  addedCount: number
  updatedCount: number
  duplicateMarkedCount: number
  beforeScore: number
  afterScore: number
}

export function shouldAutoRepairQuality(report: QualityReport | null | undefined, threshold = 80): boolean {
  if (!report) return false
  if (report.score < threshold) return true
  if (report.nonExecutableCount > 0) return true
  if (report.issues.some((issue) => issue.severity === 'high')) return true
  if (report.coverage.some((item) => item.status === 'missing')) return true
  if (report.genericCount >= 2) return true
  if (report.duplicateCount >= 1) return true
  return false
}

export function buildAutoRepairNotice(result: AutoRepairCounts): string {
  return `已自动质量修复：新增 ${result.addedCount} 条，修订 ${result.updatedCount} 条，标记重复 ${result.duplicateMarkedCount} 条；评分 ${result.beforeScore} -> ${result.afterScore}`
}
