import { describe, expect, it } from 'vitest'
import type { QualityReport } from '@/types'
import {
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
