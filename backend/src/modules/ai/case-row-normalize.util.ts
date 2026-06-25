/**
 * 将模型返回的单条用例规范为与 Excel 导出一致的结构：
 * 用例名称、模块:、标签（含「功能」等）、编号前置条件、[n] 步骤、[n] 预期结果
 */

export type NormalizedCaseShape = {
  title: string
  priority: string
  type: string
  module?: string
  riskLevel?: 'high' | 'medium' | 'low'
  precondition?: string
  steps: { order: number; action: string; expected?: string }[]
  expectedResult: string
  tags: string[]
  description?: string
  mermaid?: string | null
  requirementIds: string[]
  testPathIds: string[]
  automationReadiness: {
    status: 'automatable' | 'manual' | 'blocked'
    reason: string
  }
}

const TYPE_TAG_ZH: Record<string, string> = {
  FUNCTIONAL: '功能',
  PERFORMANCE: '性能',
  SECURITY: '安全',
  COMPATIBILITY: '兼容',
  REGRESSION: '回归',
}

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

function toTagArray(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(/[,，;；|｜\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function toIdArray(raw: unknown, prefix: 'REQ' | 'TP'): string[] {
  const fromRaw = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,，;；\s]+/)
      : []
  return [...new Set(
    fromRaw
      .map((x) => String(x).trim().toUpperCase())
      .filter((x) => new RegExp(`^${prefix}-\\d{3}$`).test(x)),
  )]
}

function idsFromTags(tags: string[], prefix: 'REQ' | 'TP'): string[] {
  return toIdArray(tags.flatMap((tag) => tag.match(new RegExp(`${prefix}-\\d{3}`, 'gi')) ?? []), prefix)
}

function normalizeAutomationReadiness(raw: unknown): NormalizedCaseShape['automationReadiness'] {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    const status = String(r.status ?? '').trim()
    if (status === 'automatable' || status === 'manual' || status === 'blocked') {
      return {
        status,
        reason: String(r.reason ?? '').trim() || '模型未提供具体原因',
      }
    }
  }
  return {
    status: 'manual',
    reason: '旧模型输出未声明自动化准备状态，默认需要人工确认。',
  }
}

/** 前置条件：多行时保证「1. 2.」编号（与 Excel 习惯一致） */
export function ensureNumberedPrecondition(pre: string): string | undefined {
  const t = (pre ?? '').trim()
  if (!t) return undefined
  if (/^\d+[\.、．]\s*/m.test(t)) return t
  const lines = t
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length <= 1) return t
  return lines.map((l, i) => `${i + 1}. ${l.replace(/^\d+[\.、．]\s*/, '')}`).join('\n')
}

function hasBracketEnumeration(s: string): boolean {
  return /\[\s*\d+\s*\]/.test(s)
}

function stripNoiseFromExpectedText(s: string): string {
  const t = (s ?? '').trim()
  if (!t) return ''
  const lines = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      const x = l.replace(/^\*\*|\*\*$/g, '').trim()
      if (!x) return false
      if (/^(标签|tags)[：:]?/i.test(x)) return false
      if (/^\"?(tags|steps|expectedResult|precondition|priority|type)\"?\s*[:：]/i.test(x)) return false
      return true
    })
  return lines.join('\n')
}

/** steps 顺序编号、字段兜底（部分模型用 description / desc） */
export function normalizeStepsShape(stepsRaw: unknown): { order: number; action: string; expected?: string }[] {
  if (typeof stepsRaw === 'string') {
    const t = stepsRaw.trim()
    if (!t) return [{ order: 1, action: '（见预期结果或补充步骤）', expected: undefined }]
    try {
      const p = JSON.parse(t) as unknown
      if (Array.isArray(p)) return normalizeStepsShape(p)
    } catch {
      /* 纯文本当作单步 */
    }
    return [{ order: 1, action: t, expected: undefined }]
  }
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    return [{ order: 1, action: '（见预期结果或补充步骤）', expected: undefined }]
  }
  const out = stepsRaw.map((s: any, i: number) => {
    const action = String(s?.action ?? s?.desc ?? s?.description ?? s?.步骤 ?? '').trim()
    const expected = s?.expected != null && String(s.expected).trim() ? String(s.expected).trim() : undefined
    const order = typeof s?.order === 'number' && s.order >= 1 ? Math.floor(s.order) : i + 1
    return { order, action: action || `第 ${i + 1} 步`, expected }
  })
  return out.map((s, i) => ({ ...s, order: i + 1 }))
}

/**
 * 预期结果：优先保留已有 [1] 格式；否则用每步 expected 合成；再否则用整段 expectedResult 兜底到 [n]
 */
