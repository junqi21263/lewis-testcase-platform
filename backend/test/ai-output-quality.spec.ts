import { buildQualityReport } from '@/modules/ai/quality-check.util'

describe('buildQualityReport', () => {
  it('detects uncovered requirements, duplicates, generic cases and risk distribution', () => {
    const requirementText = `
1. 用户可以使用手机号和密码登录系统
2. 登录失败时需要提示账号或密码错误
3. 支持导出订单列表为 Excel 文件
4. 非管理员不能删除订单
`.trim()

    const rows = [
      {
        title: '登录-手机号密码登录成功',
        priority: 'P0',
        type: 'FUNCTIONAL',
        precondition: '用户已注册',
        steps: [
          { order: 1, action: '输入手机号和密码' },
          { order: 2, action: '点击登录按钮' },
        ],
        expectedResult: '[1] 输入校验通过\n[2] 登录成功并进入首页',
        tags: ['模块:登录'],
      },
      {
        title: '登录-手机号密码登录成功',
        priority: 'P0',
        type: 'FUNCTIONAL',
        precondition: '用户已注册',
        steps: [
          { order: 1, action: '输入手机号和密码' },
          { order: 2, action: '点击登录按钮' },
        ],
        expectedResult: '[1] 输入校验通过\n[2] 登录成功并进入首页',
        tags: ['模块:登录'],
      },
      {
        title: '登录-账号密码错误提示',
        priority: 'P1',
        type: 'FUNCTIONAL',
        precondition: '用户已进入登录页',
        steps: [
          { order: 1, action: '输入错误密码' },
          { order: 2, action: '点击登录按钮' },
        ],
        expectedResult: '[1] 信息提交成功\n[2] 页面提示账号或密码错误',
        tags: ['模块:登录', '异常'],
      },
      {
        title: '订单列表-导出 Excel',
        priority: 'P2',
        type: 'FUNCTIONAL',
        precondition: '用户已进入订单列表页',
        steps: [
          { order: 1, action: '点击导出按钮' },
        ],
        expectedResult: '[1] 成功导出 Excel 文件',
        tags: ['模块:订单', '导出'],
      },
      {
        title: '验证功能正常',
        priority: 'P3',
        type: 'FUNCTIONAL',
        precondition: '',
        steps: [{ order: 1, action: '验证功能' }],
        expectedResult: '符合预期',
        tags: ['模块:通用'],
      },
    ]

    const report = buildQualityReport(requirementText, rows)

    expect(report.requirementPointsTotal).toBe(4)
    expect(report.coverageRate).toBe(75)
    expect(report.coverage.filter((item) => item.status === 'missing')).toEqual([
      expect.objectContaining({
        requirement: '非管理员不能删除订单',
      }),
    ])
    expect(report.duplicateCount).toBe(1)
    expect(report.genericCount).toBe(1)
    expect(report.nonExecutableCount).toBe(1)
    expect(report.priorityDistribution).toEqual([
      { label: 'P0', count: 2 },
      { label: 'P1', count: 1 },
      { label: 'P2', count: 1 },
      { label: 'P3', count: 1 },
    ])
    expect(report.riskDistribution).toEqual([
      { label: 'high', count: 3 },
      { label: 'medium', count: 1 },
      { label: 'low', count: 1 },
    ])
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseTitle: '登录-手机号密码登录成功',
          type: 'duplicate',
        }),
        expect.objectContaining({
          caseTitle: '验证功能正常',
          type: 'generic_title',
        }),
        expect.objectContaining({
          caseTitle: '验证功能正常',
          type: 'non_executable',
        }),
      ]),
    )
    expect(report.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringContaining('非管理员不能删除订单'),
        expect.stringContaining('细化'),
      ]),
    )
    expect(report.score).toBeGreaterThanOrEqual(0)
    expect(report.score).toBeLessThanOrEqual(100)
  })
})
