import {
  buildClosedLoopPlan,
  requirementFingerprint,
} from '@/modules/ai/closed-loop-agent.util'
import { buildQualityReport } from '@/modules/ai/quality-check.util'

describe('AI requirement-case closed-loop agent', () => {
  const requirementText = [
    '用户可以使用正确账号密码登录成功并进入首页。',
    '密码错误时需要展示明确错误提示。',
    '用户可以导出订单列表为 Excel 文件。',
  ].join('\n')

  it('adds cases for missing requirement points and avoids duplicate补齐 tags', () => {
    const existingHash = requirementFingerprint('用户可以导出订单列表为 Excel 文件。')
    const rows = [
      {
        id: 'case-login-ok',
        title: '登录-正确账号密码登录成功',
        priority: 'P1',
        type: 'FUNCTIONAL',
        precondition: '用户已有账号',
        steps: [{ order: 1, action: '输入正确账号密码并点击登录' }],
        expectedResult: '[1] 登录成功并进入首页',
        tags: ['模块:登录', '功能'],
      },
      {
        id: 'case-export-existing',
        title: '订单导出-Excel 文件生成',
        priority: 'P2',
        type: 'FUNCTIONAL',
        precondition: '存在订单数据',
        steps: [{ order: 1, action: '点击导出 Excel' }],
        expectedResult: '[1] 下载 Excel 文件',
        tags: ['模块:订单', 'ai-closed-loop', `需求补齐:${existingHash}`],
      },
    ]
    const report = buildQualityReport(requirementText, rows)

    const plan = buildClosedLoopPlan({ requirementText, cases: rows, qualityReport: report })

    expect(plan.additions).toHaveLength(1)
    expect(plan.additions[0].requirement).toContain('密码错误')
    expect(plan.additions[0].case.tags).toContain('ai-closed-loop')
    expect(plan.additions[0].case.tags.some((tag) => tag.startsWith('需求补齐:'))).toBe(true)
    expect(plan.additions[0].reason).toContain('未覆盖需求点')
  })

  it('refines generic and non-executable cases into actionable cases', () => {
    const rows = [
      {
        id: 'case-generic',
        title: '功能测试',
        priority: 'P2',
        type: 'FUNCTIONAL',
        precondition: '',
        steps: [{ order: 1, action: '验证功能是否正常' }],
        expectedResult: '正常',
        tags: ['模块:登录'],
      },
    ]
    const report = buildQualityReport(requirementText, rows)

    const plan = buildClosedLoopPlan({ requirementText, cases: rows, qualityReport: report })

    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].caseId).toBe('case-generic')
    expect(plan.updates[0].case.title).not.toBe('功能测试')
    expect(plan.updates[0].case.steps.length).toBeGreaterThanOrEqual(3)
    expect(plan.updates[0].case.expectedResult).toContain('[1]')
    expect(plan.updates[0].reason).toMatch(/空泛|不可执行/)
  })

  it('marks duplicate cases without deleting them', () => {
    const rows = [
      {
        id: 'case-a',
        title: '登录-正确账号密码登录成功',
        priority: 'P1',
        type: 'FUNCTIONAL',
        precondition: '用户已有账号',
        steps: [{ order: 1, action: '输入正确账号密码并点击登录' }],
        expectedResult: '[1] 登录成功并进入首页',
        tags: ['模块:登录'],
      },
      {
        id: 'case-b',
        title: '登录-正确账号密码登录成功',
        priority: 'P1',
        type: 'FUNCTIONAL',
        precondition: '用户已有账号',
        steps: [{ order: 1, action: '输入正确账号密码并点击登录' }],
        expectedResult: '[1] 登录成功并进入首页',
        tags: ['模块:登录'],
      },
    ]
    const report = buildQualityReport(requirementText, rows)

    const plan = buildClosedLoopPlan({ requirementText, cases: rows, qualityReport: report })

    expect(plan.duplicateMarks).toHaveLength(1)
    expect(plan.duplicateMarks[0].caseId).toBe('case-b')
    expect(plan.duplicateMarks[0].case.tags).toEqual(expect.arrayContaining(['ai-duplicate', '待合并']))
    expect(plan.duplicateMarks[0].reason).toContain('高度重复')
  })
})
