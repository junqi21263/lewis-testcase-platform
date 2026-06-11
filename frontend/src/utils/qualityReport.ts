import type { QualityIssueItem, QualityReport, TestCase } from '@/types'

const ISSUE_SEVERITY_ORDER: Record<QualityIssueItem['severity'], number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const
const RISKS = ['high', 'medium', 'low'] as const
const IMPORTANT_KEYWORDS = [
  '登录',
  '手机号',
  '密码',
  '账号',
  '错误',
  '失败',
  '成功',
  '提示',
  '支付',
  '订单',
  '导出',
  'excel',
  '权限',
  '管理员',
  '非管理员',
  '删除',
  '退款',
  '审批',
  '异常',
  '边界',
  '校验',
]
const HIGH_RISK_KEYWORDS = ['登录', '权限', '支付', '订单', '退款', '删除', '审批', '导出', '管理员']
const MEDIUM_RISK_KEYWORDS = ['异常', '边界', '校验', '兼容', '失败', '提示']
const GENERIC_TITLE_RE = /^(验证)?(功能|流程|场景|模块)?(测试|验证)(是否)?(正常|正确)?$|功能正常|验证功能正常|场景验证/
const GENERIC_STEP_RE = /^(验证|检查|测试)?功能(是否)?(正常|正确)?$|执行操作|查看结果|进行验证|验证功能/
const GENERIC_EXPECTED_RE = /^(成功|正常|符合预期|显示正确|通过|操作成功|结果正确)$/

function normalizeText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[，。；：、,.!！?？:;()[\]{}"'“”‘’\s_-]+/g, '')
}

function caseVisibleText(c: TestCase): string {
  return [
    c.title,
    c.precondition,
    c.steps.map((s) => `${s.action}${s.expected ?? ''}`).join(' '),
    c.expectedResult,
    c.tags.join(' '),
  ]
    .filter(Boolean)
    .join(' ')
}

function extractRequirementPoints(raw: string): string[] {
  return String(raw ?? '')
    .trim()
    .split(/\n+|(?<=。)|(?<=；)|(?<=;)/)
    .flatMap((line) => line.split(/(?:^|\s)(?:\d+[\.、．]|\-|\*|•)\s*/g))
    .map((line) =>
      line
        .replace(/^[#>\s\-*•\d.、．]+/, '')
        .replace(/[。；;]+$/, '')
        .trim(),
    )
    .filter((line) => line.length >= 6 && line.length <= 80)
    .filter((line) => !/^(需求|背景|说明|补充|如下|以上)/.test(line))
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 80)
}

function keywordsOf(text: string): string[] {
  const lower = text.toLowerCase()
  const words = new Set<string>()
  for (const word of IMPORTANT_KEYWORDS) {
    if (lower.includes(word.toLowerCase())) words.add(word.toLowerCase())
  }
  for (const match of lower.matchAll(/[a-z0-9]{2,}/g)) words.add(match[0])
  return [...words]
}

function riskOf(c: TestCase): 'high' | 'medium' | 'low' {
  const text = normalizeText(caseVisibleText(c))
  if (c.priority === 'P0' || c.priority === 'P1') return 'high'
  if (c.priority === 'P2') return 'medium'
  if (HIGH_RISK_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)))) return 'high'
  if (MEDIUM_RISK_KEYWORDS.some((keyword) => text.includes(normalizeText(keyword)))) return 'medium'
  return 'low'
}

function countBy(labels: readonly string[], values: string[]) {
  return labels.map((label) => ({ label, count: values.filter((value) => value === label).length }))
}

