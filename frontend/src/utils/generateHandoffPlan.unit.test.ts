import { describe, expect, it } from 'vitest'
import {
  buildGenerateHandoffPlan,
  buildGenerateScopePrompt,
  buildGeneratedCaseCoverage,
} from './generateHandoffPlan'
import type { AnalysisStructuredResult, TestCase } from '@/types'

const structured: AnalysisStructuredResult = {
  requirements: [
    { id: 'REQ-001', text: '用户可以使用邮箱和密码登录', type: 'functional' },
    { id: 'REQ-002', text: '验证码错误时展示清晰错误提示', type: 'risk' },
  ],
  flowchart: {
    nodes: [
      { id: 'A', label: '输入邮箱密码', type: 'process' },
      { id: 'B', label: '校验验证码', type: 'decision' },
    ],
    branches: [{ from: 'B', to: 'C', condition: '验证码错误', type: 'exception' }],
    paths: [
      { id: 'TP-001', type: 'main', nodes: ['输入邮箱密码', '进入工作台'] },
      { id: 'TP-002', type: 'exception', nodes: ['输入邮箱密码', '验证码错误提示'] },
    ],
  },
  qualityScores: {
    completeness: 86,
    testability: 91,
    interfaceClarity: 74,
    riskCoverage: 80,
    flowCompleteness: 88,
    reasons: ['接口字段仍需补充'],
  },
  openQuestions: [{ category: 'permission', text: '哪些角色允许登录后台？' }],
  inputWarnings: [{ type: 'interface_missing', message: '缺少登录接口错误码约束' }],
  automationReadiness: {
    automatable: ['TP-001 登录主流程'],
    manual: ['视觉样式验收'],
    blocked: ['缺少测试账号池'],
  },
}

describe('generateHandoffPlan', () => {
  it('builds selectable REQ/TP scope from analysis structured result', () => {
    const plan = buildGenerateHandoffPlan(structured)

    expect(plan.requirements).toHaveLength(2)
    expect(plan.testPaths).toHaveLength(2)
    expect(plan.selectedRequirementIds).toEqual(['REQ-001', 'REQ-002'])
    expect(plan.selectedTestPathIds).toEqual(['TP-001', 'TP-002'])
    expect(plan.qualityAverage).toBe(84)
    expect(plan.openQuestionCount).toBe(1)
    expect(plan.inputWarningCount).toBe(1)
    expect(plan.automationSummary).toEqual({
      automatable: 1,
      manual: 1,
      blocked: 1,
    })
    expect(plan.estimatedCaseCount).toBe(8)
  })

  it('writes selected REQ/TP scope into prompt context', () => {
    const prompt = buildGenerateScopePrompt(
      buildGenerateHandoffPlan(structured),
      ['REQ-002'],
      ['TP-002'],
    )

    expect(prompt).toContain('【本次生成范围】')
    expect(prompt).toContain('REQ-002 验证码错误时展示清晰错误提示')
    expect(prompt).toContain('TP-002 异常路径：输入邮箱密码 -> 验证码错误提示')
    expect(prompt).not.toContain('REQ-001 用户可以使用邮箱和密码登录')
  })

  it('summarizes generated case coverage by REQ/TP and uncovered requirements', () => {
    const cases: TestCase[] = [
      {
        id: 'case-1',
        title: '邮箱密码登录成功',
        priority: 'P1',
        type: 'FUNCTIONAL',
        status: 'DRAFT',
        suiteId: 'suite-1',
        tags: [],
        steps: [{ order: 1, action: '输入正确邮箱密码' }],
        expectedResult: '进入工作台',
        requirementIds: ['REQ-001'],
        testPathIds: ['TP-001'],
        automationReadiness: { status: 'automatable', reason: '可通过页面断言完成' },
      },
    ]

    const coverage = buildGeneratedCaseCoverage(buildGenerateHandoffPlan(structured), cases)

    expect(coverage.coveredRequirementCount).toBe(1)
    expect(coverage.totalRequirementCount).toBe(2)
    expect(coverage.coverageRate).toBe(50)
    expect(coverage.uncoveredRequirements.map((item) => item.id)).toEqual(['REQ-002'])
    expect(coverage.automatableCount).toBe(1)
    expect(coverage.groups[0].cases[0].title).toBe('邮箱密码登录成功')
  })
})
