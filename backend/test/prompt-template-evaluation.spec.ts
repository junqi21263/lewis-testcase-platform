import {
  buildPromptEvaluationSummary,
  detectPromptEvaluationCompatibility,
  nextPromptTemplateVersion,
  PROMPT_EVAL_SAMPLE_SET,
} from '@/modules/templates/prompt-template-evaluation.util'

describe('prompt template evaluation helpers', () => {
  it('increments prompt version only when prompt content changes', () => {
    expect(nextPromptTemplateVersion(1, '生成登录用例', '生成登录用例')).toBe(1)
    expect(nextPromptTemplateVersion(1, '生成登录用例', '生成登录和权限用例')).toBe(2)
    expect(nextPromptTemplateVersion(null, '旧内容', '新内容')).toBe(2)
  })

  it('summarizes parse success, quality score, coverage and failures', () => {
    const summary = buildPromptEvaluationSummary({
      templateId: 'tpl_1',
      templateName: '结构化用例模板',
      templateVersion: 3,
      modelId: 'gpt-test',
      modelName: 'GPT Test',
      params: { temperature: 0.2, maxTokens: 4096 },
      samples: [
        {
          sampleId: 'login-core',
          title: '登录核心流程',
          parsed: true,
          caseCount: 4,
          qualityScore: 82,
          coverageRate: 75,
          durationMs: 1200,
          warnings: [],
        },
        {
          sampleId: 'order-export',
          title: '订单导出',
          parsed: true,
          caseCount: 2,
          qualityScore: 60,
          coverageRate: 50,
          durationMs: 900,
          warnings: ['当前模型网关不支持 json_schema 严格结构化输出'],
        },
        {
          sampleId: 'upload-boundary',
          title: '订单导出',
          parsed: false,
          caseCount: 0,
          qualityScore: 0,
          coverageRate: null,
          durationMs: 800,
          warnings: ['模型输出不是 JSON'],
          error: '解析失败',
        },
      ],
    })

    expect(summary.sampleCount).toBe(3)
    expect(summary.parseSuccessRate).toBe(66.67)
    expect(summary.averageQualityScore).toBe(47.33)
    expect(summary.averageCoverageRate).toBe(62.5)
    expect(summary.failures).toEqual([
      expect.objectContaining({
        sampleId: 'upload-boundary',
        reason: '解析失败',
      }),
    ])
    expect(summary.warningSamples).toEqual([
      expect.objectContaining({
        sampleId: 'order-export',
        warnings: ['当前模型网关不支持 json_schema 严格结构化输出'],
      }),
    ])
  })

  it('detects templates that are intentionally not JSON testcase prompts', () => {
    const result = detectPromptEvaluationCompatibility(`
本模板用于生成自动化脚本与工程结构，不是平台的 JSON 测试用例格式。
输出可运行 Python Pytest 代码。
`)

    expect(result.compatible).toBe(false)
    expect(result.reason).toContain('非 JSON')
  })

  it('ships a fixed sample set for prompt comparison', () => {
    expect(PROMPT_EVAL_SAMPLE_SET.length).toBeGreaterThanOrEqual(3)
    expect(PROMPT_EVAL_SAMPLE_SET[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        requirementText: expect.stringContaining('用户'),
      }),
    )
  })
})
