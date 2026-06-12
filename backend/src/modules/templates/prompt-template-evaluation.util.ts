export type PromptEvalSample = {
  id: string
  title: string
  requirementText: string
}

export type PromptEvalSampleResult = {
  sampleId: string
  title: string
  parsed: boolean
  caseCount: number
  qualityScore: number
  coverageRate: number | null
  durationMs: number
  warnings: string[]
  error?: string
}

export type PromptEvaluationSummaryInput = {
  templateId: string
  templateName: string
  templateVersion: number
  modelId: string
  modelName: string
  params: {
    temperature: number
    maxTokens: number
  }
  samples: PromptEvalSampleResult[]
}

export type PromptEvaluationFailure = {
  sampleId: string
  title: string
  reason: string
  warnings: string[]
}

export type PromptEvaluationCompatibility = {
  compatible: boolean
  reason?: string
}

export type PromptEvaluationReport = PromptEvaluationSummaryInput & {
  sampleCount: number
  parseSuccessRate: number
  averageQualityScore: number
  averageCoverageRate: number | null
  failures: PromptEvaluationFailure[]
  warningSamples: PromptEvaluationFailure[]
  skippedReason?: string
  evaluatedAt: string
}

export const PROMPT_EVAL_SAMPLE_SET: PromptEvalSample[] = [
  {
    id: 'login-core',
    title: '登录核心与异常提示',
    requirementText: `
1. 用户可以使用手机号和密码登录系统
2. 登录失败时需要提示账号或密码错误
3. 连续输错 5 次密码后账号需要临时锁定
4. 用户登录成功后进入工作台
`.trim(),
  },
  {
    id: 'order-export-permission',
    title: '订单导出与权限',
    requirementText: `
1. 管理员可以按时间范围筛选订单列表
2. 管理员可以导出订单列表为 Excel 文件
3. 非管理员不能导出订单
4. 导出失败时需要展示可重试提示
`.trim(),
  },
  {
    id: 'upload-boundary',
    title: '文件上传边界',
    requirementText: `
1. 用户可以上传 PDF、Word、图片格式的需求文档
2. 单个文件不能超过 20MB
3. 不支持的文件格式需要明确提示
4. 网络中断后允许用户重新上传
`.trim(),
  },
]

function roundRate(value: number): number {
  return Math.round(value * 100) / 100
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return roundRate(values.reduce((sum, n) => sum + n, 0) / values.length)
}

export function detectPromptEvaluationCompatibility(content: string): PromptEvaluationCompatibility {
  const text = String(content ?? '').toLowerCase()
  const hasNonJsonIntent =
    /非\s*json|不是平台的\s*json|not\s+json|代码围栏|自动化脚本|可运行.*脚本|pytest|jmeter|locust|gatling|pageobject|allure/.test(
      text,
    )
  const hasJsonContract = /仅输出\s*json|只输出.*json|顶层.*cases|\"cases\"|json\s*schema/.test(text)

  if (hasNonJsonIntent && !hasJsonContract) {
    return {
      compatible: false,
      reason:
        '该模板明确要求输出非 JSON 自动化脚本，不适合使用平台 JSON 用例 schema 评测。请改用功能/API/安全等 JSON 用例模板，或先把模板输出约束改为顶层 {"cases": [...]}。',
    }
  }

  return { compatible: true }
}

export function nextPromptTemplateVersion(
  currentVersion: number | null | undefined,
  oldContent: string,
  nextContent: string | undefined,
): number {
  const base = Math.max(1, Number(currentVersion) || 1)
  if (nextContent === undefined) return base
  return oldContent === nextContent ? base : base + 1
}

export function buildPromptEvaluationSummary(
  input: PromptEvaluationSummaryInput,
): PromptEvaluationReport {
  const sampleCount = input.samples.length
  const parsedCount = input.samples.filter((s) => s.parsed).length
  const coverageRates = input.samples
    .map((s) => s.coverageRate)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  const failures = input.samples
    .filter((s) => !s.parsed || s.error)
    .map((s) => ({
      sampleId: s.sampleId,
      title: s.title,
      reason: s.error || (s.parsed ? '存在评测警告' : '解析失败'),
      warnings: s.warnings,
    }))
  const warningSamples = input.samples
    .filter((s) => s.parsed && !s.error && s.warnings.length > 0)
    .map((s) => ({
      sampleId: s.sampleId,
      title: s.title,
      reason: '存在评测警告',
      warnings: s.warnings,
    }))

  return {
    ...input,
    sampleCount,
    parseSuccessRate: sampleCount ? roundRate((parsedCount / sampleCount) * 100) : 0,
    averageQualityScore: average(input.samples.map((s) => s.qualityScore)) ?? 0,
    averageCoverageRate: average(coverageRates),
    failures,
    warningSamples,
    evaluatedAt: new Date().toISOString(),
  }
}
