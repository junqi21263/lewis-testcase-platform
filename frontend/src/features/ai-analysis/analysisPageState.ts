import { AI_ANALYSIS_PROMPT_DEFAULT as ANALYSIS_PROMPT } from '@/pages/aiAnalysisPromptDefault'
import type { UploadedFile, GenerationStatus } from '@/types'
import { safeRandomUUID } from '@/utils/uuid'
import type { RecoveredAnalysisStatus } from '@/utils/aiAnalysisRecovery'

export type AnalysisStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'analyzing'
  | 'review'
  | 'approved'
  | 'error'

/** 终端日志行语义状态（与左侧图标一一对应，不由 emoji 表示） */
export type TerminalLogStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'info'

export interface LogEntry {
  id: string
  text: string
  timestamp: string
  /** 当文案不足以推断状态时（如 ERROR reducer 的短错误码）强制指定 */
  statusOverride?: TerminalLogStatus
}

export interface PageState {
  status: AnalysisStatus
  logs: LogEntry[]
  reportText: string
  reviewText: string
  revisionCount: number
}

export type Action =
  | { type: 'START_UPLOAD' }
  | { type: 'UPLOAD_DONE' }
  | { type: 'START_ANALYSIS' }
  | { type: 'ADD_LOG'; log: LogEntry }
  | { type: 'APPEND_REPORT'; chunk: string }
  | { type: 'SET_REPORT' }
  | { type: 'SET_REVIEW_TEXT'; text: string }
  | { type: 'REVIEW' }
  | { type: 'APPROVE' }
  | { type: 'RESET' }
  | { type: 'GO_IDLE' }
  | { type: 'ERROR'; log: LogEntry }
  | { type: 'STOP_TO_IDLE' }
  | { type: 'LOAD_SAVED_REPORT'; text: string }
  | { type: 'LOAD_RECOVERED_REPORT'; text: string; status: RecoveredAnalysisStatus }
  | { type: 'CLEAR_LOGS' }

export const initialPageState: PageState = {
  status: 'idle',
  logs: [],
  reportText: '',
  reviewText: '',
  revisionCount: 0,
}

export const PROMPT_TEMPLATE_STORAGE_KEY = 'ai-analysis-prompt-template-v2'

export const POLL_INTERVAL_MS = 1000
/** 与后端 FILE_PARSE_TIMEOUT_MINUTES（默认 15）对齐：约 15 分钟内每秒轮询一次 */
export const POLL_MAX_ROUNDS = 900
export const POLL_MAX_TRANSIENT_ERRORS = 90
const TRANSIENT_POLL_HTTP_STATUS = new Set([502, 503, 504, 520, 522, 524])

/** 多图批量上传：允许的扩展名（与后端图片解析一致） */
const IMAGE_BATCH_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function pageReducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case 'START_UPLOAD':
      return {
        ...state,
        status: 'uploading',
        logs: [],
        reportText: '',
        reviewText: '',
      }
    case 'UPLOAD_DONE':
      return { ...state, status: 'parsing' }
    case 'START_ANALYSIS':
      return {
        ...state,
        status: 'analyzing',
        logs: [],
        reportText: '',
        reviewText: '',
      }
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.log] }
    case 'APPEND_REPORT':
      return { ...state, reportText: state.reportText + action.chunk }
    case 'SET_REPORT':
      return { ...state, status: 'review' }
    case 'SET_REVIEW_TEXT':
      return { ...state, reviewText: action.text }
    case 'REVIEW': {
      const round = state.revisionCount + 1
      return {
        ...state,
        status: 'analyzing',
        logs: [],
        reportText: '',
        revisionCount: round,
      }
    }
    case 'APPROVE':
      return { ...state, status: 'approved' }
    case 'RESET':
      return initialPageState
    case 'GO_IDLE':
      return { ...state, status: 'idle' }
    case 'ERROR':
      return { ...state, logs: [...state.logs, action.log], status: 'error' }
    case 'STOP_TO_IDLE':
      return { ...state, status: 'idle' }
    case 'LOAD_SAVED_REPORT':
      return {
        ...state,
        status: 'review',
        reportText: action.text,
        reviewText: '',
        logs: [],
      }
    case 'LOAD_RECOVERED_REPORT':
      return {
        ...state,
        status: action.status === 'idle' ? 'idle' : action.status,
        reportText: action.text,
        reviewText: '',
        logs:
          action.status === 'analyzing'
            ? [
                {
                  id: safeRandomUUID(),
                  text: '正在从流式快照恢复，任务仍在后台处理中…',
                  timestamp: nowTime(),
                  statusOverride: 'running',
                },
              ]
            : [],
      }
    case 'CLEAR_LOGS':
      return { ...state, logs: [] }
    default:
      return state
  }
}

export function loadStoredPromptTemplate(): string {
  try {
    const s = localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY)
    if (s?.trim()) return s
  } catch {
    /* 隐私模式等 */
  }
  return ANALYSIS_PROMPT
}

export function getHttpStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

export function isTransientPollError(error: unknown): boolean {
  const status = getHttpStatus(error)
  if (status != null) return TRANSIENT_POLL_HTTP_STATUS.has(status)

  const err = error as { request?: unknown; code?: string; name?: string }
  return Boolean(err?.request || err?.code === 'ECONNABORTED' || err?.name === 'TimeoutError')
}

export function pollErrorLabel(error: unknown): string {
  const status = getHttpStatus(error)
  if (status != null) return `HTTP ${status}`
  const code = (error as { code?: string })?.code
  return code || '网络异常'
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** 合并「需求描述」与「补充说明」，与原先单一 requirementText 语义一致 */
export function combineUserRequirementNotes(desc: string, supp: string): string {
  const d = desc.trim()
  const s = supp.trim()
  if (d && s) return `${d}\n\n${s}`
  return d || s
}

export function isImageBatchFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_BATCH_EXT.has(ext)
}