export function ensureBracketExpectedResult(steps: { order: number; action: string; expected?: string }[], expectedResult: string): string {
  const er0 = stripNoiseFromExpectedText(expectedResult ?? '')
  if (er0 && hasBracketEnumeration(er0)) return er0

  const n = steps.length
  if (n === 0) return er0 || '（无）'

  const per = steps.map((s) => s.expected?.trim() ?? '')
  if (per.every((x) => x.length > 0)) {
    return steps.map((s, i) => `[${i + 1}] ${per[i]}`).join('\n')
  }
  if (per.some((x) => x.length > 0)) {
    return steps.map((s, i) => `[${i + 1}] ${per[i] || '（本步通过）'}`).join('\n')
  }

  if (er0 && er0 !== '（无）') {
    const lines = er0
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === n) {
      return lines.map((l, i) => (hasBracketEnumeration(l) ? l : `[${i + 1}] ${l.replace(/^\[\d+\]\s*/, '')}`)).join('\n')
    }
    const bySentence = er0
      .split(/[。；;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (bySentence.length >= n) {
      return steps.map((_, i) => `[${i + 1}] ${bySentence[i]}`).join('\n')
    }
    if (n === 1) return `[1] ${er0}`
    return `[${n}] ${er0}`
  }

  return steps.map((_, i) => `[${i + 1}] （与步骤 ${i + 1} 描述一致，通过）`).join('\n')
}

function ensureModuleTag(tags: string[], module: string): string[] {
  const next = [...tags]
  const mod = module.trim()
  if (!mod) return next
  const has = next.some((t) => t === `模块:${mod}` || (t.startsWith('模块:') && t.length > 3))
  if (!has) next.unshift(`模块:${mod}`)
  return next
}

function normalizeRiskLevel(raw: string): 'high' | 'medium' | 'low' | undefined {
  const t = raw.trim().toLowerCase()
  if (!t) return undefined
  if (['high', 'p0', 'p1', '高', '高风险', '严重', 'critical'].includes(t)) return 'high'
  if (['medium', 'mid', '中', '中风险', '一般', 'moderate'].includes(t)) return 'medium'
  if (['low', '低', '低风险', '轻微', 'minor'].includes(t)) return 'low'
  return undefined
}

function ensureRiskTag(tags: string[], riskLevel?: 'high' | 'medium' | 'low'): string[] {
  if (!riskLevel) return tags.filter((t) => !/^风险[:：]\s*$/i.test(t))
  const next = tags.filter((t) => !/^风险[:：]/i.test(t))
  next.push(`风险:${riskLevel}`)
  return next
}

function appendMermaidToDescription(description: string | undefined, mermaid: string): string {
  const m = mermaid.trim()
  if (!m) return description ?? ''
  const base = (description ?? '').trim()
  if (base.includes(m) || /Mermaid:/i.test(base)) return base
  return [base, `Mermaid:\n${m}`].filter(Boolean).join('\n\n')
}

function cleanArtifactText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\*\*/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
}

