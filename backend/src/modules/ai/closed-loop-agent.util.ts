import { normalizeCaseRowForPersistence, type NormalizedCaseShape } from './case-row-normalize.util'
import type { CoverageItem, QualityIssueItem, QualityReport } from './quality-check.util'

export type ClosedLoopActionType =
  | 'add_missing_requirement'
  | 'refine_generic'
  | 'fix_non_executable'
  | 'mark_duplicate'

export type ClosedLoopCase = NormalizedCaseShape & {
  id?: string
}

export type ClosedLoopMutation = {
  type: ClosedLoopActionType
  caseId?: string
  requirement?: string
  reason: string
  case: ClosedLoopCase
}

export type ClosedLoopPlan = {
  additions: Array<ClosedLoopMutation & { type: 'add_missing_requirement'; requirement: string }>
  updates: Array<ClosedLoopMutation & { type: 'refine_generic' | 'fix_non_executable' }>
  duplicateMarks: Array<ClosedLoopMutation & { type: 'mark_duplicate' }>
  actions: ClosedLoopMutation[]
}

type BuildClosedLoopPlanInput = {
  requirementText: string
  cases: unknown[]
  qualityReport: QualityReport
}

const HIGH_RISK_RE = /登录|权限|支付|下单|订单|退款|删除|审批|导出|核心|管理员|密码|账号/
const MODULE_HINTS: Array<[RegExp, string]> = [
  [/登录|密码|账号|注册|登出/, '账号登录'],
  [/订单|导出|Excel|excel|报表/, '订单管理'],
  [/权限|管理员|角色/, '权限管理'],
  [/支付|退款|下单/, '交易支付'],
  [/上传|下载|文件/, '文件处理'],
  [/审批|审核/, '审批流程'],
]

