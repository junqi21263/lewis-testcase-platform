import type { FileStatus } from '@/types'

export const INPUT_LENGTH_SOFT_WARN_CHARS = 85_000
export const STREAM_LOG_DISPLAY_MAX_CHARS = 48_000
export const FILE_POLL_INTERVAL_MS = 1000
export const FILE_POLL_MAX_ROUNDS = 900
export const FILE_POLL_MAX_TRANSIENT_ERRORS = 90

const FILE_TRANSIENT_HTTP_STATUS = new Set([502, 503, 504, 520, 522, 524])

export type FlowchartSummary = {
  raw: string
  confidence?: string
  mainPath?: string
  branches: string[]
  nodes: string[]
}

export function tailStreamLogForDisplay(content: string): string {
  if (content.length <= STREAM_LOG_DISPLAY_MAX_CHARS) return content
  const tailKb = Math.round(STREAM_LOG_DISPLAY_MAX_CHARS / 1000)
  const totalKb = Math.round(content.length / 1000)
  return `…（流式输出较长，仅显示末尾 ${tailKb}KB / 共 ${totalKb}KB）\n\n${content.slice(-STREAM_LOG_DISPLAY_MAX_CHARS)}`
}

/** 合并生成接口所需的文本来源（文本输入 / 需求描述 / 补充说明） */
export function buildGenerateRequestText(
  inputText: string,
  requirementDescription: string,
  userNotes: string,
): string {
  const parts: string[] = []
  const main = inputText.trim()
  const desc = requirementDescription.trim()
  const notes = userNotes.trim()
  if (main) parts.push(main)
  if (desc && desc !== main) parts.push(`【需求描述】\n${desc}`)
  if (notes) parts.push(`【补充说明】\n${notes}`)
  return parts.join('\n\n')
}

export function extractFlowchartSummary(content?: string | null): FlowchartSummary | null {
  const text = content?.trim()
  if (!text?.includes('## 流程图结构化摘要')) return null
  const [, rest = ''] = text.split('## 流程图结构化摘要', 2)
  const raw = `## 流程图结构化摘要${rest}`.trim()
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const pickValue = (label: string) => {
    const line = lines.find((item) => item.startsWith(`- ${label}：`))
    return line?.replace(`- ${label}：`, '').trim()
  }
  const collectAfter = (label: string) => {
    const index = lines.findIndex((item) => item.startsWith(`- ${label}：`))
    if (index < 0) return []
    const result: string[] = []
    for (let i = index + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^- [\u4e00-\u9fa5A-Za-z/]+：/.test(line)) break
      result.push(line.replace(/^- /, '').trim())
    }
    return result.slice(0, 6)
  }

  return {
    raw,
    confidence: pickValue('置信度'),
    mainPath: pickValue('主流程'),
    branches: collectAfter('异常/分支'),
    nodes: collectAfter('流程节点'),
  }
}

export function pollStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

export function isTransientFilePollError(error: unknown) {
  const status = pollStatus(error)
  if (status != null) return FILE_TRANSIENT_HTTP_STATUS.has(status)
  const e = error as { request?: unknown; code?: string; name?: string }
  return Boolean(e?.request || e?.code === 'ECONNABORTED' || e?.name === 'TimeoutError')
}

export const fileStatusLabels: Record<FileStatus, string> = {
  PENDING: '等待解析',
  PARSING: '解析中…',
  PARSED: '解析完成',
  FAILED: '解析失败',
}

export function prettyDate(ts?: string) {
  if (!ts) return '--'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

export function qualityScoreTone(score: number): string {
  if (score >= 85) return 'text-emerald-500'
  if (score >= 70) return 'text-sky-500'
  if (score >= 60) return 'text-amber-500'
  return 'text-rose-500'
}

export function issueTypeLabel(type: string): string {
  const map: Record<string, string> = {
    duplicate: '重复',
    generic_title: '标题空泛',
    generic_step: '步骤空泛',
    generic_expected: '预期空泛',
    missing_steps: '缺少步骤',
    missing_expected: '缺少预期',
    low_detail: '细节不足',
    non_executable: '不可执行',
  }
  return map[type] ?? type
}

export function distributionLabel(label: string): string {
  const map: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '低风险',
  }
  return map[label] ?? label
}