function stepsToArtifactText(raw: unknown): string {
  if (!Array.isArray(raw)) return cleanArtifactText(raw)
  return raw
    .map((step) => {
      if (typeof step === 'string') return step
      if (step && typeof step === 'object') {
        const obj = step as Record<string, unknown>
        return [obj.action, obj.desc, obj.description, obj.expected].map(cleanArtifactText).filter(Boolean).join(' ')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

const PROMPT_INSTRUCTION_ARTIFACT_RE =
  /(所有用例必须|无重复场景|覆盖维度要求|颗粒度要求|步骤必须|一步一动作|禁止合并多个操作|输出格式|仅输出|顶层必须|字段不能缺失|JSON\s*schema|Prompt|提示词|模板规则|评测模式|批量数量规则|输出前自检|枚举约束)/i

const GENERIC_SCAFFOLD_RE = [
  /测试账号具备.+访问权限/,
  /测试数据满足该需求触发条件/,
  /进入核心流程相关页面或功能入口/,
  /按需求执行.+对应操作/,
  /观察页面反馈、数据状态与后续操作入口/,
  /核心流程入口可正常访问/,
]

export function isPromptInstructionArtifactText(raw: unknown): boolean {
  const text = cleanArtifactText(raw)
  if (!text) return false
  return PROMPT_INSTRUCTION_ARTIFACT_RE.test(text)
}

export function isPromptInstructionArtifactCase(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const c = raw as Record<string, unknown>
  const title = cleanArtifactText(c.title ?? c['用例名称'] ?? c.caseTitle ?? c.name)
  const precondition = cleanArtifactText(c.precondition ?? c['前置条件'] ?? c.preCondition ?? c.prerequisite)
  const expectedResult = cleanArtifactText(c.expectedResult ?? c['预期结果'] ?? c.expected ?? c['期望结果'])
  const description = cleanArtifactText(c.description ?? c['备注'] ?? c.notes)
  const steps = stepsToArtifactText(c.steps ?? c['测试步骤'] ?? c['步骤'])
  const tags = Array.isArray(c.tags) ? c.tags.map(cleanArtifactText).join(' ') : cleanArtifactText(c.tags)
  const allText = [title, precondition, steps, expectedResult, description, tags].filter(Boolean).join('\n')

  const titleLooksLikePromptRule = PROMPT_INSTRUCTION_ARTIFACT_RE.test(title)
  const scaffoldHits = GENERIC_SCAFFOLD_RE.filter((re) => re.test(allText)).length
  const closedLoopPromptRule = /ai-closed-loop/.test(tags) && PROMPT_INSTRUCTION_ARTIFACT_RE.test(allText) && scaffoldHits >= 1
  const genericCoreFlowPromptRule =
    /核心流程/.test(title) && PROMPT_INSTRUCTION_ARTIFACT_RE.test(allText) && scaffoldHits >= 1
  const fullyGenericScaffold = scaffoldHits >= 3 && PROMPT_INSTRUCTION_ARTIFACT_RE.test(allText)

  return titleLooksLikePromptRule || closedLoopPromptRule || genericCoreFlowPromptRule || fullyGenericScaffold
}

export function filterPromptInstructionArtifactCases<T>(rows: T[]): T[] {
  return rows.filter((row) => !isPromptInstructionArtifactCase(row))
}

/** 标签：补全「功能」等与 type 对应的中文标签（Excel 示例为 UI、功能） */
function enrichTagsFromType(tags: string[], type: string): string[] {
  const next = [...tags]
  const zh = TYPE_TAG_ZH[type.toUpperCase()] ?? ''
  if (zh && !next.some((t) => t === zh || t === `${zh}测试`)) {
    next.push(zh)
  }
  return next
}

/**
 * 统一入口：兼容中英文字段名、字符串 tags、缺省 [n] 预期
 */
export function normalizeCaseRowForPersistence(raw: Record<string, unknown>): NormalizedCaseShape {
  const c = { ...raw }

  const title = pickStr(c, 'title', '用例名称', 'caseTitle', 'name').slice(0, 500) || '未命名用例'

  let tags = toTagArray(c.tags)
  if (tags.length === 0 && c.label != null) tags = toTagArray(c.label)
  tags = tags.filter((t) => {
    if (!t.startsWith('模块:')) return true
    return t.slice('模块:'.length).trim().length > 0
  })

  let module = pickStr(c, 'module', '所属模块', 'belongModule', 'mod')
  if (!module) {
    const mTag = tags.find((x) => x.startsWith('模块:'))
    if (mTag) module = mTag.slice('模块:'.length).trim()
  }
  tags = tags.filter((t) => !t.startsWith('模块:'))
  if (module) tags = ensureModuleTag(tags, module)

  let riskLevel = normalizeRiskLevel(pickStr(c, 'riskLevel', 'risk', '风险等级', '风险'))
  if (!riskLevel) {
    const riskTag = tags.find((x) => /^风险[:：]/i.test(x))
    if (riskTag) riskLevel = normalizeRiskLevel(riskTag.replace(/^风险[:：]/i, '').trim())
  }
  tags = ensureRiskTag(tags, riskLevel)

  const type = pickStr(c, 'type', '类型') || 'FUNCTIONAL'
  tags = enrichTagsFromType(tags, type)

  const preRaw = pickStr(c, 'precondition', '前置条件', 'preCondition', 'prerequisite')
  const precondition = ensureNumberedPrecondition(preRaw)

  const steps = normalizeStepsShape(c.steps ?? c.测试步骤 ?? c.步骤)

  const erRaw = pickStr(c, 'expectedResult', '预期结果', 'expected', '期望结果')
  const expectedResult = ensureBracketExpectedResult(steps, erRaw)

  const priority = (pickStr(c, 'priority', '优先级', 'prio') || 'P2').toUpperCase()
  const p = priority.match(/^P[0-3]$/i) ? priority.toUpperCase() : 'P2'

  const typUpper = type.toUpperCase()
  const typeNorm = ['FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'COMPATIBILITY', 'REGRESSION'].includes(typUpper) ? typUpper : 'FUNCTIONAL'

  const mermaidRaw = pickStr(c, 'mermaid', 'flowchart', '流程图')
  const mermaid = mermaidRaw || null
  const descriptionBase = pickStr(c, 'description', '备注', 'notes') || undefined
  const description = mermaid ? appendMermaidToDescription(descriptionBase, mermaid) : descriptionBase

  return {
    title,
    priority: p,
    type: typeNorm,
    module: module || undefined,
    riskLevel,
    precondition,
    steps,
    expectedResult,
    tags,
    description: description || undefined,
    mermaid,
    requirementIds: toIdArray(c.requirementIds ?? c.reqIds ?? c['需求ID'], 'REQ').length
      ? toIdArray(c.requirementIds ?? c.reqIds ?? c['需求ID'], 'REQ')
      : idsFromTags(tags, 'REQ'),
    testPathIds: toIdArray(c.testPathIds ?? c.tpIds ?? c['路径ID'], 'TP').length
      ? toIdArray(c.testPathIds ?? c.tpIds ?? c['路径ID'], 'TP')
      : idsFromTags(tags, 'TP'),
    automationReadiness: normalizeAutomationReadiness(c.automationReadiness ?? c['自动化准备']),
  }
}
