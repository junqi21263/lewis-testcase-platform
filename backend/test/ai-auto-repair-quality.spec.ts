import { buildAutoRepairNotice, shouldAutoRepairQuality } from '../src/modules/ai/auto-repair-quality.util'
import type { QualityReport } from '../src/modules/ai/quality-check.util'

function report(patch: Partial<QualityReport> = {}): QualityReport {
  return {
    score: 92,
    summary: '质量良好',
    requirementPointsTotal: 2,
    coverageRate: 1,
    coverage: [
      { requirement: '登录', status: 'covered', matchedCaseTitles: ['登录成功'] },
      { requirement: '退出', status: 'covered', matchedCaseTitles: ['退出成功'] },
    ],
    duplicateCount: 0,
    genericCount: 0,
    nonExecutableCount: 0,
    riskDistribution: [],
    priorityDistribution: [],
    suggestions: [],
    issues: [],
    ...patch,
  }
}

describe('auto repair quality rules', () => {
  it('低于质量阈值时触发自动修复', () => {
    expect(shouldAutoRepairQuality(report({ score: 79 }))).toBe(true)
  })

  it('存在高危问题或缺失需求覆盖时触发自动修复', () => {
    expect(
      shouldAutoRepairQuality(
        report({
          score: 91,
          issues: [
            {
              caseTitle: '活动任务',
              type: 'missing_expected',
              severity: 'high',
              message: '缺少明确预期',
            },
          ],
        }),
      ),
    ).toBe(true)

    expect(
      shouldAutoRepairQuality(
        report({
          score: 91,
          coverage: [
            { requirement: '登录', status: 'covered', matchedCaseTitles: ['登录成功'] },
            { requirement: '风控拦截', status: 'missing', matchedCaseTitles: [] },
          ],
        }),
      ),
    ).toBe(true)
  })

  it('健康报告不触发自动修复', () => {
    expect(shouldAutoRepairQuality(report())).toBe(false)
  })

  it('生成可读的自动修复摘要', () => {
    expect(
      buildAutoRepairNotice({
        addedCount: 2,
        updatedCount: 3,
        duplicateMarkedCount: 1,
        beforeScore: 67,
        afterScore: 86,
      }),
    ).toBe('已自动质量修复：新增 2 条，修订 3 条，标记重复 1 条；评分 67 -> 86')
  })
})
