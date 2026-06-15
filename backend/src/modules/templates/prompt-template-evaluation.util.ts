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

export type PromptFormatCheckStatus = 'pass' | 'warn' | 'fail'

export type PromptFormatCheck = {
  id: string
  label: string
  status: PromptFormatCheckStatus
  message: string
  evidence?: string[]
}

export type PromptTemplateFormatAnalysis = {
  healthScore: number
  summary: string
  checks: PromptFormatCheck[]
  risks: string[]
  suggestions: string[]
}

export type PromptOptimizationDraft = {
  status: 'completed' | 'failed' | 'skipped'
  optimizedContent?: string
  reasons: string[]
  guardrails: PromptFormatCheck[]
  error?: string
}

export type PromptEvaluationComparison = {
  parseSuccessRateDelta: number | null
  averageQualityScoreDelta: number | null
  averageCoverageRateDelta: number | null
  totalDurationMsDelta: number | null
}

export type PromptEvaluationDiagnosticSeverity = 'low' | 'medium' | 'high'

export type PromptEvaluationConfidence = 'high' | 'medium' | 'low'

export type PromptEvaluationWarningGroup = {
  id: string
  label: string
  count: number
  sampleTitles: string[]
  message: string
}

export type PromptEvaluationRisk = {
  id: string
  label: string
  severity: PromptEvaluationDiagnosticSeverity
  message: string
  sampleTitles: string[]
}

export type PromptEvaluationDiagnostics = {
  confidence: PromptEvaluationConfidence
  verdict: string
  risks: PromptEvaluationRisk[]
  warningGroups: PromptEvaluationWarningGroup[]
  actions: string[]
}

export type PromptEvaluationReport = PromptEvaluationSummaryInput & {
  sampleCount: number
  parseSuccessRate: number
  averageQualityScore: number
  averageCoverageRate: number | null
  failures: PromptEvaluationFailure[]
  warningSamples: PromptEvaluationFailure[]
  diagnostics: PromptEvaluationDiagnostics
  skippedReason?: string
  promptAnalysis?: PromptTemplateFormatAnalysis
  promptOptimization?: PromptOptimizationDraft
  optimizedEvaluation?: PromptEvaluationReport
  comparison?: PromptEvaluationComparison
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

export function buildPromptEvaluationRuntimePrompt(content: string): string {
  const source = String(content ?? '').trim()
  const runtimeConstraint = `

【平台 Prompt 评测运行约束】
以下约束仅本次 Prompt 评测生效，不会保存到模板正文，也不改变正式生成规则：
1. 本次是小样本质量评测，不是正式全量生成。
2. 必须沿用原 Prompt 的 JSON 格式、字段、枚举、steps/expectedResult 对齐和可执行性要求。
3. 若原 Prompt 要求生成 ≥20、≥30、≥35、≥45 等正式数量底线，本次暂不执行正式数量底线。
4. 每个评测样例只生成 6-10 条代表性用例，优先覆盖主流程、异常、边界和权限/网络等高风险点。
5. 只输出一个合法 JSON 对象，顶层为 {"cases": [...]}，不要 Markdown、解释或代码围栏。
`.trim()

  return source ? `${source}\n\n${runtimeConstraint}` : runtimeConstraint
}

function classifyPromptEvaluationWarning(warning: string): { id: string; label: string; message: string } | null {
  const text = String(warning ?? '')
  if (/最大\s*Token|max_tokens|finish_reason|截断|truncated|token 上限/i.test(text)) {
    return {
      id: 'token_truncation',
      label: '最大 Token / JSON 截断',
      message: '模型输出触达最大 Token 上限，JSON 可能被截断，评测可信度下降。',
    }
  }
  if (/json_schema|严格结构化|structured output|schema/i.test(text)) {
    return {
      id: 'schema_fallback',
      label: '结构化输出降级',
      message: '当前模型或网关不支持严格 json_schema，平台已回退兼容解析和本地校验。',
    }
  }
  if (/未按\s*JSON|二次整理|自动.*修复|schema.*修复|字段缺失|JSON.*不完整/i.test(text)) {
    return {
      id: 'json_repair',
      label: 'JSON 修复',
      message: '模型原始输出需要平台二次整理或 schema 修复，说明 Prompt 输出约束仍不够稳定。',
    }
  }
  if (/输入已压缩|省略中间|需求.*过长|clamp/i.test(text)) {
    return {
      id: 'input_clamped',
      label: '输入内容压缩',
      message: '评测输入过长并被压缩，可能影响需求覆盖判断。',
    }
  }
  return null
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function roundRate(value: number): number {
  return Math.round(value * 100) / 100
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return roundRate(values.reduce((sum, n) => sum + n, 0) / values.length)
}

function matchEvidence(text: string, patterns: RegExp[]): string[] {
  const evidence = new Set<string>()
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[0] || '').trim()
      if (value) evidence.add(value.slice(0, 80))
    }
  }
  return [...evidence].slice(0, 6)
}

