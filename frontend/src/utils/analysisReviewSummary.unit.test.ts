import { describe, expect, it } from 'vitest'
import { buildAnalysisReviewSummary } from './analysisReviewSummary'
import type { AnalysisStructuredResult } from '@/types'

describe('analysisReviewSummary', () => {
  it('summarizes quality scores, warnings and open questions for review UI', () => {
    const structured: AnalysisStructuredResult = {
      requirements: [
        { id: 'REQ-001', text: '用户提交订单', type: 'functional' },
        { id: 'REQ-002', text: '支付失败提示', type: 'risk' },
      ],
      flowchart: {
        nodes: [{ id: 'A', label: '提交订单', type: 'process' }],
        branches: [{ from: 'A', to: 'B', condition: '失败', type: 'exception' }],
        paths: [{ id: 'TP-001', type: 'main', nodes: ['A', 'B'] }],
      },
      qualityScores: {
        completeness: 76,
        testability: 82,
        interfaceClarity: 64,
        riskCoverage: 72,
        flowCompleteness: 90,
        reasons: ['接口字段不完整'],
      },
      inputWarnings: [{ type: 'interface_missing', message: '缺少接口约束' }],
      openQuestions: [{ category: 'permission', text: '谁可以取消订单？' }],
      testStrategy: {
        scope: ['订单主流程'],
        types: ['功能测试', '异常测试'],
        entryCriteria: ['需求已确认'],
        exitCriteria: ['P0 用例通过'],
      },
      automationReadiness: {
        automatable: ['订单提交'],
        manual: ['视觉校验'],
        blocked: ['缺少支付沙箱'],
      },
    }

    const summary = buildAnalysisReviewSummary(structured)

    expect(summary.coverageText).toBe('REQ 2 个 · TP 1 条')
    expect(summary.qualityItems).toEqual([
      { label: '完整性', value: 76 },
      { label: '可测试性', value: 82 },
      { label: '接口明确', value: 64 },
      { label: '风险覆盖', value: 72 },
      { label: '流程完整', value: 90 },
    ])
    expect(summary.warnings).toEqual(['缺少接口约束'])
    expect(summary.openQuestions).toEqual(['谁可以取消订单？'])
    expect(summary.testStrategyText.scope).toBe('订单主流程')
    expect(summary.automationText.blocked).toBe('缺少支付沙箱')
    expect(summary.reviewPriority).toBe('needs_attention')
  })

  it('returns empty-state friendly values when structured data is partial', () => {
    const summary = buildAnalysisReviewSummary({})

    expect(summary.coverageText).toBe('REQ 0 个 · TP 0 条')
    expect(summary.warnings).toEqual([])
    expect(summary.openQuestions).toEqual([])
    expect(summary.testStrategyText.scope).toBe('待补充')
    expect(summary.automationText.automatable).toBe('待识别')
    expect(summary.reviewPriority).toBe('normal')
  })
})
