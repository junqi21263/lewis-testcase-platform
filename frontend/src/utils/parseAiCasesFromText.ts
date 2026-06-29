import type { TestCase, TestCasePriority, TestCaseType, TestCaseStatus } from '@/types'
import {
  parseLooseMarkdownToCaseRows,
  shouldUseLooseParsedCases,
  type LooseCaseRow,
} from '@/utils/parseLooseAiOutput'

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** 从模型输出中尽量提取 cases 数组（与后端宽松解析规则对齐） */
export function extractCaseRowsFromText(raw: string): unknown[] {
  const text = (raw || '').trim()
  if (!text) return []

  let parsed: any = tryJson(text)
  if (parsed?.cases && Array.isArray(parsed.cases)) return parsed.cases

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    const inner = fence[1].trim()
    parsed = tryJson(inner)
    if (parsed?.cases && Array.isArray(parsed.cases)) return parsed.cases
    if (Array.isArray(parsed)) return parsed
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    parsed = tryJson(text.slice(start, end + 1))
    if (parsed?.cases && Array.isArray(parsed.cases)) return parsed.cases
  }

  const a0 = text.indexOf('[')
  const a1 = text.lastIndexOf(']')
  if (a0 !== -1 && a1 > a0) {
    parsed = tryJson(text.slice(a0, a1 + 1))
    if (Array.isArray(parsed)) return parsed
  }

  let searchPos = text.length
  for (let i = 0; i < 8; i++) {
    const keyIdx = text.lastIndexOf('"cases"', searchPos - 1)
    if (keyIdx < 0) break
    const start = text.lastIndexOf('{', keyIdx)
    if (start >= 0) {
      const end = text.lastIndexOf('}')
      if (end > start) {
        parsed = tryJson(text.slice(start, end + 1)) as { cases?: unknown[] } | null
        if (parsed?.cases && Array.isArray(parsed.cases) && parsed.cases.length > 0) {
          return parsed.cases
        }
      }
    }
    searchPos = keyIdx
  }

  return []
}

function stableLocalCaseId(index: number, seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return `local-${index}-${(h >>> 0).toString(36)}`
}

function buildRawPlaceholderCase(content: string): TestCase {
  const body =
    content.length > 200_000
      ? `${content.slice(0, 200_000)}\n\n…(已截断)`
      : content
  return {
    id: `local-raw-${Date.now()}`,
    title: 'AI 生成结果（非 JSON）',
    precondition: '',
    steps: [{ order: 1, action: '完整输出见下方「预期结果」', expected: '' }],
    expectedResult: body,
    priority: 'P2',
    type: 'FUNCTIONAL',
    tags: ['ai-raw-output'],
    status: 'DRAFT',
    suiteId: '',
  }
}

function looseRowToTestCase(c: LooseCaseRow, i: number): TestCase {
  return {
    id: stableLocalCaseId(i, c.title || String(i)),
    title: c.title,
    precondition: c.precondition,
    description: undefined,
    steps: c.steps.map((s, j) => ({
      order: typeof s.order === 'number' ? s.order : j + 1,
      action: s.action,
      expected: s.expected,
    })),
    expectedResult: c.expectedResult,
    priority: (c.priority as TestCasePriority) || 'P2',
    type: (c.type as TestCaseType) || 'FUNCTIONAL',
    tags: c.tags,
    status: 'DRAFT',
    suiteId: '',
  }
}

