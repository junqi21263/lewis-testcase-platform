import { describe, expect, it } from 'vitest'
import {
  buildDirectAnalysisText,
  canStartAiAnalysisFromInput,
  getAiAnalysisFlowSteps,
} from './aiAnalysisInput'

describe('aiAnalysisInput', () => {
  it('allows direct text analysis without an uploaded file', () => {
    expect(
      canStartAiAnalysisFromInput({
        inputMode: 'text',
        directText: '用户可以通过邮箱和密码登录系统。',
        hasParsedFile: false,
        additionalFilesParsed: false,
      }),
    ).toBe(true)
  })

  it('keeps file mode gated by parsed upload state', () => {
    expect(
      canStartAiAnalysisFromInput({
        inputMode: 'upload',
        directText: '用户登录需求',
        hasParsedFile: false,
        additionalFilesParsed: true,
      }),
    ).toBe(false)

    expect(
      canStartAiAnalysisFromInput({
        inputMode: 'upload',
        directText: '',
        hasParsedFile: true,
        additionalFilesParsed: true,
      }),
    ).toBe(true)
  })

  it('builds a labelled direct-text payload with context notes', () => {
    expect(
      buildDirectAnalysisText({
        directText: '主流程：用户提交订单。',
        requirementDescription: '适用于 V1.2。',
        requirementSupplement: '需要覆盖异常退款。',
      }),
    ).toContain('【直接输入需求】\n主流程：用户提交订单。')
    expect(
      buildDirectAnalysisText({
        directText: '主流程：用户提交订单。',
        requirementDescription: '适用于 V1.2。',
        requirementSupplement: '需要覆盖异常退款。',
      }),
    ).toContain('【需求描述】\n适用于 V1.2。')
    expect(
      buildDirectAnalysisText({
        directText: '主流程：用户提交订单。',
        requirementDescription: '适用于 V1.2。',
        requirementSupplement: '需要覆盖异常退款。',
      }),
    ).toContain('【补充说明】\n需要覆盖异常退款。')
  })

  it('maps current state to the four-stage analysis workflow', () => {
    const steps = getAiAnalysisFlowSteps({
      inputMode: 'text',
      directText: '需求文本',
      hasParsedFile: false,
      additionalFilesParsed: true,
      pageStatus: 'review',
      hasReport: true,
    })

    expect(steps.map((s) => `${s.title}:${s.status}`)).toEqual([
      '选择输入来源:done',
      '解析确认:done',
      '开始分析:done',
      '审阅与生成:active',
    ])
  })
})
