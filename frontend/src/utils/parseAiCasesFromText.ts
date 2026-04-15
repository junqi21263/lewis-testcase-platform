import type { TestCase, TestCasePriority, TestCaseType, TestCaseStatus } from '@/types'

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

  return []
}

function buildEmptyStreamPlaceholderCase(): TestCase {
  return {
    id: `local-empty-${Date.now()}`,
    title: '未收到模型输出',
    precondition: '',
    steps: [
      {
        order: 1,
        action:
          '请检查：模型 API 与 Key、文件是否已解析完成、图片是否识别出文字；或改用非流式/提高 maxTokens。',
        expected: '',
      },
    ],
    expectedResult: '流式内容为空白且未从服务端拉取到用例，请查看生成记录或后端日志。',
    priority: 'P2',
    type: 'FUNCTIONAL',
    tags: ['ai-empty-output'],
    status: 'DRAFT',
    suiteId: '',
  }
}

function buildRawPlaceholderCase(content: string): TestCase {
  const body =
    content.length > 120_000
      ? `${content.slice(0, 120_000)}\n\n…(已截断)`
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

function normalizeToTestCase(c: any, i: number): TestCase {
  return {
    id: c?.id ? String(c.id) : `local-${i}-${Date.now()}`,
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

/** 将任意模型输出转为可展示的 TestCase 列表（含原文兜底） */
export function parseAiCasesFromText(raw: string): TestCase[] {
  const rows = extractCaseRowsFromText(raw)
  if (rows.length > 0) return rows.map((c, i) => normalizeToTestCase(c, i))
  if (raw.trim()) return [buildRawPlaceholderCase(raw)]
  return [buildEmptyStreamPlaceholderCase()]
}
