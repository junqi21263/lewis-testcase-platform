import { describe, expect, it } from 'vitest'
import type { QualityReport } from '@/types'
import {
  buildLocalQualityReport,
  buildCoverageSummaryLabel,
  pickTopQualityIssues,
  summarizeQualitySuggestions,
} from './qualityReport'

const report: QualityReport = {
  score: 68,
  summary: '覆盖基本可用，但仍有缺口和可执行性问题。',
  requirementPointsTotal: 4,
  coverageRate: 75,
  coverage: [
    { requirement: '登录成功', status: 'covered', matchedCaseTitles: ['登录成功'] },
    { requirement: '登录失败提示', status: 'covered', matchedCaseTitles: ['登录失败提示'] },
    { requirement: '导出 Excel', status: 'covered', matchedCaseTitles: ['导出 Excel'] },
    { requirement: '删除权限控制', status: 'missing', matchedCaseTitles: [] },
  ],
  duplicateCount: 1,
  genericCount: 1,
  nonExecutableCount: 1,
  riskDistribution: [
    { label: 'high', count: 3 },
    { label: 'medium', count: 1 },
    { label: 'low', count: 1 },
  ],
  priorityDistribution: [
    { label: 'P0', count: 2 },
    { label: 'P1', count: 1 },
    { label: 'P2', count: 1 },
    { label: 'P3', count: 1 },
  ],
  suggestions: ['补充删除权限控制场景', '细化“验证功能正常”类用例'],
  issues: [
    {
      caseTitle: '登录-手机号密码登录成功',
      type: 'duplicate',
      severity: 'medium',
      message: '与另一条登录成功用例高度重合',
    },
    {
      caseTitle: '验证功能正常',
      type: 'generic_title',
      severity: 'medium',
      message: '标题过于空泛',
    },
    {
      caseTitle: '验证功能正常',
      type: 'non_executable',
      severity: 'high',
      message: '缺少明确动作与可验证结果',
    },
  ],
}

describe('qualityReport helpers', () => {
  it('builds a local fallback report when backend qualityReport is missing', () => {
    const fallback = buildLocalQualityReport(
      `
1. 用户可以使用手机号密码登录
2. 登录失败时需要提示账号或密码错误
3. 非管理员不能删除订单
`.trim(),
      [
        {
          id: 'case-1',
          title: '登录-手机号密码登录成功',
          precondition: '用户已注册',
          steps: [
            { order: 1, action: '输入手机号和密码' },
            { order: 2, action: '点击登录按钮' },
          ],
          expectedResult: '[1] 输入校验通过\n[2] 登录成功并进入首页',
          priority: 'P0',
          type: 'FUNCTIONAL',
          tags: ['模块:登录'],
          status: 'DRAFT',
          suiteId: '',
        },
        {
          id: 'case-2',
          title: '登录-手机号密码登录成功',
          precondition: '用户已注册',
          steps: [
            { order: 1, action: '输入手机号和密码' },
            { order: 2, action: '点击登录按钮' },
          ],
          expectedResult: '[1] 输入校验通过\n[2] 登录成功并进入首页',
          priority: 'P0',
          type: 'FUNCTIONAL',
          tags: ['模块:登录'],
          status: 'DRAFT',
          suiteId: '',
        },
        {
          id: 'case-3',
          title: '验证功能正常',
          precondition: '',
          steps: [{ order: 1, action: '验证功能' }],
          expectedResult: '符合预期',
          priority: 'P3',
          type: 'FUNCTIONAL',
          tags: ['模块:通用'],
          status: 'DRAFT',
          suiteId: '',
        },
      ],
    )

    expect(fallback.coverageRate).toBe(33)
    expect(fallback.coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ requirement: '非管理员不能删除订单', status: 'missing' }),
      ]),
    )
    expect(fallback.duplicateCount).toBe(1)
    expect(fallback.genericCount).toBe(1)
    expect(fallback.nonExecutableCount).toBe(1)
    expect(fallback.suggestions.join('；')).toContain('非管理员不能删除订单')
  })

  it('builds readable coverage summary text', () => {
    expect(buildCoverageSummaryLabel(report)).toBe('已覆盖 3 / 4 个需求点（75%）')
  })

  it('prioritizes severe issues first', () => {
    expect(pickTopQualityIssues(report, 2)).toEqual([
      expect.objectContaining({ type: 'non_executable' }),
      expect.objectContaining({ type: 'duplicate' }),
    ])
  })

  it('joins suggestions into a compact summary', () => {
    expect(summarizeQualitySuggestions(report)).toContain('补充删除权限控制场景')
    expect(summarizeQualitySuggestions(report)).toContain('细化')
  })
})
