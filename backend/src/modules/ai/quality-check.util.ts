import { normalizeCaseRowForPersistence, type NormalizedCaseShape } from './case-row-normalize.util'

export type QualityIssueType =
  | 'duplicate'
  | 'generic_title'
  | 'generic_step'
  | 'generic_expected'
  | 'missing_steps'
  | 'missing_expected'
  | 'low_detail'
  | 'non_executable'

export type CoverageStatus = 'covered' | 'partial' | 'missing'
export type RiskLevel = 'high' | 'medium' | 'low'
export type QualitySeverity = 'high' | 'medium' | 'low'

export type QualityIssueItem = {
  caseTitle: string
  type: QualityIssueType
  severity: QualitySeverity
  message: string
}

export type CoverageItem = {
  requirement: string
  status: CoverageStatus
  matchedCaseTitles: string[]
}

export type DistributionItem = {
  label: string
  count: number
}

export type QualityReport = {
  score: number
  summary: string
  requirementPointsTotal: number
  coverageRate: number | null
  coverage: CoverageItem[]
  duplicateCount: number
  genericCount: number
  nonExecutableCount: number
  riskDistribution: DistributionItem[]
  priorityDistribution: DistributionItem[]
  suggestions: string[]
  issues: QualityIssueItem[]
}

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const
const RISKS: RiskLevel[] = ['high', 'medium', 'low']

const IMPORTANT_KEYWORDS = [
  '登录',
  '登出',
  '注册',
  '手机号',
  '密码',
  '账号',
  '错误',
  '失败',
  '成功',
  '提示',
  '支付',
  '订单',
  '订单列表',
  '导出',
  'excel',
  '权限',
  '管理员',
  '非管理员',
  '删除',
  '退款',
  '审批',
  '通知',
  '上传',
  '下载',
  '查询',
  '保存',
  '提交',
  '审核',
  '边界',
  '异常',
  '校验',
]

const HIGH_RISK_KEYWORDS = [
  '登录',
  '权限',
  '支付',
  '下单',
  '订单',
  '退款',
  '删除',
  '审批',
  '导出',
  '核心',
  '管理员',
]

const MEDIUM_RISK_KEYWORDS = ['异常', '边界', '校验', '兼容', '失败', '提示']
const GENERIC_TITLE_RE = /^(验证)?(功能|流程|场景|模块)?(测试|验证)(是否)?(正常|正确)?$|功能正常|验证功能正常|场景验证/
const GENERIC_STEP_RE = /^(验证|检查|测试)?功能(是否)?(正常|正确)?$|执行操作|查看结果|进行验证|验证功能/
const GENERIC_EXPECTED_RE = /^(成功|正常|符合预期|显示正确|通过|操作成功|结果正确)$/

function normalizeText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[，。；：、,.!！?？:;()[\]{}"'“”‘’\s_-]+/g, '')
}

function visibleText(c: NormalizedCaseShape): string {
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

export function extractRequirementPoints(raw: string): string[] {
  const text = String(raw ?? '').trim()
  if (!text) return []
  const candidates = text
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

  return [...new Set(candidates)].slice(0, 80)
}

function keywordsOf(text: string): string[] {
  const lower = text.toLowerCase()
  const words = new Set<string>()
  for (const word of IMPORTANT_KEYWORDS) {
    if (lower.includes(word.toLowerCase())) words.add(word.toLowerCase())
  }
  for (const m of lower.matchAll(/[a-z0-9]{2,}/g)) {
    words.add(m[0])
  }
  return [...words]
}

function analyzeCoverage(requirementText: string, cases: NormalizedCaseShape[]): CoverageItem[] {
  const points = extractRequirementPoints(requirementText)
  return points.map((point) => {
    const pointNorm = normalizeText(point)
    const keys = keywordsOf(point)
    const matchedCaseTitles: string[] = []
    let hasPartial = false

    for (const c of cases) {
      const caseText = visibleText(c)
      const caseNorm = normalizeText(caseText)
      const keyHits = keys.filter((k) => caseNorm.includes(normalizeText(k))).length
      const ratio = keys.length > 0 ? keyHits / keys.length : 0
      if (pointNorm.length >= 8 && caseNorm.includes(pointNorm)) {
        matchedCaseTitles.push(c.title)
      } else if (keys.length >= 2 && ratio >= 0.62) {
        matchedCaseTitles.push(c.title)
      } else if (keys.length >= 2 && ratio >= 0.4) {
        hasPartial = true
      }
    }

    if (matchedCaseTitles.length > 0) {
      return { requirement: point, status: 'covered' as const, matchedCaseTitles }
    }
    return {
      requirement: point,
      status: hasPartial ? 'partial' : 'missing',
      matchedCaseTitles: [],
    }
  })
}

function fingerprint(c: NormalizedCaseShape): string {
  const steps = c.steps.map((s) => s.action).slice(0, 3).join('')
  return normalizeText(`${c.title}|${steps}|${c.expectedResult}`)
}

function detectIssues(cases: NormalizedCaseShape[]): QualityIssueItem[] {
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

    if (GENERIC_TITLE_RE.test(c.title.trim())) {
      issues.push({
        caseTitle: c.title,
        type: 'generic_title',
        severity: 'medium',
        message: '标题过于空泛，缺少明确业务对象和结果',
      })
    }

    const hasGenericStep = c.steps.some((s) => GENERIC_STEP_RE.test(s.action.trim()))
    if (hasGenericStep) {
      issues.push({
        caseTitle: c.title,
        type: 'generic_step',
        severity: 'medium',
        message: '步骤描述过于笼统，难以直接执行',
      })
    }

    if (!c.steps.length) {
      issues.push({
        caseTitle: c.title,
        type: 'missing_steps',
        severity: 'high',
        message: '缺少测试步骤',
      })
    }

    if (!c.expectedResult.trim() || c.expectedResult === '（无）') {
      issues.push({
        caseTitle: c.title,
        type: 'missing_expected',
        severity: 'high',
        message: '缺少可验证的预期结果',
      })
    } else if (GENERIC_EXPECTED_RE.test(c.expectedResult.replace(/\[\d+\]/g, '').trim())) {
      issues.push({
        caseTitle: c.title,
        type: 'generic_expected',
        severity: 'medium',
        message: '预期结果过于泛化，缺少可验证断言',
      })
    }

    const shortSteps = c.steps.length === 0 || c.steps.every((s) => normalizeText(s.action).length < 6)
    const shortExpected = normalizeText(c.expectedResult).length < 8
    if (shortSteps || shortExpected || hasGenericStep) {
      issues.push({
        caseTitle: c.title,
        type: 'non_executable',
        severity: 'high',
        message: '缺少明确操作或可验证结果，不适合直接执行',
      })
    }
  }

  return issues
}

