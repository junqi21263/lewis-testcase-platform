/**
 * 当模型输出 Markdown / 非约定 JSON 时，尽量拆成多条用例（与前端 parseLooseAiOutput 保持算法一致）。
 */

const MODULE_TAG_PREFIX = '模块:'

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** 从「形似 JSON 但结构错误」的包裹里取出大段 Markdown（如仅含 steps + expectedResult） */
export function unwrapWrongJsonWrapper(raw: string): string {
  const t = (raw || '').trim()
  if (!t.startsWith('{')) return raw

  const parsed = tryJson(t) as Record<string, unknown> | null
  if (!parsed || typeof parsed !== 'object') return raw

  const er = parsed.expectedResult
  if (typeof er === 'string' && er.trim().length > 80) return er

  const content = parsed.content
  if (typeof content === 'string' && content.trim().length > 80) return content

  const msg = parsed.message
  if (typeof msg === 'string' && msg.trim().length > 80) return msg

  return raw
}

export type LooseCaseRow = {
  title: string
  precondition?: string
  steps: { order: number; action: string; expected?: string }[]
  expectedResult: string
  priority: string
  type: string
  tags: string[]
}

function isMetaLineText(s: string): boolean {
  const t = (s || '').trim().replace(/^\*\*|\*\*$/g, '')
  if (!t) return true
  if (/^(优先级|类型|前置条件|测试步骤|步骤描述|测试步骤|步骤|预期结果|期望结果|标签|tags)[：:]?/i.test(t)) return true
  if (/^\"?(tags|steps|expectedResult|precondition|priority|type)\"?\s*[:：]/i.test(t)) return true
  if (t.startsWith('{') || t.startsWith('[')) return true
  return false
}

function stripMetaLines(block: string): string {
  return block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !isMetaLineText(l))
    .join('\n')
}

function parseStepsFromBlock(block: string): { order: number; action: string; expected?: string }[] {
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const out: { order: number; action: string; expected?: string }[] = []
  for (const line of lines) {
    if (isMetaLineText(line)) continue
    const bracket = line.match(/^\[(\d+)\]\s*(.+)$/)
    if (bracket) {
      const rest = bracket[2]
      if (isMetaLineText(rest)) continue
      const expIdx = rest.search(/(?:期望|预期)[：:]/)
      if (expIdx !== -1) {
        out.push({
          order: out.length + 1,
          action: rest.slice(0, expIdx).trim(),
          expected: rest.slice(expIdx).replace(/^(?:期望|预期)[：:]\s*/i, '').trim(),
        })
      } else {
        out.push({ order: out.length + 1, action: rest, expected: undefined })
      }
      continue
    }
    const num = line.match(/^(\d+)[\.\)、]\s*(.+)$/)
    if (num) {
      const rest = num[2]
      if (isMetaLineText(rest)) continue
      const expIdx = rest.search(/(?:期望|预期)[：:]/)
      if (expIdx !== -1) {
        out.push({
          order: out.length + 1,
          action: rest.slice(0, expIdx).trim(),
          expected: rest.slice(expIdx).replace(/^(?:期望|预期)[：:]\s*/i, '').trim(),
        })
      } else {
        out.push({ order: out.length + 1, action: rest, expected: undefined })
      }
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      if (isMetaLineText(bullet[1])) continue
      out.push({ order: out.length + 1, action: bullet[1], expected: undefined })
    }
  }
  return out
}

/** 当前面标题行表示「模块 / 功能」分区时，作为子用例的默认所属模块 */
function inferSectionModule(titleLine: string): string | undefined {
  const t = titleLine.replace(/^#{1,4}\s*/, '').replace(/\*\*/g, '').trim()
  // e.g. "### 1. 登录功能" -> 登录功能
  const m = t.match(/^\d+[\.\)、]\s*(.+)$/)
  if (m && m[1].length <= 40) return m[1].trim()
  if (t.length >= 2 && t.length <= 40 && !/用例/.test(t)) return t
  return undefined
}