function normalizeToTestCase(c: any, i: number): TestCase {
  const titleSeed = c?.title != null ? String(c.title) : `case-${i}`
  return {
    id: c?.id ? String(c.id) : stableLocalCaseId(i, titleSeed),
    title: c?.title != null && String(c.title).trim() ? String(c.title).slice(0, 500) : `用例 ${i + 1}`,
    precondition: c?.precondition != null ? String(c.precondition) : undefined,
    description: c?.description != null ? String(c.description) : undefined,
    steps: Array.isArray(c?.steps)
      ? c.steps.map((s: any, j: number) => ({
          order: typeof s?.order === 'number' ? s.order : j + 1,
          action: s?.action != null ? String(s.action) : '',
          expected: s?.expected != null ? String(s.expected) : undefined,
        }))
      : [],
    expectedResult:
      c?.expectedResult != null && String(c.expectedResult).trim()
        ? String(c.expectedResult)
        : '（无）',
    priority: (c?.priority as TestCasePriority) || 'P2',
    type: (c?.type as TestCaseType) || 'FUNCTIONAL',
    tags: Array.isArray(c?.tags) ? c.tags.map(String) : [],
    status: (c?.status as TestCaseStatus) || 'DRAFT',
    suiteId: c?.suiteId ? String(c.suiteId) : '',
  }
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
const JSON_FIELD_ARTIFACT_RE =
  /["']?(cases|priority|riskLevel|type|precondition|expectedResult|steps|tags|module|requirementIds|testPathIds)["']?\s*:/i

const GENERIC_SCAFFOLD_RE = [
  /测试账号具备.+访问权限/,
  /测试数据满足该需求触发条件/,
  /进入核心流程相关页面或功能入口/,
  /按需求执行.+对应操作/,
  /观察页面反馈、数据状态与后续操作入口/,
  /核心流程入口可正常访问/,
]

function isPromptInstructionArtifactCase(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const c = raw as Record<string, unknown>
  const title = cleanArtifactText(c.title ?? c['用例名称'] ?? c.caseTitle ?? c.name)
  const precondition = cleanArtifactText(c.precondition ?? c['前置条件'] ?? c.preCondition ?? c.prerequisite)
  const expectedResult = cleanArtifactText(c.expectedResult ?? c['预期结果'] ?? c.expected ?? c['期望结果'])
  const description = cleanArtifactText(c.description ?? c['备注'] ?? c.notes)
  const steps = stepsToArtifactText(c.steps ?? c['测试步骤'] ?? c['步骤'])
  const tags = Array.isArray(c.tags) ? c.tags.map(cleanArtifactText).join(' ') : cleanArtifactText(c.tags)
  const allText = [title, precondition, steps, expectedResult, description, tags].filter(Boolean).join('\n')
  const scaffoldHits = GENERIC_SCAFFOLD_RE.filter((re) => re.test(allText)).length

  return (
    PROMPT_INSTRUCTION_ARTIFACT_RE.test(title) ||
    JSON_FIELD_ARTIFACT_RE.test(title) ||
    (/ai-closed-loop/.test(tags) && PROMPT_INSTRUCTION_ARTIFACT_RE.test(allText) && scaffoldHits >= 1) ||
    (/核心流程/.test(title) && PROMPT_INSTRUCTION_ARTIFACT_RE.test(allText) && scaffoldHits >= 1) ||
    (scaffoldHits >= 3 && PROMPT_INSTRUCTION_ARTIFACT_RE.test(allText))
  )
}

export function filterPromptInstructionArtifactCases<T>(rows: T[]): T[] {
  return rows.filter((row) => !isPromptInstructionArtifactCase(row))
}

/** 将任意模型输出转为可展示的 TestCase 列表（含原文兜底） */
export function parseAiCasesFromText(raw: string): TestCase[] {
  const rows = filterPromptInstructionArtifactCases(extractCaseRowsFromText(raw))
  if (rows.length > 0) return rows.map((c, i) => normalizeToTestCase(c, i))
  const loose = filterPromptInstructionArtifactCases(parseLooseMarkdownToCaseRows(raw))
  if (loose.length > 0 && shouldUseLooseParsedCases(loose, raw)) {
    return loose.map((c, i) => looseRowToTestCase(c, i))
  }
  if (raw.trim()) return [buildRawPlaceholderCase(raw)]
  return []
}
