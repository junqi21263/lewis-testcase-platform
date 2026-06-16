import {
  analyzePromptTemplateFormat,
  buildPromptEvaluationComparison,
  buildPromptEvaluationSummary,
  buildPromptEvaluationRuntimePrompt,
  detectPromptEvaluationCompatibility,
  validateOptimizedPromptDraft,
  nextPromptTemplateVersion,
  PROMPT_EVAL_SAMPLE_SET,
  resolvePromptEvaluationMaxTokens,
} from '@/modules/templates/prompt-template-evaluation.util'

describe('prompt template evaluation helpers', () => {
  it('uses long-output defaults for prompt evaluation max tokens', () => {
    expect(resolvePromptEvaluationMaxTokens()).toBe(32768)
    expect(resolvePromptEvaluationMaxTokens(4096)).toBe(12000)
    expect(resolvePromptEvaluationMaxTokens(128000)).toBe(128000)
  })

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

  it('diagnoses token truncation, schema fallback, repaired JSON and under-generated samples', () => {
    const summary = buildPromptEvaluationSummary({
      templateId: 'tpl_1',
      templateName: '结构化用例模板',
      templateVersion: 3,
      modelId: 'deepseek-test',
      modelName: 'DeepSeek Test',
      params: { temperature: 0.2, maxTokens: 4096 },
      samples: [
        {
          sampleId: 'login-core',
          title: '登录核心流程',
          parsed: true,
          caseCount: 2,
          qualityScore: 100,
          coverageRate: 100,
          durationMs: 1200,
          warnings: [
            '当前模型网关不支持 json_schema 严格结构化输出，已回退兼容模式。',
            '模型输出已达到本次「最大 Token」上限，回复可能被截断，JSON 可能不完整。请调高「最大 Token」、缩短单次生成范围，或分批生成。',
            '模型原始输出未按 JSON 返回，已自动进行二次整理。',
          ],
        },
        {
          sampleId: 'upload-boundary',
          title: '文件上传边界',
          parsed: true,
          caseCount: 5,
          qualityScore: 70,
          coverageRate: 25,
          durationMs: 1800,
          warnings: [
            '模型输出已达到本次「最大 Token」上限，回复可能被截断，JSON 可能不完整。请调高「最大 Token」、缩短单次生成范围，或分批生成。',
          ],
        },
      ],
    })

    expect(summary.diagnostics).toEqual(
      expect.objectContaining({
        confidence: 'low',
        verdict: expect.stringContaining('Token'),
      }),
    )
    expect(summary.diagnostics.risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'token_truncation', severity: 'high' }),
        expect.objectContaining({ id: 'sample_under_generation', severity: 'medium' }),
        expect.objectContaining({ id: 'schema_fallback', severity: 'medium' }),
        expect.objectContaining({ id: 'json_repair', severity: 'medium' }),
      ]),
    )
    expect(summary.diagnostics.warningGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'token_truncation', count: 2 }),
        expect.objectContaining({ id: 'schema_fallback', count: 1 }),
      ]),
    )
    expect(summary.diagnostics.actions.join('\n')).toContain('maxTokens')
    expect(summary.diagnostics.actions.join('\n')).toContain('6-10')
  })

  it('uses a larger output budget floor for prompt evaluation runs', () => {
    expect(resolvePromptEvaluationMaxTokens()).toBe(32768)
    expect(resolvePromptEvaluationMaxTokens(4096)).toBe(12000)
    expect(resolvePromptEvaluationMaxTokens(8192)).toBe(12000)
    expect(resolvePromptEvaluationMaxTokens(20000)).toBe(20000)
  })

  it('detects templates that are intentionally not JSON testcase prompts', () => {
    const result = detectPromptEvaluationCompatibility(`
本模板用于生成自动化脚本与工程结构，不是平台的 JSON 测试用例格式。
输出可运行 Python Pytest 代码。
`)

    expect(result.compatible).toBe(false)
    expect(result.reason).toContain('非 JSON')
  })

  it('analyzes prompt format and flags missing evaluation mode for bulk prompts', () => {
    const analysis = analyzePromptTemplateFormat(`
# 任务
仅输出纯JSON格式，顶层必须为"cases"数组。

# 核心强制要求
- 普通单一功能模块生成≥20个唯一测试用例
- 若需求包含【文档/PDF/文本上传】功能，必须生成≥45个唯一测试用例

# 用例格式规范
- title：用例名称
- tags：必须包含模块
- precondition：前置条件
- steps：步骤
- expectedResult：预期结果
- priority：P0/P1/P2/P3
- type：固定为"FUNCTIONAL"

# 需求内容
{{content}}
`)

    expect(analysis.healthScore).toBeLessThan(100)
    expect(analysis.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'json_contract', status: 'pass' }),
        expect.objectContaining({ id: 'required_fields', status: 'pass' }),
        expect.objectContaining({ id: 'evaluation_mode', status: 'warn' }),
        expect.objectContaining({ id: 'bulk_quantity_rules', status: 'warn' }),
      ]),
    )
    expect(analysis.suggestions.join('\n')).toContain('评测模式')
    expect(analysis.risks.join('\n')).toContain('Token')
  })

  it('validates optimized prompt preserves source contract and required placeholders', () => {
    const original = `
仅输出纯JSON格式，顶层必须为"cases"数组。
普通单一功能模块生成≥20个唯一测试用例。
若需求包含【文档/PDF/文本上传】功能，必须生成≥45个唯一测试用例。
# 需求内容
{{content}}
`
    const optimized = `
仅输出纯JSON格式，顶层必须为"cases"数组。
若为 Prompt 评测场景，仅生成 6-10 条代表性用例。
# 需求内容
{{content}}
`

    const guardrails = validateOptimizedPromptDraft(original, optimized)

    expect(guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'preserve_content_placeholder', status: 'pass' }),
        expect.objectContaining({ id: 'preserve_json_contract', status: 'pass' }),
        expect.objectContaining({ id: 'preserve_bulk_quantity_rules', status: 'fail' }),
      ]),
    )
  })

  it('compares original and optimized prompt evaluation metrics', () => {
    const base = buildPromptEvaluationSummary({
      templateId: 'tpl_1',
      templateName: '结构化用例模板',
      templateVersion: 1,
      modelId: 'deepseek',
      modelName: 'DeepSeek',
      params: { temperature: 0.2, maxTokens: 4096 },
      samples: [
        {
          sampleId: 'a',
          title: '样例 A',
          parsed: true,
          caseCount: 2,
          qualityScore: 60,
          coverageRate: 50,
          durationMs: 1000,
          warnings: [],
        },
      ],
    })
    const optimized = buildPromptEvaluationSummary({
      ...base,
      samples: [
        {
          sampleId: 'a',
          title: '样例 A',
          parsed: true,
          caseCount: 6,
          qualityScore: 90,
          coverageRate: 100,
          durationMs: 700,
          warnings: [],
        },
      ],
    })

    expect(buildPromptEvaluationComparison(base, optimized)).toEqual({
      parseSuccessRateDelta: 0,
      averageQualityScoreDelta: 30,
      averageCoverageRateDelta: 50,
      totalDurationMsDelta: -300,
    })
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

  it('wraps bulk prompts with a runtime-only lightweight evaluation constraint', () => {
    const original = `
仅输出纯JSON格式，顶层必须为"cases"数组。
若需求包含【文档/PDF/文本上传】功能，必须生成≥45个唯一测试用例。
# 需求内容
{{content}}
`

    const runtimePrompt = buildPromptEvaluationRuntimePrompt(original)

    expect(runtimePrompt).toContain(original.trim())
    expect(runtimePrompt).toContain('{{content}}')
    expect(runtimePrompt).toContain('仅本次 Prompt 评测生效')
    expect(runtimePrompt).toContain('6-10 条')
    expect(runtimePrompt).toContain('暂不执行')
    expect(runtimePrompt).toContain('正式数量底线')
    expect(runtimePrompt).toContain('每条用例最多 3 个步骤')
    expect(runtimePrompt).toContain('expectedResult')
    expect(runtimePrompt).toContain('mermaid')
    expect(runtimePrompt).toContain('null')
  })
})
