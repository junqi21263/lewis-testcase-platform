import { buildStrictCaseResponseFormat, validateCaseRowsAgainstSchema } from '@/modules/ai/testcase-output-schema.util'
import { filterPromptInstructionArtifactCases, normalizeCaseRowForPersistence } from '@/modules/ai/case-row-normalize.util'
import { buildClosedLoopPlan } from '@/modules/ai/closed-loop-agent.util'

describe('strict testcase output schema', () => {
  const validCase = {
    title: '订单-提交成功',
    module: '订单',
    priority: 'P0',
    riskLevel: 'high',
    type: 'FUNCTIONAL',
    precondition: '1. 用户已登录',
    steps: [
      { order: 1, action: '进入订单确认页', expected: '展示订单金额' },
      { order: 2, action: '点击提交订单', expected: '订单提交成功' },
    ],
    expectedResult: '[1] 展示订单金额\n[2] 订单提交成功',
    tags: ['模块:订单', '功能'],
    mermaid: 'flowchart TD\nA[确认页] --> B[提交订单]',
    requirementIds: ['REQ-001'],
    testPathIds: ['TP-001'],
    automationReadiness: {
      status: 'automatable',
      reason: '页面和数据均可通过 Playwright 准备',
    },
  }

  it('builds strict json_schema response format for model calls', () => {
    const format = buildStrictCaseResponseFormat()
    expect(format).toMatchObject({
      type: 'json_schema',
      json_schema: {
        name: 'testcase_generation_result',
        strict: true,
      },
    })
    expect(format.json_schema.schema.properties.cases.items.required).toEqual(expect.arrayContaining(['module', 'riskLevel', 'mermaid', 'requirementIds', 'testPathIds', 'automationReadiness']))
  })

  it('passes rows that contain module, risk level, mermaid and step expectations', () => {
    const result = validateCaseRowsAgainstSchema([validCase])
    expect(result).toEqual({ ok: true, errors: [], missingFields: [] })
  })

  it('rejects missing schema fields before persistence repair', () => {
    const {
      module: _module,
      riskLevel: _riskLevel,
      mermaid: _mermaid,
      requirementIds: _requirementIds,
      testPathIds: _testPathIds,
      automationReadiness: _automationReadiness,
      ...missingTopFields
    } = validCase
    const rows = [
      {
        ...missingTopFields,
        steps: [{ order: 1, action: '提交订单' }],
      },
    ]

    const result = validateCaseRowsAgainstSchema(rows)

    expect(result.ok).toBe(false)
    expect(result.missingFields).toEqual(expect.arrayContaining(['module', 'riskLevel', 'mermaid', 'requirementIds', 'testPathIds', 'automationReadiness', 'steps.expected']))
  })

  it('normalizes schema fields into persistent tags and description', () => {
    const normalized = normalizeCaseRowForPersistence(validCase)

    expect(normalized.tags).toEqual(expect.arrayContaining(['模块:订单', '风险:high', '功能']))
    expect(normalized.description).toContain('Mermaid:')
    expect(normalized.description).toContain('flowchart TD')
    expect(normalized.requirementIds).toEqual(['REQ-001'])
    expect(normalized.testPathIds).toEqual(['TP-001'])
    expect(normalized.automationReadiness).toEqual(
      expect.objectContaining({ status: 'automatable' }),
    )
  })

  it('repairs legacy rows without REQ or TP fields before persistence', () => {
    const normalized = normalizeCaseRowForPersistence({
      ...validCase,
      requirementIds: undefined,
      testPathIds: undefined,
      automationReadiness: undefined,
      tags: ['模块:订单', 'REQ-009', 'TP-003'],
    })

    expect(normalized.requirementIds).toEqual(['REQ-009'])
    expect(normalized.testPathIds).toEqual(['TP-003'])
    expect(normalized.automationReadiness?.status).toBe('manual')
  })

  it('filters prompt instruction artifacts before persistence', () => {
    const rows = [
      {
        ...validCase,
        title: '密码登录-密码错误提示',
        module: '用户登录',
        precondition: '1. 用户处于登录页\n2. 用户已注册邮箱账号',
        steps: [
          { order: 1, action: '输入已注册邮箱和错误密码', expected: '字段可正常输入' },
          { order: 2, action: '点击登录', expected: '显示密码错误提示' },
        ],
        expectedResult: '[1] 字段可正常输入\n[2] 显示密码错误提示',
      },
      {
        title: '核心流程-所有用例必须唯一，无重复场景验证',
        priority: 'P2',
        type: 'FUNCTIONAL',
        precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
        steps: [
          { order: 1, action: '进入核心流程相关页面或功能入口', expected: '' },
          { order: 2, action: '按需求执行「所有用例必须唯一，无重复场景」对应操作', expected: '' },
          { order: 3, action: '观察页面反馈、数据状态与后续操作入口', expected: '' },
        ],
        expectedResult: '[1] 核心流程入口可正常访问 [2] 系统按需完成「所有用例必须唯一，无重复场景」并给出明确反馈',
        tags: ['ai-closed-loop', '功能'],
      },
      {
        title: '核心流程-步骤必须“一步一动作”，禁止合并多个操作到一个步骤验证',
        priority: 'P2',
        type: 'FUNCTIONAL',
        precondition: '1. 测试账号具备核心流程访问权限 2. 测试数据满足该需求触发条件',
        steps: [
          { order: 1, action: '进入核心流程相关页面或功能入口', expected: '' },
          { order: 2, action: '按需求执行「步骤必须一步一动作」对应操作', expected: '' },
          { order: 3, action: '观察页面反馈、数据状态与后续操作入口', expected: '' },
        ],
        expectedResult: '[1] 核心流程入口可正常访问 [2] 系统按需完成「步骤必须一步一动作」并给出明确反馈',
        tags: ['ai-closed-loop', '功能'],
      },
    ]

    const filtered = filterPromptInstructionArtifactCases(rows)

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.title).toBe('密码登录-密码错误提示')
  })

  it('does not create closed-loop cases from prompt rule coverage items', () => {
    const plan = buildClosedLoopPlan({
      requirementText: '用户可以使用已注册邮箱和密码登录系统。',
      cases: [validCase],
      qualityReport: {
        score: 70,
        summary: '存在未覆盖项',
        requirementPointsTotal: 1,
        coverageRate: 0,
        coverage: [
          {
            requirement: '所有用例必须唯一，无重复场景',
            status: 'missing',
            matchedCaseTitles: [],
          },
          {
            requirement: '步骤必须“一步一动作”，禁止合并多个操作到一个步骤',
            status: 'missing',
            matchedCaseTitles: [],
          },
        ],
        duplicateCount: 0,
        genericCount: 0,
        nonExecutableCount: 0,
        riskDistribution: [],
        priorityDistribution: [],
        suggestions: [],
        issues: [],
      },
    })

    expect(plan.additions).toHaveLength(0)
    expect(plan.actions).toHaveLength(0)
  })
})