export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}

export function formatUploadTime(iso: string): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatFileSizeShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export function fileHistoryStatusBadge(status: UploadedFile['status']): { label: string; cls: string } {
  switch (status) {
    case 'PARSED':
      return { label: '已解析', cls: 'bg-blue-600 text-white border-transparent font-semibold' }
    case 'PARSING':
      return { label: '解析中', cls: 'bg-blue-600 text-white border-transparent font-semibold animate-pulse' }
    case 'PENDING':
      return { label: '待解析', cls: 'bg-slate-600 text-white border-transparent font-semibold' }
    case 'FAILED':
      return { label: '失败', cls: 'bg-red-600 text-white border-transparent font-semibold' }
    default:
      return { label: String(status), cls: 'bg-slate-600 text-white border-transparent font-semibold' }
  }
}

export function analysisRecordStatusBadge(status: GenerationStatus): { label: string; cls: string } {
  switch (status) {
    case 'SUCCESS':
      return { label: 'SUCCESS', cls: 'bg-emerald-600 text-white border-transparent font-semibold' }
    case 'PROCESSING':
    case 'PENDING':
      return { label: status, cls: 'bg-blue-600 text-white border-transparent font-semibold' }
    case 'FAILED':
    case 'CANCELLED':
      return { label: status, cls: 'bg-red-600 text-white border-transparent font-semibold' }
    default:
      return { label: status, cls: 'bg-slate-600 text-white border-transparent font-semibold' }
  }
}

/**
 * 终端日志状态由文案语义推断（与 dispatch 时是否传入 override 无关）。
 * 顺序：错误 → 警告 → 等待 → 取消/信息 → 成功（排除「等待解析」类）→ 进行中。
 */
export function terminalLogStatusFromText(text: string): TerminalLogStatus {
  const t = text
  const errorLike = t.includes('失败') || (t.includes('错误') && !t.includes('无错误'))
  if (errorLike) return 'error'

  if (t.includes('提示：') || t.includes('识别阶段提示') || t.includes('仅供参考')) return 'warning'

  if (t.includes('等待解析') || t.includes('等待文档')) return 'pending'
  if (t.includes('等待') && !t.includes('正在')) return 'pending'

  if (t.includes('已取消') || t.includes('已停止') || t.includes('已请求取消')) return 'info'

  const successLike =
    t.includes('上传成功') ||
    t.includes('解析成功') ||
    t.includes('读取成功') ||
    (t.includes('完成') && !t.includes('未完成'))
  if (successLike) return 'success'

  const runningLike =
    t.includes('正在') ||
    t.includes('正在等待') ||
    t.includes('开始需求分析') ||
    t.includes('开始解析') ||
    t.includes('📤') ||
    t.includes('并行解析') ||
    t.includes('调用 AI') ||
    t.includes('重新解析') ||
    t.includes('重新分析')
  if (runningLike) return 'running'

  return 'info'
}

export function mapParseStageMessage(stage: string | null | undefined): { text: string } {
  const s = stage ?? 'PENDING'
  switch (s) {
    case 'PENDING':
      return { text: '📄 文件上传成功，等待解析...' }
    case 'CLAIMED':
      return { text: '📝 开始解析文档...' }
    case 'FILE_OK':
      return { text: '✅ 文件读取成功，继续解析…' }
    case 'PDF':
      return { text: '📄 正在提取 PDF 文本...' }
    case 'PDF_TEXT_LAYER':
      return { text: '📄 正在提取 PDF 内置文本层...' }
    case 'PDF_TEXT_LAYER_OK':
      return { text: '✅ PDF 内置文本可用，跳过 OCR' }
    case 'HUNYUAN_COS_MULTIMODAL':
      return { text: '🤖 混元多模态：正在理解文档（服务端调用，浏览器不会出现 hunyuan 域名）' }
    case 'HUNYUAN_COS_MULTIMODAL_DONE':
      return { text: '✅ 混元多模态理解完成' }
    case 'HUNYUAN_COS_MULTIMODAL_FALLBACK':
      return { text: '⚠️ 混元多模态未返回有效正文，尝试降级链路…' }
    case 'PDF_OCR_PIPELINE':
      return { text: '🔍 扫描件或文本不足，正在分页 OCR（分批处理）...' }
    case 'WORD':
      return { text: '📄 正在提取 Word 文本...' }
    case 'EXCEL':
      return { text: '📊 正在解析 Excel 表格...' }
    case 'YAML':
    case 'TEXT':
      return { text: '📄 正在读取文本...' }
    case 'IMAGE':
      return { text: '🔍 检测到扫描件，正在 OCR 识别...' }
    case 'STRUCTURE':
      return { text: '⚙️ 正在结构化需求提取...' }
    case 'PDF_OCR_PARTIAL':
      return { text: '📎 已生成部分解析文本，后台继续识别剩余页面…' }
    case 'DONE':
      return { text: '✅ 解析完成' }
    case 'FAILED':
      return { text: '❌ 解析失败' }
    case 'CANCELLED':
      return { text: '❌ 已取消解析' }
    default: {
      const m = /^PDF_OCR_P(\d+)_(\d+)$/.exec(s || '')
      if (m) {
        return {
          text: `🔍 正在识别 PDF 第 ${m[1]}–${m[2]} 页（分批 OCR）...`,
        }
      }
      return { text: `📄 解析阶段：${s}` }
    }
  }
}