function parseOneChunk(chunk: string, sectionModule?: string): LooseCaseRow | null {
  let text = chunk.trim()
  if (text.length < 12) return null

  const lines = text.split('\n')
  let titleLine = lines[0]
    .replace(/^#{1,4}\s*/, '')
    .replace(/^\*\*\s*|\s*\*\*$/g, '')
    .trim()
  const boldInline = lines[0].match(/^\*\*([^*]+)\*\*/)
  if (boldInline) titleLine = boldInline[1].trim()
  else titleLine = titleLine.replace(/^\*\*([^*]+)\*\*$/, '$1').trim()
  titleLine = titleLine.replace(/\s*[-－]\s*优先级[：:].*$/i, '').trim()
  if (!titleLine) return null
  titleLine = titleLine.slice(0, 500)

  const full = text

  let moduleLabel =
    (full.match(/所属模块[：:\s]*([^\n]+)/)?.[1] || '').trim() || sectionModule || ''

  const prioM = full.match(/优先级[：:\s]*(P[0-3])/i)
  const prio = prioM ? prioM[1].toUpperCase() : 'P2'

  const typeM = full.match(/类型[：:\s]*([A-Za-z_]+)/)
  let typ = 'FUNCTIONAL'
  if (typeM) {
    const u = typeM[1].toUpperCase()
    if (['FUNCTIONAL', 'PERFORMANCE', 'SECURITY', 'COMPATIBILITY', 'REGRESSION'].includes(u)) typ = u
  }

  let pre = ''
  const preM = full.match(
    /前置条件[：:\s]*([\s\S]*?)(?=\n\s*(?:测试)?步骤|\n\s*\*\*[^*]|\n#{1,4}\s|\n\*{0,2}用例|\n优先级|$)/i,
  )
  if (preM) pre = preM[1].trim().replace(/^[-*]\s*/gm, '').trim()

  let stepsBlock = ''
  const stM = full.match(
    /(?:步骤描述|测试步骤|步骤)[（(]?\d*[）)]?[：:\s]*([\s\S]*?)(?=\n\s*(?:预期|期望)结果|$)/i,
  )
  if (stM) stepsBlock = stM[1].trim()

  let steps = parseStepsFromBlock(stepsBlock)

  let exp = ''
  const expM = full.match(
    /(?:预期|期望)结果[：:\s]*([\s\S]*?)(?=\n#{2,4}\s|\n\*{0,2}用例\s*\d+|\n(?=\*\*[^*]+\*\*)|$)/i,
  )
  if (expM) exp = stripMetaLines(expM[1].trim())

  if (steps.length === 0) {
    const numbered = text.split('\n').filter((l) => {
      if (!/^\s*\d+[\.\)、]\s*\S/.test(l)) return false
      const rest = l.replace(/^\s*\d+[\.\)、]\s*/, '').trim()
      if (isMetaLineText(rest)) return false
      return true
    })
    if (numbered.length > 0) {
      steps = numbered.map((l, i) => ({
        order: i + 1,
        action: l.replace(/^\s*\d+[\.\)、]\s*/, '').trim().replace(/^\*\*|\*\*$/g, ''),
        expected: undefined,
      }))
    }
  }

  const tags: string[] = ['ai-parsed-markdown']
  if (moduleLabel) tags.push(`${MODULE_TAG_PREFIX}${moduleLabel}`)

  if (steps.length === 0 && !exp) {
    const body = lines.slice(1).join('\n').trim()
    if (body.length > 30) {
      return {
        title: titleLine,
        precondition: pre || undefined,
        steps: [{ order: 1, action: titleLine, expected: '' }],
        expectedResult: body.slice(0, 80_000),
        priority: prio,
        type: typ,
        tags,
      }
    }
    return null
  }

  return {
    title: titleLine,
    precondition: pre || undefined,
    steps: steps.length ? steps : [{ order: 1, action: '（见正文）', expected: '' }],
    expectedResult: exp || '（见正文）',
    priority: prio,
    type: typ,
    tags,
  }
}