function fingerprint(c: TestCase): string {
  return normalizeText(
    `${c.title}|${c.steps.map((step) => step.action).slice(0, 3).join('')}|${c.expectedResult}`,
  )
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function buildLocalQualityReport(requirementText: string, cases: TestCase[]): QualityReport {
  const coverage = extractRequirementPoints(requirementText).map((requirement) => {
    const keys = keywordsOf(requirement)
    const pointNorm = normalizeText(requirement)
    const matchedCaseTitles: string[] = []
    let partial = false
    for (const c of cases) {
      const text = normalizeText(caseVisibleText(c))
      const hits = keys.filter((key) => text.includes(normalizeText(key))).length
      const ratio = keys.length ? hits / keys.length : 0
      if (pointNorm.length >= 8 && text.includes(pointNorm)) matchedCaseTitles.push(c.title)
      else if (keys.length >= 2 && ratio >= 0.62) matchedCaseTitles.push(c.title)
      else if (keys.length >= 2 && ratio >= 0.4) partial = true
    }
    return {
      requirement,
      status: matchedCaseTitles.length ? 'covered' : partial ? 'partial' : 'missing',
      matchedCaseTitles,
    } as const
  })

  const issues: QualityIssueItem[] = []
  const seen = new Map<string, string>()
  for (const c of cases) {
    const fp = fingerprint(c)
    if (fp && seen.has(fp)) {
      issues.push({
        caseTitle: c.title,
        type: 'duplicate',
        severity: 'medium',
        message: `与「${seen.get(fp)}」高度重复`,
      })
    } else if (fp) {
      seen.set(fp, c.title)
    }
    const hasGenericStep = c.steps.some((step) => GENERIC_STEP_RE.test(step.action.trim()))
    const expectedText = c.expectedResult.replace(/\[\d+\]/g, '').trim()
    if (GENERIC_TITLE_RE.test(c.title.trim())) {
      issues.push({ caseTitle: c.title, type: 'generic_title', severity: 'medium', message: '标题过于空泛' })
    }
    if (hasGenericStep) {
      issues.push({ caseTitle: c.title, type: 'generic_step', severity: 'medium', message: '步骤描述过于笼统' })
    }
    if (!c.steps.length) {
      issues.push({ caseTitle: c.title, type: 'missing_steps', severity: 'high', message: '缺少测试步骤' })
    }
    if (!c.expectedResult.trim()) {
      issues.push({ caseTitle: c.title, type: 'missing_expected', severity: 'high', message: '缺少预期结果' })
    } else if (GENERIC_EXPECTED_RE.test(expectedText)) {
      issues.push({ caseTitle: c.title, type: 'generic_expected', severity: 'medium', message: '预期结果过于泛化' })
    }
    if (hasGenericStep || c.steps.every((step) => normalizeText(step.action).length < 6) || normalizeText(c.expectedResult).length < 8) {
      issues.push({ caseTitle: c.title, type: 'non_executable', severity: 'high', message: '缺少明确操作或可验证结果' })
    }
  }

  const coveredCount = coverage.filter((item) => item.status === 'covered').length
  const partialCount = coverage.filter((item) => item.status === 'partial').length
  const coverageRate = coverage.length
    ? Math.round(((coveredCount + partialCount * 0.5) / coverage.length) * 100)
    : null
  const duplicateCount = issues.filter((item) => item.type === 'duplicate').length
  const genericCount = new Set(
    issues
      .filter((item) => ['generic_title', 'generic_step', 'generic_expected', 'low_detail'].includes(item.type))
      .map((item) => item.caseTitle),
  ).size
  const nonExecutableCount = new Set(
    issues
      .filter((item) => ['missing_steps', 'missing_expected', 'non_executable'].includes(item.type))
      .map((item) => item.caseTitle),
  ).size
  const priorityDistribution = countBy(PRIORITIES, cases.map((c) => c.priority))
  const riskDistribution = countBy(RISKS, cases.map(riskOf))
  const missing = coverage.filter((item) => item.status === 'missing')
  const suggestions = [
    missing.length > 0 ? `补充未覆盖需求点：${missing.slice(0, 3).map((item) => item.requirement).join('、')}` : '',
    duplicateCount > 0 ? '合并或删除重复用例，保留覆盖路径更完整的一条。' : '',
    genericCount > 0 || nonExecutableCount > 0 ? '细化空泛用例的标题、操作步骤和预期结果，确保可以直接执行。' : '',
  ].filter(Boolean)
  if (suggestions.length === 0) suggestions.push('当前生成结果结构较完整，可进入人工评审。')
  const coverageScore = coverageRate ?? 70
  const duplicatePenalty = cases.length ? Math.min(20, (duplicateCount / cases.length) * 80) : 0
  const qualityPenalty = cases.length ? Math.min(25, ((genericCount + nonExecutableCount) / cases.length) * 65) : 0
  const score = clampScore(coverageScore * 0.4 + (20 - duplicatePenalty) + (25 - qualityPenalty) + 15)

  return {
    score,
    summary:
      coverageRate == null
        ? `已检查 ${cases.length} 条用例，当前输入不足以计算需求覆盖率。`
        : `覆盖 ${coveredCount}/${coverage.length} 个需求点，发现 ${issues.length} 个质量问题。`,
    requirementPointsTotal: coverage.length,
    coverageRate,
    coverage,
    duplicateCount,
    genericCount,
    nonExecutableCount,
    riskDistribution,
    priorityDistribution,
    suggestions,
    issues,
  }
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