function riskOf(c: NormalizedCaseShape): RiskLevel {
  const text = normalizeText(visibleText(c))
  if (c.priority === 'P0' || c.priority === 'P1') return 'high'
  if (c.priority === 'P2') return 'medium'
  if (HIGH_RISK_KEYWORDS.some((k) => text.includes(normalizeText(k)))) return 'high'
  if (MEDIUM_RISK_KEYWORDS.some((k) => text.includes(normalizeText(k)))) return 'medium'
  return 'low'
}

function countBy(labels: readonly string[], values: string[]): DistributionItem[] {
  return labels.map((label) => ({ label, count: values.filter((v) => v === label).length }))
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function buildSuggestions(opts: {
  coverage: CoverageItem[]
  duplicateCount: number
  genericCount: number
  nonExecutableCount: number
  riskDistribution: DistributionItem[]
  cases: NormalizedCaseShape[]
}): string[] {
  const suggestions: string[] = []
  const missing = opts.coverage.filter((item) => item.status === 'missing')
  if (missing.length > 0) {
    suggestions.push(`补充未覆盖需求点：${missing.slice(0, 3).map((item) => item.requirement).join('、')}`)
  }
  if (opts.duplicateCount > 0) {
    suggestions.push('合并或删除重复用例，保留覆盖路径更完整的一条。')
  }
  if (opts.genericCount > 0 || opts.nonExecutableCount > 0) {
    suggestions.push('细化空泛用例的标题、操作步骤和预期结果，确保可以直接执行。')
  }
  const high = opts.riskDistribution.find((item) => item.label === 'high')?.count ?? 0
  if (opts.cases.length >= 3 && high === 0) {
    suggestions.push('补充登录、权限、支付、删除、导出等高风险链路用例。')
  }
  if (suggestions.length === 0) suggestions.push('当前生成结果结构较完整，可进入人工评审。')
  return suggestions.slice(0, 5)
}

export function buildQualityReport(requirementText: string, rows: unknown[]): QualityReport {
  const cases = rows.map((r) =>
    normalizeCaseRowForPersistence(
      r && typeof r === 'object' ? (r as Record<string, unknown>) : {},
    ),
  )
  const coverage = analyzeCoverage(requirementText, cases)
  const coveredCount = coverage.filter((item) => item.status === 'covered').length
  const partialCount = coverage.filter((item) => item.status === 'partial').length
  const coverageRate =
    coverage.length > 0 ? Math.round(((coveredCount + partialCount * 0.5) / coverage.length) * 100) : null
  const issues = detectIssues(cases)
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
  const riskDistribution = countBy(RISKS, cases.map(riskOf))
  const priorityDistribution = countBy(PRIORITIES, cases.map((c) => c.priority))

  const coverageScore = coverageRate ?? 70
  const duplicatePenalty = cases.length > 0 ? Math.min(20, (duplicateCount / cases.length) * 80) : 0
  const genericPenalty = cases.length > 0 ? Math.min(25, ((genericCount + nonExecutableCount) / cases.length) * 65) : 0
  const highRisk = riskDistribution.find((item) => item.label === 'high')?.count ?? 0
  const riskScore = cases.length >= 3 && highRisk === 0 ? 8 : 15
  const score = clampScore(coverageScore * 0.4 + (20 - duplicatePenalty) + (25 - genericPenalty) + riskScore)
  const suggestions = buildSuggestions({
    coverage,
    duplicateCount,
    genericCount,
    nonExecutableCount,
    riskDistribution,
    cases,
  })

  const summary =
    coverageRate == null
      ? `已检查 ${cases.length} 条用例，当前输入不足以计算需求覆盖率。`
      : `覆盖 ${coveredCount}/${coverage.length} 个需求点，发现 ${issues.length} 个质量问题。`

  return {
    score,
    summary,
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
