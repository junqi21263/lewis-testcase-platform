import type { AnalysisStructuredResult, TestCase } from '@/types'

export type GenerateRequirementScopeItem = {
  id: string
  text: string
  type: string
}

export type GenerateTestPathScopeItem = {
  id: string
  label: string
  type: 'main' | 'exception'
  nodes: string[]
}

export type GenerateHandoffPlan = {
  requirements: GenerateRequirementScopeItem[]
  testPaths: GenerateTestPathScopeItem[]
  selectedRequirementIds: string[]
  selectedTestPathIds: string[]
  qualityAverage: number | null
  openQuestionCount: number
  inputWarningCount: number
  automationSummary: {
    automatable: number
    manual: number
    blocked: number
  }
  estimatedCaseCount: number
}

export type GeneratedCaseCoverageGroup = {
  requirement: GenerateRequirementScopeItem
  cases: TestCase[]
  testPathIds: string[]
}

export type GeneratedCaseCoverage = {
  groups: GeneratedCaseCoverageGroup[]
  uncoveredRequirements: GenerateRequirementScopeItem[]
  coveredRequirementCount: number
  totalRequirementCount: number
  coverageRate: number | null
  automatableCount: number
  manualCount: number
  blockedCount: number
}

function normalizeId(value: unknown, prefix: 'REQ' | 'TP'): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim().toUpperCase()
  if (!new RegExp(`^${prefix}-\\d{3,}$`).test(id)) return null
  return id
}

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export function buildGenerateHandoffPlan(structured?: AnalysisStructuredResult | null): GenerateHandoffPlan {
  const requirements = (structured?.requirements ?? [])
    .map((item, index): GenerateRequirementScopeItem => ({
      id: normalizeId(item.id, 'REQ') ?? `REQ-${String(index + 1).padStart(3, '0')}`,
      text: item.text?.trim() || '未命名需求',
      type: item.type ?? 'functional',
    }))
    .filter((item) => item.text)

  const testPaths = (structured?.flowchart?.paths ?? [])
    .map((item, index): GenerateTestPathScopeItem => {
      const nodes = Array.isArray(item.nodes)
        ? item.nodes.map((node) => String(node).trim()).filter(Boolean)
        : []
      return {
        id: normalizeId(item.id, 'TP') ?? `TP-${String(index + 1).padStart(3, '0')}`,
        label: nodes.length ? nodes.join(' -> ') : '未命名路径',
        type: item.type === 'exception' ? 'exception' : 'main',
        nodes,
      }
    })
    .filter((item) => item.label)

  const qualityValues = structured?.qualityScores
    ? [
        structured.qualityScores.completeness,
        structured.qualityScores.testability,
        structured.qualityScores.interfaceClarity,
        structured.qualityScores.riskCoverage,
        structured.qualityScores.flowCompleteness,
      ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : []

  const automation = structured?.automationReadiness
  const estimatedFromReq = requirements.length * 3
  const estimatedFromPath = testPaths.length

  return {
    requirements,
    testPaths,
    selectedRequirementIds: requirements.map((item) => item.id),
    selectedTestPathIds: testPaths.map((item) => item.id),
    qualityAverage: qualityValues.length
      ? Math.round(qualityValues.reduce((sum, item) => sum + item, 0) / qualityValues.length)
      : null,
    openQuestionCount: structured?.openQuestions?.length ?? 0,
    inputWarningCount: structured?.inputWarnings?.length ?? 0,
    automationSummary: {
      automatable: automation?.automatable?.length ?? 0,
      manual: automation?.manual?.length ?? 0,
      blocked: automation?.blocked?.length ?? 0,
    },
    estimatedCaseCount: Math.max(requirements.length, estimatedFromReq + estimatedFromPath),
  }
}

export function buildGenerateScopePrompt(
  plan: GenerateHandoffPlan,
  selectedRequirementIds: string[],
  selectedTestPathIds: string[],
): string {
  const selectedReq = new Set(selectedRequirementIds)
  const selectedTp = new Set(selectedTestPathIds)
  const requirements = plan.requirements.filter((item) => selectedReq.has(item.id))
  const paths = plan.testPaths.filter((item) => selectedTp.has(item.id))
  const lines = ['【本次生成范围】']

  if (requirements.length) {
    lines.push('需求范围：')
    for (const item of requirements) lines.push(`- ${item.id} ${item.text}`)
  }
  if (paths.length) {
    lines.push('测试路径范围：')
    for (const item of paths) {
      lines.push(`- ${item.id} ${item.type === 'exception' ? '异常路径' : '主路径'}：${item.label}`)
    }
  }
  lines.push('生成约束：每条用例必须回填 requirementIds 与 testPathIds；无法关联路径时 testPathIds 可为空，但 requirementIds 不应为空。')
  return lines.join('\n')
}

export function buildGeneratedCaseCoverage(
  plan: GenerateHandoffPlan,
  cases: TestCase[],
): GeneratedCaseCoverage {
  const reqMap = new Map(plan.requirements.map((item) => [item.id, item]))
  const groups = plan.requirements.map((requirement) => {
    const matchedCases = cases.filter((item) => (item.requirementIds ?? []).includes(requirement.id))
    return {
      requirement,
      cases: matchedCases,
      testPathIds: uniq(matchedCases.flatMap((item) => item.testPathIds ?? [])),
    }
  })
  const extraReqIds = uniq(cases.flatMap((item) => item.requirementIds ?? [])).filter((id) => !reqMap.has(id))
  for (const reqId of extraReqIds) {
    groups.push({
      requirement: { id: reqId, text: '模型输出中新增的需求关联', type: 'unknown' },
      cases: cases.filter((item) => (item.requirementIds ?? []).includes(reqId)),
      testPathIds: uniq(cases.flatMap((item) => item.testPathIds ?? [])),
    })
  }

  const coveredRequirementCount = groups.filter((item) => item.cases.length > 0).length
  const totalRequirementCount = groups.length
  const autoCounts = cases.reduce(
    (acc, item) => {
      const status = item.automationReadiness?.status
      if (status === 'automatable') acc.automatableCount += 1
      else if (status === 'manual') acc.manualCount += 1
      else if (status === 'blocked') acc.blockedCount += 1
      return acc
    },
    { automatableCount: 0, manualCount: 0, blockedCount: 0 },
  )

  return {
    groups,
    uncoveredRequirements: groups
      .filter((item) => item.cases.length === 0)
      .map((item) => item.requirement),
    coveredRequirementCount,
    totalRequirementCount,
    coverageRate: totalRequirementCount
      ? Math.round((coveredRequirementCount / totalRequirementCount) * 100)
      : null,
    ...autoCounts,
  }
}
