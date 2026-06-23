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

  it('derives actionable strategy and agent readiness when model omits those sections', () => {
    const structured: AnalysisStructuredResult = {
      requirements: [
        { id: 'REQ-001', text: '用户使用邮箱密码登录系统', type: 'functional' },
        { id: 'REQ-002', text: '验证码错误时展示清晰提示', type: 'risk' },
      ],
      flowchart: {
        nodes: [
          { id: 'A', label: '输入邮箱密码', type: 'process' },
          { id: 'B', label: '校验图形验证码', type: 'decision' },
        ],
        branches: [{ from: 'B', to: 'C', condition: '验证码错误', type: 'exception' }],
        paths: [
          { id: 'TP-001', type: 'main', nodes: ['输入邮箱密码', '进入工作台'] },
          { id: 'TP-002', type: 'exception', nodes: ['输入邮箱密码', '验证码错误提示'] },
        ],
      },
      risks: [{ level: 'P1', description: '暴力破解风险' }],
      openQuestions: [{ category: 'permission', text: '哪些角色允许登录后台？' }],
    }

    const summary = buildAnalysisReviewSummary(structured)

    expect(summary.testStrategyText.scope).toContain('REQ-001')
    expect(summary.testStrategyText.types).toContain('功能测试')
    expect(summary.testStrategyText.types).toContain('异常路径测试')
    expect(summary.testStrategyText.entryCriteria).not.toBe('待补充')
    expect(summary.automationText.automatable).toContain('TP-001')
    expect(summary.automationText.manual).toContain('哪些角色允许登录后台？')
    expect(summary.automationText.blocked).toContain('测试账号')
  })
})