function splitIntoCaseChunks(text: string): string[] {
  const inner = unwrapWrongJsonWrapper(text).trim()
  if (!inner) return []

  const patterns: RegExp[] = [
    /\n(?=\*\*[^*\n]{2,200}\*\*)/,
    /\n(?=\*{0,2}用例\s*\d+)/gi,
    /\n(?=####\s+)/,
    /\n(?=###\s*\d+[\.\)、])/,
    /\n(?=###\s+[^\n#])/,
  ]

  for (const re of patterns) {
    const parts = inner
      .split(re)
      .map((s) => s.trim())
      .filter((s) => s.length > 25)
    if (parts.length >= 2) return parts
  }

  return [inner]
}

/**
 * 将非 JSON 或错误 JSON 包裹的正文拆成多条 case 行（供 mapRowToCaseInput）
 */
export function parseLooseMarkdownToCaseRows(raw: string): LooseCaseRow[] {
  const base = unwrapWrongJsonWrapper((raw || '').trim())
  if (!base.trim()) return []

  const chunks = splitIntoCaseChunks(base)
  const seen = new Set<string>()
  const out: LooseCaseRow[] = []

  let currentSectionModule: string | undefined

  for (const chunk of chunks) {
    const first = chunk.split('\n')[0] || ''
    if (/^#{1,4}\s+/.test(first) && !/用例/.test(first)) {
      currentSectionModule = inferSectionModule(first)
    }

    const row = parseOneChunk(chunk, currentSectionModule)
    if (!row) continue
    const key = `${row.title}|${row.expectedResult.slice(0, 120)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }

  if (out.length >= 2) return out

  // 仅拆出一条但「预期结果」里仍含多级标题时，对正文再拆一轮
  if (out.length === 1 && (out[0].expectedResult.match(/\n###\s/g) || []).length >= 2) {
    const sub = parseLooseMarkdownToCaseRows(out[0].expectedResult)
    if (sub.length >= 2) return sub
  }

  // 单大块：多段 **用例标题** 挤在一起时再切
  if (out.length === 1 && (base.match(/\*\*[^*\n]{2,120}\*\*/g) || []).length >= 3) {
    const alt = base.split(/\n(?=\*\*[^*\n]{2,200}\*\*)/).filter((s) => s.trim().length > 30)
    if (alt.length >= 2) {
      const out2: LooseCaseRow[] = []
      const seen2 = new Set<string>()
      for (const c of alt) {
        const row = parseOneChunk(c.trim(), currentSectionModule)
        if (!row) continue
        const key = `${row.title}|${row.expectedResult.slice(0, 120)}`
        if (seen2.has(key)) continue
        seen2.add(key)
        out2.push(row)
      }
      if (out2.length >= 2) return out2
    }
  }

  // 单大块：若明显是多「用例」关键词，再按行切一次
  if (out.length === 1 && (base.match(/用例\s*\d+/g) || []).length >= 3) {
    const alt = base.split(/\n(?=\*{0,2}用例\s*\d+)/gi).filter((s) => s.trim().length > 40)
    if (alt.length >= 2) {
      const out2: LooseCaseRow[] = []
      const seen2 = new Set<string>()
      for (const c of alt) {
        const row = parseOneChunk(c.trim(), currentSectionModule)
        if (!row) continue
        const key = `${row.title}|${row.expectedResult.slice(0, 120)}`
        if (seen2.has(key)) continue
        seen2.add(key)
        out2.push(row)
      }
      if (out2.length >= 2) return out2
    }
  }

  return out
}

export function extractModuleFromTags(tags: unknown): string | undefined {
  if (!Array.isArray(tags)) return undefined
  for (const t of tags) {
    if (typeof t !== 'string') continue
    if (t.startsWith(MODULE_TAG_PREFIX)) return t.slice(MODULE_TAG_PREFIX.length).trim()
  }
  return undefined
}
