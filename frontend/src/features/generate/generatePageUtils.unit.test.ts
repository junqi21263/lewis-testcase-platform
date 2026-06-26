import { describe, expect, it } from 'vitest'
import {
  STREAM_LOG_DISPLAY_MAX_CHARS,
  buildGenerateRequestText,
  distributionLabel,
  extractFlowchartSummary,
  fileStatusLabels,
  isTransientFilePollError,
  issueTypeLabel,
  qualityScoreTone,
  tailStreamLogForDisplay,
} from './generatePageUtils'

describe('generatePageUtils', () => {
  it('builds generation input without duplicating identical description text', () => {
    expect(buildGenerateRequestText('登录需求', '登录需求', '补充异常场景')).toBe(
      '登录需求\n\n【补充说明】\n补充异常场景',
    )

    expect(buildGenerateRequestText('', '注册需求', '')).toBe('【需求描述】\n注册需求')
  })

  it('keeps only the tail of very long stream logs for rendering', () => {
    const long = 'a'.repeat(STREAM_LOG_DISPLAY_MAX_CHARS + 8)
    const result = tailStreamLogForDisplay(long)

    expect(result).toContain('流式输出较长')
    expect(result.endsWith('a'.repeat(STREAM_LOG_DISPLAY_MAX_CHARS))).toBe(true)
  })

  it('extracts flowchart summary tables from analysis text', () => {
    const summary = extractFlowchartSummary(`
正文

## 流程图结构化摘要
- 置信度：高
- 主流程：登录 -> 下单 -> 支付
- 异常/分支：
  - 密码错误
  - 库存不足
- 流程节点：
  - 登录
  - 下单
  - 支付
- Mermaid：
flowchart TD
`)

    expect(summary?.confidence).toBe('高')
    expect(summary?.mainPath).toBe('登录 -> 下单 -> 支付')
    expect(summary?.branches).toEqual(['密码错误', '库存不足'])
    expect(summary?.nodes).toEqual(['登录', '下单', '支付'])
  })

  it('classifies file poll errors and labels presentation helpers', () => {
    expect(isTransientFilePollError({ response: { status: 503 } })).toBe(true)
    expect(isTransientFilePollError({ response: { status: 400 } })).toBe(false)
    expect(isTransientFilePollError({ name: 'TimeoutError' })).toBe(true)

    expect(fileStatusLabels.PARSED).toBe('解析完成')
    expect(qualityScoreTone(90)).toBe('text-emerald-500')
    expect(issueTypeLabel('generic_step')).toBe('步骤空泛')
    expect(distributionLabel('high')).toBe('高风险')
  })
})