function normalizeText(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[，。；：、,.!！?？:;()[\]{}"'“”‘’\s_-]+/g, '')
}

export function requirementFingerprint(requirement: string): string {
  const input = normalizeText(requirement).slice(0, 120)
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
}

function inferModule(requirement: string, fallbackTags: string[] = []): string {
  const existing = fallbackTags.find((tag) => tag.startsWith('模块:'))
  if (existing) return existing.slice('模块:'.length).trim() || '核心流程'
  for (const [re, mod] of MODULE_HINTS) {
    if (re.test(requirement)) return mod
  }
  return '核心流程'
}

function requirementSummary(requirement: string): string {
  return requirement
    .replace(/^[#>\s\-*•\d.、．]+/, '')
    .replace(/[。；;]+$/g, '')
    .trim()
    .slice(0, 28)
}

function expectedForSteps(lines: string[]): string {
  return lines.map((line, i) => `[${i + 1}] ${line}`).join('\n')
}

function buildMissingRequirementCase(requirement: string): ClosedLoopCase {
  const module = inferModule(requirement)
  const summary = requirementSummary(requirement)
  const fp = requirementFingerprint(requirement)
  const priority = HIGH_RISK_RE.test(requirement) ? 'P1' : 'P2'
  const steps = [
    { order: 1, action: `进入${module}相关页面或功能入口` },
    { order: 2, action: `按需求执行「${summary}」对应操作` },
    { order: 3, action: '观察页面反馈、数据状态与可追溯记录' },
  ]
  return {
    title: `${module}-${summary}验证`,
    priority,
    type: 'FUNCTIONAL',
    precondition: `1. 测试账号具备${module}访问权限\n2. 测试数据满足该需求触发条件`,
    steps,
    expectedResult: expectedForSteps([
      `${module}入口可正常访问`,
      `系统按需求完成「${summary}」并给出明确反馈`,
      '页面展示、数据状态和后续操作入口均符合预期',
    ]),
    tags: uniqueTags(['ai-closed-loop', `需求补齐:${fp}`, `模块:${module}`, '功能']),
  }
}

function hasLoopRequirementTag(cases: ClosedLoopCase[], requirement: string): boolean {
  const tag = `需求补齐:${requirementFingerprint(requirement)}`
  return cases.some((c) => c.tags.includes(tag))
}

function issueReason(issues: QualityIssueItem[]): string {
  const labels = issues.map((issue) => issue.message)
  return uniqueTags(labels).join('；') || 'AI 闭环优化修订'
}

function improveTitle(c: ClosedLoopCase, requirementText: string): string {
  const module = inferModule(`${c.title} ${c.precondition ?? ''} ${requirementText}`, c.tags)
  const base = requirementSummary(requirementText) || c.title
  if (c.title.length > 4 && !/^功能测试$|^场景验证$|^测试$|功能正常|验证功能正常/.test(c.title)) {
    return c.title
  }
  return `${module}-${base}验证`.slice(0, 80)
}

function improveExecutableCase(
  c: ClosedLoopCase,
  requirementText: string,
  issues: QualityIssueItem[],
): ClosedLoopCase {
  const module = inferModule(`${c.title} ${requirementText}`, c.tags)
  const summary = requirementSummary(requirementText) || c.title
  const needsStepRewrite =
    c.steps.length < 3 ||
    c.steps.every((s) => normalizeText(s.action).length < 8) ||
    issues.some((issue) => ['generic_step', 'missing_steps', 'non_executable'].includes(issue.type))

  const steps = needsStepRewrite
    ? [
        { order: 1, action: `进入${module}页面并确认前置数据可用` },
        { order: 2, action: `执行「${summary}」对应的核心操作` },
        { order: 3, action: '检查系统反馈、数据状态和可继续操作入口' },
      ]
    : c.steps.map((s, i) => ({ ...s, order: i + 1 }))

  const needsExpectedRewrite =
    issues.some((issue) =>
      ['generic_expected', 'missing_expected', 'non_executable'].includes(issue.type),
    ) || normalizeText(c.expectedResult).length < 8

  const expectedResult = needsExpectedRewrite
    ? expectedForSteps([
        `${module}页面正常打开，关键控件与测试数据可见`,
        `系统完成「${summary}」并展示明确成功、失败或校验提示`,
        '结果可被人工复核，且无异常报错或状态丢失',
      ])
    : c.expectedResult

  return {
    ...c,
    title: improveTitle(c, requirementText),
    precondition:
      c.precondition?.trim() ||
      `1. 测试账号具备${module}访问权限\n2. 已准备满足场景的数据`,
    steps,
    expectedResult,
    tags: uniqueTags([...c.tags, 'ai-closed-loop']),
  }
}

function groupedIssuesByTitle(issues: QualityIssueItem[]): Map<string, QualityIssueItem[]> {
  const out = new Map<string, QualityIssueItem[]>()
  for (const issue of issues) {
    const list = out.get(issue.caseTitle) ?? []
    list.push(issue)
    out.set(issue.caseTitle, list)
  }
  return out
}

function firstMissingRequirement(report: QualityReport): string {
  return (
    report.coverage.find((item) => item.status === 'missing')?.requirement ||
    report.coverage.find((item) => item.status === 'partial')?.requirement ||
    ''
  )
}

function caseByTitle(cases: ClosedLoopCase[]): Map<string, ClosedLoopCase> {
  return new Map(cases.map((c) => [c.title, c]))
}

function buildAdditions(cases: ClosedLoopCase[], coverage: CoverageItem[]) {
  return coverage
    .filter((item) => item.status === 'missing')
    .filter((item) => !hasLoopRequirementTag(cases, item.requirement))
    .map((item) => ({
      type: 'add_missing_requirement' as const,
      requirement: item.requirement,
      reason: `未覆盖需求点：${item.requirement}`,
      case: buildMissingRequirementCase(item.requirement),
    }))
}

function buildUpdates(cases: ClosedLoopCase[], report: QualityReport) {
  const byTitle = groupedIssuesByTitle(report.issues)
  const seedRequirement = firstMissingRequirement(report)
  const updates: Array<ClosedLoopMutation & { type: 'refine_generic' | 'fix_non_executable' }> = []

  for (const c of cases) {
    const issues = byTitle.get(c.title) ?? []
    const refinable = issues.filter((issue) =>
      ['generic_title', 'generic_step', 'generic_expected', 'missing_steps', 'missing_expected', 'non_executable', 'low_detail'].includes(
        issue.type,
      ),
    )
    if (!refinable.length) continue
    const type = refinable.some((issue) =>
      ['missing_steps', 'missing_expected', 'non_executable'].includes(issue.type),
    )
      ? 'fix_non_executable'
      : 'refine_generic'
    updates.push({
      type,
      caseId: c.id,
      reason: issueReason(refinable),
      case: improveExecutableCase(c, seedRequirement || c.title, refinable),
    })
  }

  return updates
}

function buildDuplicateMarks(cases: ClosedLoopCase[], report: QualityReport) {
  const byTitle = caseByTitle(cases)
  const marks: Array<ClosedLoopMutation & { type: 'mark_duplicate' }> = []
  for (const issue of report.issues) {
    if (issue.type !== 'duplicate') continue
    const c = byTitle.get(issue.caseTitle)
    if (!c) continue
    marks.push({
      type: 'mark_duplicate',
      caseId: c.id,
      reason: issue.message || '与已有用例高度重复，建议人工确认后合并',
      case: {
        ...c,
        tags: uniqueTags([...c.tags, 'ai-closed-loop', 'ai-duplicate', '待合并']),
      },
    })
  }
  return marks
}

export function buildClosedLoopPlan(input: BuildClosedLoopPlanInput): ClosedLoopPlan {
  const cases = input.cases.map((row) => {
    const obj = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    const normalized = normalizeCaseRowForPersistence(obj)
    const id = typeof obj.id === 'string' ? obj.id : undefined
    return { ...normalized, id }
  })

  const additions = buildAdditions(cases, input.qualityReport.coverage)
  const updates = buildUpdates(cases, input.qualityReport)
  const duplicateMarks = buildDuplicateMarks(cases, input.qualityReport)
  const actions = [...additions, ...updates, ...duplicateMarks]

  return { additions, updates, duplicateMarks, actions }
}