function includesAll(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term))
}

function check(
  id: string,
  label: string,
  status: PromptFormatCheckStatus,
  message: string,
  evidence?: string[],
): PromptFormatCheck {
  return { id, label, status, message, ...(evidence?.length ? { evidence } : {}) }
}

function quantityEvidence(content: string): string[] {
  return matchEvidence(content, [
    /[≥>=]\s*\d+\s*个?唯一?测试?用例/g,
    /生成\s*[≥>=]\s*\d+\s*个?唯一?测试?用例/g,
    /必须生成\s*[≥>=]\s*\d+/g,
  ])
}

export function analyzePromptTemplateFormat(content: string): PromptTemplateFormatAnalysis {
  const text = String(content ?? '')
  const compact = text.replace(/\s+/g, '')
  const checks: PromptFormatCheck[] = []

  const hasJsonContract = /仅输出\s*纯?\s*json|只输出\s*纯?\s*json|无任何markdown|代码围栏|顶层必须为?["“]?cases/i.test(text)
  const hasCasesContract = /顶层.*cases|["“]cases["”]\s*数组|cases\s*[:：]/i.test(text)
  checks.push(
    check(
      'json_contract',
      'JSON 输出契约',
      hasJsonContract && hasCasesContract ? 'pass' : hasJsonContract || hasCasesContract ? 'warn' : 'fail',
      hasJsonContract && hasCasesContract
        ? '已明确纯 JSON 与顶层 cases 约束。'
        : '建议明确要求仅输出纯 JSON，且顶层必须为 {"cases": [...]}。',
      matchEvidence(text, [/仅输出[^\n。]*/g, /顶层[^\n。]*/g]),
    ),
  )

  const requiredFields = ['title', 'tags', 'precondition', 'steps', 'expectedResult', 'priority', 'type']
  const presentFields = includesAll(compact, requiredFields)
  checks.push(
    check(
      'required_fields',
      '平台字段完整性',
      presentFields.length === requiredFields.length ? 'pass' : presentFields.length >= 5 ? 'warn' : 'fail',
      presentFields.length === requiredFields.length
        ? '已覆盖平台用例核心字段。'
        : `缺少字段约束：${requiredFields.filter((f) => !presentFields.includes(f)).join('、')}`,
      presentFields,
    ),
  )

  const enumEvidence = matchEvidence(text, [/P0\/P1\/P2\/P3/g, /FUNCTIONAL/g, /type[：:].*FUNCTIONAL/gi])
  checks.push(
    check(
      'enum_constraints',
      '枚举约束',
      enumEvidence.length >= 2 ? 'pass' : enumEvidence.length === 1 ? 'warn' : 'fail',
      enumEvidence.length >= 2
        ? '已明确优先级与类型枚举。'
        : '建议明确 priority 只能为 P0/P1/P2/P3，type 使用平台支持枚举。',
      enumEvidence,
    ),
  )

  const variables = matchEvidence(text, [/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g])
  checks.push(
    check(
      'variables',
      '变量占位符',
      variables.includes('{{content}}') || /\{\{\s*content\s*\}\}/.test(text) ? 'pass' : 'fail',
      /\{\{\s*content\s*\}\}/.test(text)
        ? `检测到 ${variables.length} 个模板变量，包含需求内容占位符。`
        : '缺少 {{content}}，应用到生成页后可能无法注入需求内容。',
      variables,
    ),
  )

  const bulkRules = quantityEvidence(text)
  const hasEvalMode = /PROMPT_EVAL|评测模式|评测样例|小样本|代表性用例|暂不执行.*数量|6\s*-\s*10\s*条/.test(text)
  checks.push(
    check(
      'bulk_quantity_rules',
      '批量数量规则',
      bulkRules.length > 0 && !hasEvalMode ? 'warn' : 'pass',
      bulkRules.length > 0
        ? hasEvalMode
          ? '存在正式生成数量底线，同时已区分评测模式。'
          : '存在正式生成数量底线，但未区分评测模式，评测时容易输出过长。'
        : '未检测到高数量生成底线。',
      bulkRules,
    ),
  )
  checks.push(
    check(
      'evaluation_mode',
      'Prompt 评测模式',
      hasEvalMode ? 'pass' : 'warn',
      hasEvalMode
        ? '已包含评测模式或小样本输出约束。'
        : '建议增加评测模式：评测时生成 6-10 条代表性用例，正式生成仍执行原数量底线。',
    ),
  )

  const hasSelfCheck = /自检|schema|字段缺失|自动修复|输出前.*检查|格式校验|JSON.*校验/i.test(text)
  checks.push(
    check(
      'self_check',
      '输出前自检',
      hasSelfCheck ? 'pass' : 'warn',
      hasSelfCheck
        ? '已包含输出前自检或 schema 校验约束。'
        : '建议要求 AI 输出前自检字段完整性、steps/expectedResult 对齐、JSON 可解析性。',
    ),
  )

  const risks: string[] = []
  if (bulkRules.length > 0 && !hasEvalMode) {
    risks.push('正式生成数量底线会在 Prompt 评测中同样生效，容易达到最大 Token 上限并造成 JSON 截断。')
  }
  if (!hasSelfCheck) {
    risks.push('缺少输出前自检时，字段缺失或 steps 与 expectedResult 不一致会更多依赖平台修复。')
  }
  if (!/\{\{\s*content\s*\}\}/.test(text)) {
    risks.push('缺少 {{content}} 会导致需求内容无法稳定注入。')
  }

  const suggestions: string[] = []
  if (!hasEvalMode) {
    suggestions.push('补充 Prompt 评测模式：评测样例只生成 6-10 条代表性用例，不执行正式 20/35/45 条数量底线。')
  }
  if (!hasSelfCheck) {
    suggestions.push('补充输出前自检清单：纯 JSON、顶层 cases、必填字段、枚举、steps 与 expectedResult 条数一致。')
  }
  if (!hasJsonContract || !hasCasesContract) {
    suggestions.push('强化 JSON 契约：首个非空字符必须是 {，最后一个非空字符必须是 }，禁止 Markdown。')
  }
  if (suggestions.length === 0) suggestions.push('当前 Prompt 结构较完整，可继续通过样例集做模型实测。')

  const penalty = checks.reduce((sum, item) => sum + (item.status === 'fail' ? 22 : item.status === 'warn' ? 10 : 0), 0)
  const healthScore = Math.max(0, Math.min(100, 100 - penalty))
  return {
    healthScore,
    summary: `检测 ${checks.length} 个格式维度，${checks.filter((c) => c.status === 'pass').length} 项通过，${checks.filter((c) => c.status === 'warn').length} 项警告，${checks.filter((c) => c.status === 'fail').length} 项失败。`,
    checks,
    risks,
    suggestions,
  }
}

export function validateOptimizedPromptDraft(original: string, optimized: string): PromptFormatCheck[] {
  const source = String(original ?? '')
  const next = String(optimized ?? '')
  const sourceBulk = quantityEvidence(source)
  const nextBulk = quantityEvidence(next)
  return [
    check(
      'preserve_content_placeholder',
      '保留需求内容占位符',
      /\{\{\s*content\s*\}\}/.test(next) ? 'pass' : 'fail',
      /\{\{\s*content\s*\}\}/.test(next) ? '已保留 {{content}}。' : '优化版缺少 {{content}}，不能保存为模板。',
    ),
    check(
      'preserve_json_contract',
      '保留 JSON cases 契约',
      /仅输出\s*纯?\s*json|只输出\s*纯?\s*json/i.test(next) && /顶层.*cases|["“]cases["”]\s*数组/i.test(next)
        ? 'pass'
        : 'fail',
      '优化版必须继续要求纯 JSON 且顶层为 cases。',
    ),
    check(
      'preserve_bulk_quantity_rules',
      '保留正式生成数量规则',
      sourceBulk.length === 0 || nextBulk.length >= Math.min(sourceBulk.length, 2) ? 'pass' : 'fail',
      sourceBulk.length === 0
        ? '原模板未包含批量数量底线。'
        : '优化版必须保留原模板的正式生成数量底线，只能额外增加评测模式例外。',
      nextBulk,
    ),
    check(
      'add_evaluation_mode',
      '增加评测模式',
      /PROMPT_EVAL|评测模式|评测样例|小样本|代表性用例|暂不执行.*数量|6\s*-\s*10\s*条/.test(next)
        ? 'pass'
        : 'warn',
      '建议优化版包含评测模式，避免评测时执行正式大批量生成规则。',
    ),
  ]
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
  const parseSuccessRate = sampleCount ? roundRate((parsedCount / sampleCount) * 100) : 0
  const averageQualityScore = average(input.samples.map((s) => s.qualityScore)) ?? 0
  const averageCoverageRate = average(coverageRates)
  const diagnostics = buildPromptEvaluationDiagnostics({
    samples: input.samples,
    sampleCount,
    parseSuccessRate,
    averageQualityScore,
    averageCoverageRate,
  })

  return {
    ...input,
    sampleCount,
    parseSuccessRate,
    averageQualityScore,
    averageCoverageRate,
    failures,
    warningSamples,
    diagnostics,
    evaluatedAt: new Date().toISOString(),
  }
}

export function buildPromptEvaluationDiagnostics(input: {
  samples: PromptEvalSampleResult[]
  sampleCount: number
  parseSuccessRate: number
  averageQualityScore: number
  averageCoverageRate: number | null
}): PromptEvaluationDiagnostics {
  const warningMap = new Map<string, PromptEvaluationWarningGroup>()
  for (const sample of input.samples) {
    for (const warning of sample.warnings) {
      const classified = classifyPromptEvaluationWarning(warning)
      if (!classified) continue
      const current =
        warningMap.get(classified.id) ??
        {
          id: classified.id,
          label: classified.label,
          count: 0,
          sampleTitles: [],
          message: classified.message,
        }
      current.count += 1
      current.sampleTitles = uniqueStrings([...current.sampleTitles, sample.title])
      warningMap.set(classified.id, current)
    }
  }

  const warningGroups = [...warningMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh'))
  const risks: PromptEvaluationRisk[] = []
  const pushRisk = (
    id: string,
    label: string,
    severity: PromptEvaluationDiagnosticSeverity,
    message: string,
    sampleTitles: string[],
  ) => {
    if (risks.some((risk) => risk.id === id)) return
    risks.push({
      id,
      label,
      severity,
      message,
      sampleTitles: uniqueStrings(sampleTitles),
    })
  }

  const tokenGroup = warningMap.get('token_truncation')
  if (tokenGroup) {
    pushRisk(
      'token_truncation',
      '最大 Token / JSON 截断',
      'high',
      '模型输出已达到最大 Token 上限，JSON 可能被截断；当前评测结果只能作为参考。',
      tokenGroup.sampleTitles,
    )
  }

  const underGenerated = input.samples.filter((sample) => sample.parsed && sample.caseCount > 0 && sample.caseCount < 6)
  if (underGenerated.length > 0) {
    pushRisk(
      'sample_under_generation',
      '样例输出数量不足',
      tokenGroup ? 'medium' : 'high',
      '部分样例没有达到评测模式 6-10 条代表性用例目标，通常与输出预算、Prompt 数量冲突或模型遵循度有关。',
      underGenerated.map((sample) => sample.title),
    )
  }

  const schemaGroup = warningMap.get('schema_fallback')
  if (schemaGroup) {
    pushRisk(
      'schema_fallback',
      '结构化输出降级',
      'medium',
      '当前模型网关不支持 json_schema 严格结构化输出，平台已降级到兼容模式并继续本地校验。',
      schemaGroup.sampleTitles,
    )
  }

  const repairGroup = warningMap.get('json_repair')
  if (repairGroup) {
    pushRisk(
      'json_repair',
      'JSON 修复依赖',
      'medium',
      '模型原始输出需要二次整理或 schema 修复，建议增强模板中的输出前自检和 JSON 边界约束。',
      repairGroup.sampleTitles,
    )
  }

  const inputGroup = warningMap.get('input_clamped')
  if (inputGroup) {
    pushRisk(
      'input_clamped',
      '评测输入被压缩',
      'medium',
      '评测输入过长被压缩，可能导致覆盖率和质量分偏低。',
      inputGroup.sampleTitles,
    )
  }

  if (input.parseSuccessRate < 100) {
    pushRisk(
      'parse_failures',
      '解析失败',
      'high',
      '存在样例无法解析为平台用例结构，需要优先修复 JSON 输出契约。',
      input.samples.filter((sample) => !sample.parsed || sample.error).map((sample) => sample.title),
    )
  }

  if (input.averageCoverageRate != null && input.averageCoverageRate < 60) {
    pushRisk(
      'low_coverage',
      '覆盖率偏低',
      'medium',
      '平均覆盖率低于 60%，建议补充需求点枚举、正向/异常/边界比例和模块标签约束。',
      input.samples.filter((sample) => (sample.coverageRate ?? 100) < 60).map((sample) => sample.title),
    )
  }

  const actions: string[] = []
  if (tokenGroup) {
    actions.push('优先把评测 maxTokens 提高到 8192 或 12000；如果模型本身上限较低，改用支持更大输出窗口的模型。')
    actions.push('保留评测模式 6-10 条代表性用例约束，避免在评测中触发正式 20/35/45 条全量生成规则。')
    actions.push('让模板要求先规划 cases 数量再输出 JSON，单条用例步骤和预期保持短句，降低 JSON 过长导致截断的概率。')
  }
  if (underGenerated.length > 0 && !tokenGroup) {
    actions.push('检查模板是否仍有正式数量底线压过评测约束；评测分支应明确“暂不执行正式数量底线，只输出 6-10 条”。')
  }
  if (schemaGroup) {
    actions.push('若需要更稳定的严格结构化输出，优先选择支持 response_format json_schema 的模型或网关；否则保持兼容模式加本地 schema 校验。')
  }
  if (repairGroup) {
    actions.push('在模板中补充输出前自检：首尾必须是 JSON 对象、顶层 cases、必填字段齐全、steps 与 expectedResult 编号一致。')
  }
  if (input.averageCoverageRate != null && input.averageCoverageRate < 60) {
    actions.push('补充覆盖约束：每个需求点至少对应 1 条用例，并显式覆盖正向、异常、边界、权限、网络场景。')
  }
  if (actions.length === 0) {
    actions.push('当前评测未发现关键结构风险，可继续关注业务覆盖率和样例质量分。')
  }

  const hasHighRisk = risks.some((risk) => risk.severity === 'high')
  const hasMediumRisk = risks.some((risk) => risk.severity === 'medium')
  const confidence: PromptEvaluationConfidence =
    hasHighRisk || input.parseSuccessRate < 80 ? 'low' : hasMediumRisk || input.averageQualityScore < 70 ? 'medium' : 'high'
  const verdict =
    confidence === 'low'
      ? '评测可信度偏低：存在 Token 截断、JSON 修复或解析风险，建议先处理输出预算和结构化约束后再比较模板质量。'
      : confidence === 'medium'
        ? '评测可信度中等：结果可参考，但仍存在结构化输出降级、覆盖不足或样例数量不足。'
        : '评测可信度较高：未发现关键截断或结构化风险，可重点查看覆盖率与质量分。'

  return {
    confidence,
    verdict,
    risks,
    warningGroups,
    actions: uniqueStrings(actions).slice(0, 6),
  }
}

function sumDuration(report: PromptEvaluationReport): number {
  return report.samples.reduce((sum, sample) => sum + sample.durationMs, 0)
}

function metricDelta(next: number | null, prev: number | null): number | null {
  if (next == null || prev == null) return null
  return roundRate(next - prev)
}

export function buildPromptEvaluationComparison(
  original: PromptEvaluationReport,
  optimized: PromptEvaluationReport,
): PromptEvaluationComparison {
  return {
    parseSuccessRateDelta: metricDelta(optimized.parseSuccessRate, original.parseSuccessRate),
    averageQualityScoreDelta: metricDelta(optimized.averageQualityScore, original.averageQualityScore),
    averageCoverageRateDelta: metricDelta(optimized.averageCoverageRate, original.averageCoverageRate),
    totalDurationMsDelta: metricDelta(sumDuration(optimized), sumDuration(original)),
  }
}
