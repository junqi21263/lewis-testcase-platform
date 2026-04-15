import { GenerateDto } from './dto/generate.dto'

type PrismaStep = { order: number; action: string; expected: string }

export function mapRawStepsToPrisma(raw: unknown): PrismaStep[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s: any, idx: number) => ({
    order: typeof s?.order === 'number' ? s.order : idx + 1,
    action: typeof s === 'string' ? s : String(s?.action ?? ''),
    expected: typeof s === 'string' ? '' : String(s?.expected ?? ''),
  }))
}

/** 将模型返回的「功能用例」条目规范为写入 DB 的形状 */
export function mapLegacyCaseRow(c: any, dto: GenerateDto) {
  const steps = mapRawStepsToPrisma(c?.steps)
  return {
    title: String(c?.title || c?.name || '未命名用例').slice(0, 500),
    precondition: String(c?.precondition ?? ''),
    steps,
    expectedResult: String(c?.expected ?? c?.expectedResult ?? ''),
    priority: (c?.priority || 'P2') as string,
    type: (dto.generationOptions?.testType || c?.type || 'FUNCTIONAL') as string,
    tags: Array.isArray(c?.tags) ? c.tags.map((t: any) => String(t)) : [],
  }
}

function formatMetaBlock(meta: Record<string, unknown>): string {
  const m = meta || {}
  const parts: string[] = []
  const arch = typeof m.architecture === 'string' ? m.architecture : ''
  const deps = Array.isArray(m.dependencies) ? (m.dependencies as unknown[]).map(String) : []
  const env = typeof m.environment === 'string' ? m.environment : ''
  const runSteps = Array.isArray(m.runSteps) ? (m.runSteps as unknown[]).map(String) : []
  const notes = typeof m.notes === 'string' ? m.notes : ''
  const optimizations = Array.isArray(m.optimizations) ? (m.optimizations as unknown[]).map(String) : []

  if (arch.trim()) parts.push(`【架构说明】\n${arch}`)
  if (deps.length) parts.push(`【依赖包 / 清单】\n${deps.join('\n')}`)
  if (env.trim()) parts.push(`【运行环境】\n${env}`)
  if (runSteps.length) parts.push(`【运行步骤】\n${runSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`)
  if (notes.trim()) parts.push(`【注意事项】\n${notes}`)
  if (optimizations.length) parts.push(`【优化建议】\n${optimizations.map((s, i) => `${i + 1}. ${s}`).join('\n')}`)

  return parts.join('\n\n')
}

/** 自动化：将 JSON 中的 files + meta 转为平台「用例」行，便于在生成页查看与导出 */
export function mapAutomationPayloadToCases(parsed: any, dto: GenerateDto): ReturnType<typeof mapLegacyCaseRow>[] {
  const meta = parsed?.meta && typeof parsed.meta === 'object' ? (parsed.meta as Record<string, unknown>) : {}
  const files = Array.isArray(parsed?.files) ? parsed.files : []
  const out: ReturnType<typeof mapLegacyCaseRow>[] = []

  const metaText = formatMetaBlock(meta)
  if (metaText.trim()) {
    out.push({
      title: '【自动化】工程说明与运行指南',
      precondition: '',
      steps: [{ order: 1, action: '阅读下文（架构、依赖、环境、运行步骤、注意事项与优化建议）', expected: '' }],
      expectedResult: metaText,
      priority: 'P2',
      type: 'AUTOMATION',
      tags: ['automation', 'meta'],
    })
  }

  for (const f of files) {
    const path = String(f?.path || 'script').slice(0, 480)
    const content = typeof f?.content === 'string' ? f.content : String(f?.content ?? '')
    const desc = f?.description != null ? String(f.description) : ''
    out.push({
      title: `【脚本】${path}`,
      precondition: desc,
      steps: [
        {
          order: 1,
          action: `维护并执行文件：${path}`,
          expected: '脚本语法正确、依赖齐全，可在声明的环境下被测试框架收集执行',
        },
      ],
      expectedResult: content,
      priority: 'P2',
      type: 'AUTOMATION',
      tags: ['automation', `path:${path}`],
    })
  }

  if (out.length) return out

  const legacy = Array.isArray(parsed?.cases) ? parsed.cases : []
  if (legacy.length) return legacy.map((c: any) => mapLegacyCaseRow(c, dto))

  return []
}

export function buildSuiteCaseRows(dto: GenerateDto, parsed: any, rawAssistantText: string) {
  if (dto.generationOptions?.testType === 'AUTOMATION') {
    const rows = mapAutomationPayloadToCases(parsed, dto)
    if (rows.length) return rows
    const fallback = (rawAssistantText || '').trim() || JSON.stringify(parsed ?? {})
    return [
      {
        title: '【自动化】模型输出（未解析为结构化 JSON）',
        precondition: '',
        steps: [
          {
            order: 1,
            action: '检查提示词是否要求严格 JSON；或提高 max_tokens 后重试',
            expected: '',
          },
        ],
        expectedResult: fallback.slice(0, 950000),
        priority: 'P2',
        type: 'AUTOMATION',
        tags: ['automation', 'raw-fallback'],
      },
    ]
  }

  const cases = Array.isArray(parsed?.cases) ? parsed.cases : []
  return cases.map((c: any) => mapLegacyCaseRow(c, dto))
}
