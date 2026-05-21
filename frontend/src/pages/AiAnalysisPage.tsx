/**
 * AiAnalysisPage —— AI 需求分析全流程
 * 分片上传、解析阶段轮询、需求分析走 /ai/analyze/stream、停止 / 取消、文件历史、解析文本预览
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useReducer,
  useMemo,
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import {
  Brain,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Square,
  Terminal,
  User,
  ArrowRight,
  X,
  Copy,
  Printer,
  Trash2,
  ChevronDown,
  ChevronUp,
  WifiOff,
  FileDown,
  Sparkles,
  Waypoints,
  Search,
  Maximize2,
  Info,
  Circle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { appConfirm } from '@/store/appConfirmStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { filesApi } from '@/api/files'
import { subscribeFileParseEvents } from '@/api/fileParseSse'
import { aiApi } from '@/api/ai'
import type { AIModel, UploadedFile, GenerationRecord, GenerationStatus } from '@/types'
import { safeRandomUUID } from '@/utils/uuid'
import { displayUploadedFilename, normalizeUploadedFilename } from '@/utils/filenameDisplay'
import { stashUploadedOriginalName } from '@/utils/uploadFilenameMemory'
import { maybeShrinkParseErrorField, sanitizeErrorForDisplay } from '@/utils/sanitizeErrorForDisplay'
import { recordsApi } from '@/api/records'
import { AI_ANALYSIS_PROMPT_DEFAULT as ANALYSIS_PROMPT } from './aiAnalysisPromptDefault'
import { useChunkedUpload } from '@/hooks/useChunkedUpload'
import { useGenerateStore } from '@/store/generateStore'
import { AnalysisMarkdownReport } from '@/components/analysis/AnalysisMarkdownReport'
import { saveAs } from 'file-saver'
import {
  buildAnalysisExportBasename,
  buildAnalysisPdfFileName,
  buildAnalysisXmindFileName,
  saveAnalysisReportPdf,
} from '@/utils/exportAnalysisPdf'
import { renderMermaidChartsToPngBase64 } from '@/utils/analysisMermaidPdf'
import { buildAnalysisXmindBlob } from '@/utils/buildAnalysisXmind'
import {
  ANALYSIS_PROMPT_PRESETS,
  findPresetIdForBody,
  touchRecentPresetId,
  readRecentPresetIds,
  type AnalysisPromptPreset,
} from '@/pages/aiAnalysisStudioPresets'

/* ──────────────────────── 类型 ──────────────────────── */

type AnalysisStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'analyzing'
  | 'review'
  | 'approved'
  | 'error'

/** 终端日志行语义状态（与左侧图标一一对应，不由 emoji 表示） */
type TerminalLogStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'info'

interface LogEntry {
  id: string
  text: string
  timestamp: string
  /** 当文案不足以推断状态时（如 ERROR reducer 的短错误码）强制指定 */
  statusOverride?: TerminalLogStatus
}

interface PageState {
  status: AnalysisStatus
  logs: LogEntry[]
  reportText: string
  reviewText: string
  revisionCount: number
}

type Action =
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
  | { type: 'CLEAR_LOGS' }

const initialPageState: PageState = {
  status: 'idle',
  logs: [],
  reportText: '',
  reviewText: '',
  revisionCount: 0,
}

function pageReducer(state: PageState, action: Action): PageState {
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
    case 'REVIEW':
      return {
        ...state,
        status: 'analyzing',
        logs: [],
        reportText: '',
        revisionCount: state.revisionCount + 1,
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
    case 'CLEAR_LOGS':
      return { ...state, logs: [] }
    default:
      return state
  }
}

const PROMPT_TEMPLATE_STORAGE_KEY = 'ai-analysis-prompt-template-v2'

function loadStoredPromptTemplate(): string {
  try {
    const s = localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY)
    if (s?.trim()) return s
  } catch {
    /* 隐私模式等 */
  }
  return ANALYSIS_PROMPT
}

const POLL_INTERVAL_MS = 1000
/** 与后端 FILE_PARSE_TIMEOUT_MINUTES（默认 15）对齐：约 15 分钟内每秒轮询一次 */
const POLL_MAX_ROUNDS = 900
const POLL_MAX_TRANSIENT_ERRORS = 90
const TRANSIENT_POLL_HTTP_STATUS = new Set([502, 503, 504, 520, 522, 524])

function getHttpStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

function isTransientPollError(error: unknown): boolean {
  const status = getHttpStatus(error)
  if (status != null) return TRANSIENT_POLL_HTTP_STATUS.has(status)

  const err = error as { request?: unknown; code?: string; name?: string }
  return Boolean(err?.request || err?.code === 'ECONNABORTED' || err?.name === 'TimeoutError')
}

function pollErrorLabel(error: unknown): string {
  const status = getHttpStatus(error)
  if (status != null) return `HTTP ${status}`
  const code = (error as { code?: string })?.code
  return code || '网络异常'
}

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

/** 合并「需求描述」与「补充说明」，与原先单一 requirementText 语义一致 */
function combineUserRequirementNotes(desc: string, supp: string): string {
  const d = desc.trim()
  const s = supp.trim()
  if (d && s) return `${d}\n\n${s}`
  return d || s
}

const REQ_DESC_MAX = 5000
const REQ_SUPP_MAX = 5000

/** 多图批量上传：允许的扩展名（与后端图片解析一致） */
const IMAGE_BATCH_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function isImageBatchFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_BATCH_EXT.has(ext)
}

function formatRelative(iso: string): string {
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

function formatUploadTime(iso: string): string {
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

function formatFileSizeShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function fileHistoryStatusBadge(status: UploadedFile['status']): { label: string; cls: string } {
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

function analysisRecordStatusBadge(status: GenerationStatus): { label: string; cls: string } {
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
function terminalLogStatusFromText(text: string): TerminalLogStatus {
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

function mapParseStageMessage(stage: string | null | undefined): { text: string } {
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

type StudioStepState = 'pending' | 'running' | 'success' | 'error'

const STUDIO_STEP_LABELS = [
  '文件接收',
  '文档解析',
  'OCR / 多模态提取',
  '需求归纳',
  '结构化报告',
] as const

function deriveStudioStepStates(
  status: AnalysisStatus,
  uploadedFile: UploadedFile | null,
  reportText: string,
): StudioStepState[] {
  const rep = reportText.trim().length > 0
  const f = uploadedFile
  const out: StudioStepState[] = ['pending', 'pending', 'pending', 'pending', 'pending']

  if (!f) {
    if (status === 'error') out[0] = 'error'
    return out
  }
  if (status === 'uploading') {
    out[0] = 'running'
    return out
  }
  out[0] = 'success'

  if (f.status === 'FAILED') {
    out[1] = 'error'
    return out
  }
  if (status === 'parsing' || f.status === 'PARSING' || f.status === 'PENDING') {
    out[1] = 'running'
    if (f.fileType === 'IMAGE' || f.fileType === 'PDF') out[2] = 'running'
    return out
  }

  if (f.status === 'PARSED') {
    out[1] = 'success'
    out[2] = 'success'
  }

  if (status === 'idle') return out

  if (status === 'analyzing') {
    out[3] = 'running'
    if (rep) out[4] = 'running'
    return out
  }

  if (status === 'review' || status === 'approved') {
    out[3] = 'success'
    out[4] = rep ? 'success' : 'pending'
    return out
  }

  if (status === 'error') {
    if (rep) {
      out[3] = 'success'
      out[4] = 'error'
    } else {
      out[3] = 'error'
    }
    return out
  }

  return out
}

function AiStudioStepRail({
  status,
  uploadedFile,
  reportText,
}: {
  status: AnalysisStatus
  uploadedFile: UploadedFile | null
  reportText: string
}) {
  const states = deriveStudioStepStates(status, uploadedFile, reportText)
  const chip = (s: StudioStepState) =>
    s === 'success'
      ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100'
      : s === 'running'
        ? 'border-cyan-500/55 bg-cyan-500/10 text-cyan-900 dark:text-cyan-100 motion-safe:animate-pulse'
        : s === 'error'
          ? 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-100'
          : 'border-workspace-panel-border/60 bg-workspace-panel-muted/50 text-workspace-text-secondary'

  return (
    <ol className="grid gap-1.5 sm:grid-cols-5">
      {STUDIO_STEP_LABELS.map((label, i) => {
        const s = states[i] ?? 'pending'
        return (
          <li
            key={label}
            className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 motion-safe:transition-[transform,opacity] motion-safe:duration-300 ${chip(s)}`}
          >
            <Circle className="h-2 w-2 shrink-0 fill-current opacity-80" aria-hidden />
            <span className="truncate text-[10px] font-semibold leading-tight">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/* ──────────────────── 子组件 ──────────────────────── */

function terminalLogTextClassFromStatus(status: TerminalLogStatus): string {
  switch (status) {
    case 'error':
      return 'text-[color:var(--ui-text-danger)]'
    case 'success':
      return 'text-[color:var(--ui-text-success)]'
    case 'warning':
      return 'text-amber-800 dark:text-amber-200'
    case 'info':
      return 'text-[color:var(--ui-terminal-meta)]'
    case 'pending':
      return 'text-[color:var(--ui-terminal-meta)]'
    case 'running':
    default:
      return 'text-[color:var(--ui-terminal-line)]'
  }
}

/** 固定 20×20 图标列 + CSS transform 旋转，避免 Loader2 与行高导致的错位 */
function TerminalLogStatusIcon({ status }: { status: TerminalLogStatus }) {
  const c = (name: string) => ({ color: `var(${name})` } as const)

  if (status === 'running') {
    return (
      <span className="log-status-spinner-shell" role="status" aria-label="进行中">
        <span className="log-status-spinner-dial" />
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="log-status-spinner-shell" aria-hidden>
        <CheckCircle2 className="h-[15px] w-[15px]" strokeWidth={2} style={c('--ai-ar-log-success')} />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="log-status-spinner-shell" aria-hidden>
        <XCircle className="h-[15px] w-[15px]" strokeWidth={2} style={c('--ai-ar-log-error')} />
      </span>
    )
  }
  if (status === 'warning') {
    return (
      <span className="log-status-spinner-shell" aria-hidden>
        <AlertTriangle className="h-[14px] w-[14px]" strokeWidth={2} style={c('--ai-ar-log-warning')} />
      </span>
    )
  }
  if (status === 'info') {
    return (
      <span className="log-status-spinner-shell" aria-hidden>
        <Info className="h-[14px] w-[14px]" strokeWidth={2} style={c('--ai-ar-log-info')} />
      </span>
    )
  }
  /* pending */
  return (
    <span className="log-status-spinner-shell" aria-hidden>
      <Circle className="h-3 w-3" strokeWidth={2} fill="none" style={c('--ai-ar-log-pending')} />
    </span>
  )
}

function LogLine({ entry }: { entry: LogEntry }) {
  const status = entry.statusOverride ?? terminalLogStatusFromText(entry.text)
  const textCls = terminalLogTextClassFromStatus(status)
  return (
    <div className="log-row flex items-start gap-2 py-0.5 font-mono text-[length:var(--text-terminal-size)] leading-[1.65] motion-safe:animate-[fadeIn_0.3s_ease-out]">
      <div className="log-status-icon flex w-5 shrink-0 justify-center self-start pt-[2px]">
        <TerminalLogStatusIcon status={status} />
      </div>
      <span className="log-timestamp w-[5.5rem] shrink-0 tabular-nums text-[length:var(--text-caption-size)] text-[color:var(--ui-terminal-meta)]">
        {entry.timestamp}
      </span>
      <span className={`log-message min-w-0 flex-1 whitespace-pre-wrap break-words ${textCls}`}>
        {sanitizeErrorForDisplay(entry.text)}
      </span>
    </div>
  )
}

function StatusBadge({
  status,
  labelOverride,
}: {
  status: AnalysisStatus
  labelOverride?: string
}) {
  const map: Record<AnalysisStatus, { label: string; cls: string }> = {
    idle: {
      label: '等待上传',
      cls: 'border-slate-300/80 bg-slate-100 text-slate-800 dark:border-transparent dark:bg-slate-600 dark:text-white',
    },
    uploading: {
      label: '上传中',
      cls: 'border-sky-300/80 bg-sky-100 text-sky-900 motion-safe:animate-pulse dark:border-transparent dark:bg-blue-600 dark:text-white',
    },
    parsing: {
      label: '解析中...',
      cls: 'border-sky-300/80 bg-sky-100 text-sky-900 motion-safe:animate-pulse dark:border-transparent dark:bg-blue-600 dark:text-white',
    },
    analyzing: {
      label: '分析中...',
      cls: 'border-violet-300/80 bg-violet-100 text-violet-900 motion-safe:animate-pulse dark:border-transparent dark:bg-blue-600 dark:text-white',
    },
    review: {
      label: '等待审阅',
      cls: 'border-amber-300/80 bg-amber-100 text-amber-950 dark:border-transparent dark:bg-amber-500 dark:text-white',
    },
    approved: {
      label: '已通过',
      cls: 'border-emerald-300/80 bg-emerald-100 text-emerald-950 dark:border-transparent dark:bg-emerald-600 dark:text-white',
    },
    error: {
      label: '分析失败',
      cls: 'border-red-300/80 bg-red-100 text-red-900 dark:border-transparent dark:bg-red-600 dark:text-white',
    },
  }
  const { label, cls } = map[status]
  return (
    <Badge variant="outline" className={`text-xs font-semibold ${cls}`}>
      {labelOverride ?? label}
    </Badge>
  )
}


class AiAnalysisErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err: Error) {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('AiAnalysisPage error boundary:', err, info)
  }

  render() {
    if (this.state.err) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center space-y-3">
          <p className="text-red-300 font-medium">页面出现异常</p>
          <p className="text-sm text-muted-foreground">{this.state.err.message}</p>
          <Button type="button" variant="outline" onClick={() => this.setState({ err: null })}>
            重试
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ──────────────────── 内页 ──────────────────────── */

function AiAnalysisPageInner() {
  const navigate = useNavigate()
  const setPendingGenerateHandoff = useGenerateStore((s) => s.setPendingGenerateHandoff)
  const [state, dispatch] = useReducer(pageReducer, initialPageState)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  /** 与 uploadedFile 同属一批多图分析时的其余图片（最多再 4 张，合计 ≤5） */
  const [additionalAnalysisFiles, setAdditionalAnalysisFiles] = useState<UploadedFile[]>([])
  const [analysisRecords, setAnalysisRecords] = useState<GenerationRecord[]>([])
  const [requirementDescription, setRequirementDescription] = useState('')
  const [requirementSupplement, setRequirementSupplement] = useState('')
  const [analysisPromptTemplate, setAnalysisPromptTemplate] = useState(loadStoredPromptTemplate)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingXmind, setExportingXmind] = useState(false)
  const [humanReview, setHumanReview] = useState(true)
  const [modelInfo, setModelInfo] = useState<AIModel | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>()
  const [fileHistory, setFileHistory] = useState<UploadedFile[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editedParsedText, setEditedParsedText] = useState('')
  const [parsePreviewDirty, setParsePreviewDirty] = useState(false)
  const [previewEditable, setPreviewEditable] = useState(false)
  const [confirmStopOpen, setConfirmStopOpen] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [historyTab, setHistoryTab] = useState<'records' | 'uploads'>('records')
  const [historyShowAll, setHistoryShowAll] = useState(false)
  const [historyFilter, setHistoryFilter] = useState('')
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [rightTab, setRightTab] = useState<'process' | 'report'>('process')
  const [largeEditorField, setLargeEditorField] = useState<null | 'desc' | 'supp'>(null)
  const [usageHintOpen, setUsageHintOpen] = useState(false)
  const [dropzoneActive, setDropzoneActive] = useState(false)
  const [parseElapsed, setParseElapsed] = useState(0)
  const [analysisElapsed, setAnalysisElapsed] = useState(0)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  /** 本机选择的 File.name，避免接口 originalName 编码异常导致列表乱码 */
  const [uploadDisplayName, setUploadDisplayName] = useState<string | null>(null)
  /** 本地上传图片缩略图（Object URL），顺序与 [uploadedFile, ...additionalAnalysisFiles] 一致 */
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const imagePreviewUrlsRef = useRef<string[]>([])
  const wasFileParsingRef = useRef(false)

  const replaceImagePreviews = useCallback((next: string[]) => {
    imagePreviewUrlsRef.current.forEach((u) => {
      try {
        URL.revokeObjectURL(u)
      } catch {
        /* ignore */
      }
    })
    imagePreviewUrlsRef.current = next
    setImagePreviewUrls(next)
  }, [])

  useEffect(() => {
    return () => {
      imagePreviewUrlsRef.current.forEach((u) => {
        try {
          URL.revokeObjectURL(u)
        } catch {
          /* ignore */
        }
      })
    }
  }, [])

  const logContainerRef = useRef<HTMLDivElement>(null)
  const reportMarkdownRef = useRef<HTMLDivElement>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const operationAbortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadStartedAtRef = useRef<number>(0)
  const parseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { uploadFile, progress: uploadProgressState, abort: abortUpload, reset: resetUploadProgress, validateFile } =
    useChunkedUpload()

  const makeLog = useCallback((text: string, statusOverride?: TerminalLogStatus): LogEntry => {
    return {
      id: safeRandomUUID(),
      text,
      timestamp: nowTime(),
      ...(statusOverride ? { statusOverride } : {}),
    }
  }, [])

  const addLog = useCallback(
    (text: string) => {
      dispatch({ type: 'ADD_LOG', log: makeLog(text) })
    },
    [makeLog],
  )

  useEffect(() => {
    aiApi
      .getModels()
      .then((models) => {
        const def = models.find((m) => m.isDefault) ?? models[0]
        if (def) {
          setModelInfo(def)
          setSelectedModelId(def.id)
        }
      })
      .catch(() => {})
  }, [])

  const loadFileHistory = useCallback(async () => {
    try {
      const res = await filesApi.getFileList({ page: 1, pageSize: 20 })
      setFileHistory(res.list)
    } catch {
      setFileHistory([])
    }
  }, [])

  useEffect(() => {
    void loadFileHistory()
  }, [loadFileHistory])

  const loadAnalysisRecords = useCallback(async () => {
    try {
      const res = await recordsApi.getRecords({
        page: 1,
        pageSize: 15,
        keyword: '需求分析',
        sortOrder: 'desc',
      })
      setAnalysisRecords(res.list)
    } catch {
      setAnalysisRecords([])
    }
  }, [])

  useEffect(() => {
    void loadAnalysisRecords()
  }, [loadAnalysisRecords])

  useEffect(() => {
    const onOff = () => {
      setOnline(false)
      toast.error('网络已断开', { icon: '⚠️' })
    }
    const onOn = () => {
      setOnline(true)
      toast.success('网络已恢复')
    }
    window.addEventListener('offline', onOff)
    window.addEventListener('online', onOn)
    return () => {
      window.removeEventListener('offline', onOff)
      window.removeEventListener('online', onOn)
    }
  }, [])

  useEffect(() => {
    if (state.status === 'parsing') {
      setParseElapsed(0)
      parseTimerRef.current = setInterval(() => setParseElapsed((n) => n + 1), 1000)
      return () => {
        if (parseTimerRef.current) clearInterval(parseTimerRef.current)
      }
    }
    if (parseTimerRef.current) {
      clearInterval(parseTimerRef.current)
      parseTimerRef.current = null
    }
    return undefined
  }, [state.status])

  useEffect(() => {
    if (state.status === 'analyzing') {
      setAnalysisElapsed(0)
      analysisTimerRef.current = setInterval(() => setAnalysisElapsed((n) => n + 1), 1000)
      return () => {
        if (analysisTimerRef.current) clearInterval(analysisTimerRef.current)
      }
    }
    if (analysisTimerRef.current) {
      clearInterval(analysisTimerRef.current)
      analysisTimerRef.current = null
    }
    return undefined
  }, [state.status])

  useEffect(() => {
    if (!autoScroll || !logContainerRef.current) return
    logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
  }, [state.logs, autoScroll])

  const prevStudioStatusRef = useRef<AnalysisStatus | null>(null)
  useEffect(() => {
    const prev = prevStudioStatusRef.current
    if (state.status === 'analyzing' && prev !== 'analyzing') setRightTab('process')
    if (
      (state.status === 'review' || state.status === 'approved') &&
      state.reportText.trim().length > 0 &&
      prev !== 'review' &&
      prev !== 'approved'
    ) {
      setRightTab('report')
    }
    prevStudioStatusRef.current = state.status
  }, [state.status, state.reportText])

  const handleLogScroll = useCallback(() => {
    const el = logContainerRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    if (dist > 50) setAutoScroll(false)
  }, [])

  const copyAnalysisReport = useCallback(async () => {
    const text = state.reportText.trim()
    if (!text) {
      toast.error('暂无分析报告可复制')
      return
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        toast.success('已复制分析报告')
        return
      }
    } catch {
      /* HTTP 或非安全上下文常失败，走 fallback */
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      ta.style.top = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) toast.success('已复制分析报告')
      else toast.error('复制失败，请在下方报告中选中后手动复制')
    } catch {
      toast.error('复制失败，请在下方报告中选中后手动复制')
    }
  }, [state.reportText])

  /** 新窗口打印：复用报告区 DOM，打印样式为白底便于纸质输出 */
  const handlePrintAnalysisReport = useCallback(() => {
    const text = state.reportText.trim()
    if (!text) {
      toast.error('暂无可打印内容')
      return
    }
    const inner = reportMarkdownRef.current?.innerHTML
    const title = uploadDisplayName ?? uploadedFile?.originalName ?? '需求分析报告'
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const safeTitle = esc(String(title))
    const w = window.open('', '_blank')
    if (!w) {
      toast.error('请允许弹出窗口以使用打印')
      return
    }
    const bodyInner =
      inner ??
      `<pre style="white-space:pre-wrap;font:13px/1.6 system-ui;padding:0;margin:0">${esc(text)}</pre>`
    w.document.write(
      `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${safeTitle}</title>` +
        `<style>body{margin:0;padding:24px;font:13px/1.6 system-ui,-apple-system,sans-serif;color:#0f172a;background:#fff;}` +
        `.ai-analysis-print-root table{border-collapse:collapse;width:100%;}` +
        `.ai-analysis-print-root th,.ai-analysis-print-root td{border:1px solid #334155;padding:8px;}` +
        `.ai-analysis-print-root thead th{background:#1e293b;color:#fff;}` +
        `@media print{body{padding:16px}}</style></head><body>` +
        `<div class="ai-analysis-print-root">${bodyInner}</div></body></html>`,
    )
    w.document.close()
    w.focus()
    requestAnimationFrame(() => {
      w.print()
      w.close()
    })
  }, [state.reportText, uploadDisplayName, uploadedFile?.originalName])

  const handleDeleteAnalysisRecord = useCallback(
    async (recordId: string, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const ok = await appConfirm({
        title: '删除该条分析记录？',
        description: '删除后无法恢复，相关文件历史可能仍可单独查看。',
        confirmText: '确认删除',
        confirmVariant: 'destructive',
      })
      if (!ok) return
      try {
        await recordsApi.deleteRecord(recordId)
        toast.success('已删除')
        await loadAnalysisRecords()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '删除失败')
      }
    },
    [loadAnalysisRecords],
  )

  useEffect(() => {
    try {
      localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, analysisPromptTemplate)
    } catch {
      /* ignore */
    }
  }, [analysisPromptTemplate])

  const resetAnalysisPromptTemplate = useCallback(() => {
    setAnalysisPromptTemplate(ANALYSIS_PROMPT)
    toast.success('已恢复默认分析指令模板')
  }, [])

  const handleExportAnalysisPdf = useCallback(async () => {
    const markdown = state.reportText.trim()
    if (!markdown) {
      toast.error('暂无可导出的分析报告')
      return
    }
    setExportingPdf(true)
    try {
      toast.loading('正在渲染流程图并生成 PDF…', { id: 'export-pdf' })
      const mermaidImagesBase64 = await renderMermaidChartsToPngBase64(markdown).catch(() => [] as string[])
      const name = buildAnalysisPdfFileName(uploadDisplayName ?? uploadedFile?.originalName)
      await saveAnalysisReportPdf(
        {
          markdown,
          documentTitle: uploadDisplayName ?? uploadedFile?.originalName ?? undefined,
          version: 'V1.0',
          mermaidImagesBase64:
            mermaidImagesBase64 && mermaidImagesBase64.length > 0 ? mermaidImagesBase64 : undefined,
        },
        name,
      )
      toast.success('PDF 已生成并开始下载', { id: 'export-pdf' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出 PDF 失败', { id: 'export-pdf' })
    } finally {
      setExportingPdf(false)
    }
  }, [state.reportText, uploadDisplayName, uploadedFile?.originalName])

  const handleExportXmind = useCallback(async () => {
    const markdown = state.reportText.trim()
    if (!markdown) {
      toast.error('暂无可导出的分析报告')
      return
    }
    setExportingXmind(true)
    try {
      toast.loading('正在生成 XMind…', { id: 'export-xmind' })
      const rootTitle = `${buildAnalysisExportBasename(uploadDisplayName ?? uploadedFile?.originalName)} — 需求分析`
      const blob = await buildAnalysisXmindBlob(markdown, rootTitle)
      const name = buildAnalysisXmindFileName(uploadDisplayName ?? uploadedFile?.originalName)
      saveAs(blob, name.endsWith('.xmind') ? name : `${name}.xmind`)
      toast.success('XMind 已生成并开始下载', { id: 'export-xmind' })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出 XMind 失败', { id: 'export-xmind' })
    } finally {
      setExportingXmind(false)
    }
  }, [state.reportText, uploadDisplayName, uploadedFile?.originalName])

  const handleSendToGenerate = useCallback(() => {
    const report = state.reportText.trim()
    if (!report) {
      toast.error('请先生成并通过分析报告后再跳转')
      return
    }
    const parts: string[] = []
    if (uploadedFile?.originalName) {
      parts.push(`来源文档：${normalizeUploadedFilename(uploadedFile.originalName)}`)
    }
    const combined = combineUserRequirementNotes(requirementDescription, requirementSupplement)
    if (combined) {
      parts.push(`【补充说明】\n${combined}`)
    }
    const edited = editedParsedText.trim()
    if (edited && parsePreviewDirty) {
      parts.push(`【解析原文（当前编辑）】\n${edited}`)
    } else if (uploadedFile?.parsedContent?.trim()) {
      const pc = uploadedFile.parsedContent
      const cap = 12000
      parts.push(
        `【解析原文摘录】\n${pc.length > cap ? `${pc.slice(0, cap)}\n…（共 ${pc.length} 字，已截断）` : pc}`,
      )
    }
    const ctx = parts.filter(Boolean).join('\n\n')
    const filledPrompt = `请根据以下材料生成完整、可执行的测试用例（遵守平台模板与输出格式要求）。\n\n${ctx ? `${ctx}\n\n` : ''}【AI 需求分析报告】\n${report}`
    setPendingGenerateHandoff({
      filledPrompt,
      templateId: null,
      parseRecordId: null,
      fileIds: uploadedFile?.id ? [uploadedFile.id] : [],
      rawText: report,
      handoffSource: 'ai-analysis',
    })
    navigate('/generate')
  }, [
    editedParsedText,
    navigate,
    parsePreviewDirty,
    requirementDescription,
    requirementSupplement,
    setPendingGenerateHandoff,
    state.reportText,
    uploadedFile,
  ])

  /** 多图并行轮询时同步更新主文件或附加列表中的同一条记录 */
  const updateFileInPlace = useCallback((f: UploadedFile) => {
    const next = maybeShrinkParseErrorField(f)
    setUploadedFile((prev) => (prev?.id === next.id ? next : prev))
    setAdditionalAnalysisFiles((prev) => prev.map((p) => (p.id === next.id ? next : p)))
  }, [])

  const pollUntilParsed = useCallback(
    async (
      fileId: string,
      signal: AbortSignal,
      onTick?: (f: UploadedFile) => void,
    ): Promise<UploadedFile> => {
      let lastStage: string | undefined
      let transientErrors = 0
      for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await sleep(POLL_INTERVAL_MS)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        let f: UploadedFile
        try {
          f = await filesApi.getFileById(fileId)
          if (transientErrors > 0) {
            addLog('✅ 解析状态连接已恢复，继续等待服务端结果')
            transientErrors = 0
          }
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e
          if (isTransientPollError(e) && transientErrors < POLL_MAX_TRANSIENT_ERRORS) {
            transientErrors++
            if (transientErrors === 1 || transientErrors % 10 === 0) {
              addLog(
                `⚠️ 解析状态接口暂时不可用（${pollErrorLabel(e)}），正在自动重试 ${transientErrors}/${POLL_MAX_TRANSIENT_ERRORS}`,
              )
            }
            continue
          }
          throw e
        }
        const fTick = maybeShrinkParseErrorField(f)
        onTick?.(fTick)
        const stage = fTick.parseStage ?? undefined
        if (stage !== lastStage) {
          lastStage = stage
          const mapped = mapParseStageMessage(stage)
          if (stage === 'FAILED') {
            addLog(`${mapped.text}: ${sanitizeErrorForDisplay(fTick.parseError ?? '未知错误')}`)
          } else if (stage !== 'DONE') {
            addLog(mapped.text)
          }
        }
        if (fTick.status === 'PARSED') {
          const n = fTick.parsedContent?.length ?? 0
          addLog(`✅ 解析完成 (${n.toLocaleString()} 字符)`)
          return fTick
        }
        if (fTick.status === 'FAILED') {
          return fTick
        }
      }
      return maybeShrinkParseErrorField(await filesApi.getFileById(fileId))
    },
    [addLog],
  )

  useEffect(() => {
    if (uploadedFile?.status === 'PARSING') wasFileParsingRef.current = true
    if (uploadedFile?.status === 'FAILED') wasFileParsingRef.current = false
    if (
      uploadedFile?.status === 'PARSED' &&
      wasFileParsingRef.current &&
      additionalAnalysisFiles.every((f) => f.status === 'PARSED')
    ) {
      wasFileParsingRef.current = false
      toast.success(
        additionalAnalysisFiles.length > 0
          ? `全部 ${1 + additionalAnalysisFiles.length} 张图片解析完成`
          : '需求解析完成，可展开查看解析文本',
        { id: 'parse-done-toast', duration: 4000 },
      )
    }
  }, [uploadedFile?.status, uploadedFile?.id, additionalAnalysisFiles])

  const retryParseFlow = useCallback(
    async (fileId: string, signal: AbortSignal, textOnly?: boolean) => {
      const r = await filesApi.retryParse(fileId, textOnly ? { textOnly: true } : undefined)
      setUploadedFile(maybeShrinkParseErrorField(r))
      dispatch({ type: 'UPLOAD_DONE' })
      addLog(textOnly ? '📄 已提交「仅内置文本」重新解析…' : '📄 已提交重新解析…')
      const parsed = await pollUntilParsed(fileId, signal, (ff) => setUploadedFile(maybeShrinkParseErrorField(ff)))
      setUploadedFile(maybeShrinkParseErrorField(parsed))
      if (parsed.status === 'PARSED') {
        setEditedParsedText(parsed.parsedContent ?? '')
        dispatch({ type: 'GO_IDLE' })
        void loadFileHistory()
      } else {
        dispatch({
          type: 'ERROR',
          log: makeLog(`❌ ${sanitizeErrorForDisplay(parsed.parseError ?? '解析失败')}`, 'error'),
        })
      }
    },
    [addLog, dispatch, loadFileHistory, makeLog, pollUntilParsed],
  )

  useEffect(() => {
    if (!uploadedFile?.id || uploadedFile.status !== 'PARSING') return
    const id = uploadedFile.id
    const ac = new AbortController()
    subscribeFileParseEvents(
      id,
      (p) => {
        setUploadedFile((prev) =>
          prev?.id === id
            ? {
                ...prev,
                status: p.status as UploadedFile['status'],
                parseStage: p.parseStage,
                parseError:
                  p.parseError != null && p.parseError.length > 400
                    ? sanitizeErrorForDisplay(p.parseError)
                    : p.parseError,
                parseProgress: p.parseProgress as UploadedFile['parseProgress'],
              }
            : prev,
        )
      },
      { signal: ac.signal },
    )
    return () => ac.abort()
  }, [uploadedFile?.id, uploadedFile?.status])

  const applyAnalysisRecord = useCallback(async (id: string) => {
    try {
      const r = await recordsApi.getRecordById(id)
      const text = r.demandContent?.trim() ?? ''
      if (!text) {
        toast.error('该记录无可展示内容')
        return
      }
      dispatch({ type: 'LOAD_SAVED_REPORT', text })
      toast.success('已载入分析结果')
    } catch {
      toast.error('加载记录失败')
    }
  }, [])

  const handleBatchImageUpload = useCallback(
    async (files: File[]) => {
      const arr = Array.from(files).slice(0, 5)
      if (arr.length < 2) return
      if (!arr.every(isImageBatchFile)) {
        toast.error('一次选择多张时仅支持图片（png/jpg/jpeg/webp/gif），最多 5 张')
        return
      }

      operationAbortRef.current?.abort()
      operationAbortRef.current = new AbortController()
      const signal = operationAbortRef.current.signal

      dispatch({ type: 'START_UPLOAD' })
      resetUploadProgress()
      uploadStartedAtRef.current = Date.now()
      setUploadDisplayName(null)
      setAdditionalAnalysisFiles([])
      setUploadedFile(null)
      setEditedParsedText('')
      setParsePreviewDirty(false)
      replaceImagePreviews(arr.map((f) => URL.createObjectURL(f)))

      addLog(`📤 批量上传 ${arr.length} 张图片…`)

      try {
        const uploadedRows: UploadedFile[] = []
        for (let i = 0; i < arr.length; i++) {
          const file = arr[i]
          addLog(`📤 图片 ${i + 1}/${arr.length}：${file.name}`)
          const cur = await uploadFile(file)
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          stashUploadedOriginalName(cur.id, file.name)
          uploadedRows.push(cur)
        }

        if (signal.aborted) return

        const first = uploadedRows[0]
        if (first) {
          setUploadedFile(maybeShrinkParseErrorField(first))
          setAdditionalAnalysisFiles(uploadedRows.slice(1).map((u) => maybeShrinkParseErrorField(u)))
        }

        const needParse = uploadedRows.filter((u) => u.status !== 'PARSED')
        if (needParse.length > 0) {
          dispatch({ type: 'UPLOAD_DONE' })
          addLog(`📄 并行解析 ${needParse.length} 张图片（后台支持多路并发队列）…`)
        }

        const results: UploadedFile[] = await Promise.all(
          uploadedRows.map(async (cur) => {
            if (cur.status === 'PARSED') return cur
            return pollUntilParsed(cur.id, signal, updateFileInPlace)
          }),
        )

        if (signal.aborted) return

        const firstR = results[0]
        if (firstR) {
          setUploadedFile(maybeShrinkParseErrorField(firstR))
          setAdditionalAnalysisFiles(results.slice(1).map((u) => maybeShrinkParseErrorField(u)))
        }

        const joined = results
          .map((r) => r.parsedContent ?? '')
          .filter(Boolean)
          .join('\n\n---\n\n')
        setEditedParsedText(joined)
        setParsePreviewDirty(false)

        if (results.every((r) => r.status === 'PARSED')) {
          addLog(`✅ ${results.length} 张图片已就绪，可开始分析`)
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
        } else {
          const failed = results.find((r) => r.status === 'FAILED')
          dispatch({
            type: 'ERROR',
            log: makeLog(`❌ 图片解析失败：${sanitizeErrorForDisplay(failed?.parseError ?? '未知错误')}`, 'error'),
          })
          toast.error('部分图片解析失败')
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          addLog('⏹ 已取消上传/解析')
          dispatch({ type: 'STOP_TO_IDLE' })
          replaceImagePreviews([])
          setUploadedFile(null)
          setAdditionalAnalysisFiles([])
          setUploadDisplayName(null)
          return
        }
        dispatch({ type: 'ERROR', log: makeLog(`❌ ${(e as Error).message || '上传失败'}`, 'error') })
        toast.error('批量上传失败')
      } finally {
        operationAbortRef.current = null
      }
    },
    [
      addLog,
      dispatch,
      loadFileHistory,
      makeLog,
      pollUntilParsed,
      replaceImagePreviews,
      resetUploadProgress,
      updateFileInPlace,
      uploadFile,
    ],
  )

  const handleFileSelect = useCallback(
    async (file: File) => {
      const v = validateFile(file)
      if (v) {
        toast.error(v)
        return
      }

      operationAbortRef.current?.abort()
      operationAbortRef.current = new AbortController()
      const signal = operationAbortRef.current.signal

      dispatch({ type: 'START_UPLOAD' })
      resetUploadProgress()
      uploadStartedAtRef.current = Date.now()
      setUploadDisplayName(file.name)
      setAdditionalAnalysisFiles([])
      if (isImageBatchFile(file)) {
        replaceImagePreviews([URL.createObjectURL(file)])
      } else {
        replaceImagePreviews([])
      }

      addLog(`📤 正在上传：${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)

      try {
        const result = await uploadFile(file)
        if (signal.aborted) return

        stashUploadedOriginalName(result.id, file.name)
        setUploadedFile(maybeShrinkParseErrorField(result))
        setParsePreviewDirty(false)
        setEditedParsedText(result.parsedContent ?? '')
        addLog(`✅ 文件上传成功，服务端文件 ID：${result.id}`)

        if (result.status === 'PARSED') {
          const n = result.parsedContent?.length ?? 0
          addLog(`✅ 需求解析完成 (${n.toLocaleString()} 字符)`)
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
          return
        }

        dispatch({ type: 'UPLOAD_DONE' })
        addLog(
          '📄 正在等待服务端解析文档（服务端会按文档自动选择：内置文本层 / 混元多模态直读 / OCR 等）...',
        )

        const parsed = await pollUntilParsed(result.id, signal, (ff) => setUploadedFile(maybeShrinkParseErrorField(ff)))
        if (signal.aborted) return

        setUploadedFile(maybeShrinkParseErrorField(parsed))

        if (parsed.status === 'PARSED') {
          setEditedParsedText(parsed.parsedContent ?? '')
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
        } else {
          dispatch({
            type: 'ERROR',
            log: makeLog(`❌ 需求解析失败：${sanitizeErrorForDisplay(parsed.parseError ?? '未知错误')}`, 'error'),
          })
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          addLog('⏹ 已取消上传/解析')
          dispatch({ type: 'STOP_TO_IDLE' })
          replaceImagePreviews([])
          setUploadedFile(null)
          setAdditionalAnalysisFiles([])
          setUploadDisplayName(null)
          return
        }
        setUploadDisplayName(null)
        dispatch({ type: 'ERROR', log: makeLog(`❌ ${(e as Error).message || '上传失败'}`, 'error') })
        toast.error('文件上传失败')
      } finally {
        operationAbortRef.current = null
      }
    },
    [
      validateFile,
      uploadFile,
      resetUploadProgress,
      addLog,
      pollUntilParsed,
      loadFileHistory,
      makeLog,
      replaceImagePreviews,
    ],
  )

  const uploadElapsedSec =
    state.status === 'uploading' && uploadStartedAtRef.current
      ? Math.max(0, (Date.now() - uploadStartedAtRef.current) / 1000)
      : 0
  const uploadSpeedMbps =
    state.status === 'uploading' && uploadElapsedSec > 0.3
      ? (uploadProgressState.loaded / 1024 / 1024 / uploadElapsedSec).toFixed(2)
      : null

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const { files } = e.dataTransfer
      if (!files?.length) return
      if (files.length > 1) {
        void handleBatchImageUpload(Array.from(files))
      } else if (files[0]) {
        void handleFileSelect(files[0])
      }
    },
    [handleFileSelect, handleBatchImageUpload],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list?.length) return
      if (list.length > 1) {
        void handleBatchImageUpload(Array.from(list))
      } else if (list[0]) {
        void handleFileSelect(list[0])
      }
      e.target.value = ''
    },
    [handleFileSelect, handleBatchImageUpload],
  )

  const handleRemoveFile = useCallback(() => {
    operationAbortRef.current?.abort()
    abortUpload()
    replaceImagePreviews([])
    setUploadedFile(null)
    setAdditionalAnalysisFiles([])
    setUploadDisplayName(null)
    setEditedParsedText('')
    setParsePreviewDirty(false)
    dispatch({ type: 'RESET' })
  }, [abortUpload, replaceImagePreviews])

  const selectHistoryFile = useCallback((f: UploadedFile) => {
    setUploadDisplayName(null)
    replaceImagePreviews([])
    setAdditionalAnalysisFiles([])
    setUploadedFile(maybeShrinkParseErrorField(f))
    setEditedParsedText(f.parsedContent ?? '')
    setParsePreviewDirty(false)
    setPreviewEditable(false)
    dispatch({ type: 'GO_IDLE' })
    if (f.status === 'PARSED') {
      toast.success(`已选择：${normalizeUploadedFilename(f.originalName)}`)
    } else {
      toast('该文件尚未解析完成', { icon: 'ℹ️' })
    }
  }, [replaceImagePreviews])

  const deleteHistoryFile = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await filesApi.deleteFile(id)
        setFileHistory((prev) => prev.filter((x) => x.id !== id))
        if (uploadedFile?.id === id) {
          setUploadedFile(null)
          setUploadDisplayName(null)
          setEditedParsedText('')
          dispatch({ type: 'RESET' })
        }
        toast.success('已删除')
      } catch {
        toast.error('删除失败')
      }
    },
    [uploadedFile?.id],
  )

  const buildCustomPrompt = useCallback(() => {
    const combined = combineUserRequirementNotes(requirementDescription, requirementSupplement)
    const base = combined
      ? `${analysisPromptTemplate}\n\n用户补充说明：\n${combined}`
      : analysisPromptTemplate
    return base
  }, [analysisPromptTemplate, requirementDescription, requirementSupplement])

  const runAnalyzeStream = useCallback(
    async (customPrompt: string, isRevision: boolean) => {
      if (!uploadedFile && !parsePreviewDirty) {
        toast.error('请先上传文档')
        return
      }

      streamAbortRef.current?.abort()
      const controller = new AbortController()
      streamAbortRef.current = controller

      dispatch({ type: isRevision ? 'REVIEW' : 'START_ANALYSIS' })
      if (!isRevision) {
        addLog('🚀 开始需求分析...')
        addLog('🤖 正在调用 AI 模型（需求分析通道）...')
      } else {
        addLog('🔄 正在根据修改意见重新分析...')
      }

      const multiFile = additionalAnalysisFiles.length > 0
      const useText =
        !multiFile &&
        parsePreviewDirty &&
        editedParsedText.trim().length > 0 &&
        uploadedFile?.status === 'PARSED'

      const payload =
        useText && editedParsedText.trim()
          ? {
              sourceType: 'text' as const,
              text: editedParsedText.trim(),
              customPrompt,
              stream: true as const,
              modelConfigId: selectedModelId,
            }
          : uploadedFile
            ? {
                sourceType: 'file' as const,
                fileId: uploadedFile.id,
                ...(additionalAnalysisFiles.length > 0
                  ? { additionalFileIds: additionalAnalysisFiles.map((f) => f.id) }
                  : {}),
                customPrompt,
                stream: true as const,
                modelConfigId: selectedModelId,
              }
            : null

      if (!payload) {
        toast.error('缺少分析内容')
        return
      }

      try {
        await new Promise<void>((resolve, reject) => {
          aiApi.analyzeStream(
            payload,
            (chunk: string) => {
              dispatch({ type: 'APPEND_REPORT', chunk })
            },
            () => {
              void loadAnalysisRecords()
              if (humanReview) {
                addLog(
                  '✅ AI 需求分析完成。您可审阅报告或输入修改意见（Ctrl+Enter 提交修订）。',
                )
                dispatch({ type: 'SET_REPORT' })
              } else {
                addLog('✅ AI 需求分析完成（已跳过人工审阅，自动通过）。')
                dispatch({ type: 'APPROVE' })
                toast.success('需求分析已完成并已通过')
              }
              resolve()
            },
            (err: Error) => {
              dispatch({ type: 'ERROR', log: makeLog(`❌ 分析失败：${err.message}`, 'error') })
              reject(err)
            },
            controller.signal,
          )
        })
      } catch {
        /* onError 已处理 */
      } finally {
        streamAbortRef.current = null
      }
    },
    [
      uploadedFile,
      additionalAnalysisFiles,
      parsePreviewDirty,
      editedParsedText,
      humanReview,
      addLog,
      selectedModelId,
      makeLog,
      loadAnalysisRecords,
    ],
  )

  const handleStartAnalysis = useCallback(async () => {
    if (!uploadedFile || uploadedFile.status !== 'PARSED') {
      toast.error('请先上传并等待解析完成')
      return
    }
    if (additionalAnalysisFiles.some((f) => f.status !== 'PARSED')) {
      toast.error('请等待全部图片解析完成')
      return
    }
    if (!analysisPromptTemplate.trim()) {
      toast.error('分析指令模板不能为空')
      return
    }
    await runAnalyzeStream(buildCustomPrompt(), false)
  }, [
    uploadedFile,
    additionalAnalysisFiles,
    analysisPromptTemplate,
    buildCustomPrompt,
    runAnalyzeStream,
  ])

  const handleSubmitRevision = useCallback(async () => {
    if (!state.reviewText.trim()) {
      toast.error('请输入修改意见')
      return
    }
    if (!uploadedFile) return

    const revisionPrompt = `${analysisPromptTemplate}

以下是上一轮分析结果：
---
${state.reportText}
---

用户修改意见：${state.reviewText}

请根据修改意见重新分析并改进报告。`

    const extraNotes = combineUserRequirementNotes(requirementDescription, requirementSupplement)
    const extra = extraNotes ? `\n\n用户补充说明：\n${extraNotes}` : ''
    await runAnalyzeStream(revisionPrompt + extra, true)
  }, [
    analysisPromptTemplate,
    state.reviewText,
    state.reportText,
    uploadedFile,
    requirementDescription,
    requirementSupplement,
    runAnalyzeStream,
  ])

  const executeStop = useCallback(async () => {
    setConfirmStopOpen(false)
    operationAbortRef.current?.abort()
    abortUpload()
    streamAbortRef.current?.abort()

    const parsingChain = [uploadedFile, ...additionalAnalysisFiles].filter(
      (f): f is UploadedFile =>
        !!f && (f.status === 'PENDING' || f.status === 'PARSING'),
    )
    if (parsingChain.length > 0) {
      for (const f of parsingChain) {
        try {
          await filesApi.cancelTask(f.id)
        } catch {
          /* 可能已结束 */
        }
      }
      setUploadedFile(null)
      setAdditionalAnalysisFiles([])
      setUploadDisplayName(null)
      addLog('⏹ 已请求取消解析任务')
      dispatch({ type: 'STOP_TO_IDLE' })
      toast('已停止', { icon: '⏹' })
      void loadFileHistory()
      return
    }

    if (state.status === 'analyzing') {
      addLog('⏹ 已停止分析')
      dispatch({ type: 'STOP_TO_IDLE' })
      toast('已停止分析', { icon: '⏹' })
      return
    }

    dispatch({ type: 'STOP_TO_IDLE' })
    toast('已停止', { icon: '⏹' })
  }, [abortUpload, uploadedFile, additionalAnalysisFiles, addLog, state.status, loadFileHistory])

  const handleApprove = useCallback(() => {
    dispatch({ type: 'APPROVE' })
    toast.success('需求分析已通过')
  }, [])

  const handleReviewKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void handleSubmitRevision()
      }
    },
    [handleSubmitRevision],
  )

  const allSourcesParsed =
    uploadedFile?.status === 'PARSED' &&
    additionalAnalysisFiles.every((f) => f.status === 'PARSED')
  const canStartAnalysis = Boolean(uploadedFile && allSourcesParsed)
  const isIdle = state.status === 'idle' || state.status === 'error'
  const showStartButton = isIdle && canStartAnalysis
  const showReviewArea = humanReview && (state.status === 'review' || state.status === 'approved')
  const showApprovedOnly = !humanReview && state.status === 'approved'
  const isAnalyzingStream = state.status === 'analyzing'
  const isUploadingOrParsing = state.status === 'uploading' || state.status === 'parsing'
  const busy =
    state.status === 'uploading' || state.status === 'parsing' || state.status === 'analyzing'

  const matchedPresetId = findPresetIdForBody(analysisPromptTemplate)
  const isCustomTemplate = matchedPresetId === null
  const activePreset = matchedPresetId
    ? ANALYSIS_PROMPT_PRESETS.find((p) => p.id === matchedPresetId)
    : null

  const filteredPresets = useMemo(() => {
    const q = templateSearch.trim().toLowerCase()
    if (!q) return ANALYSIS_PROMPT_PRESETS
    return ANALYSIS_PROMPT_PRESETS.filter((p) =>
      `${p.name}${p.scenario}${p.shortDesc}${p.outputStyle}`.toLowerCase().includes(q),
    )
  }, [templateSearch])

  const recentPresetList = useMemo(() => {
    return readRecentPresetIds()
      .map((id) => ANALYSIS_PROMPT_PRESETS.find((p) => p.id === id))
      .filter((p): p is AnalysisPromptPreset => !!p)
  }, [templatePickerOpen, analysisPromptTemplate])

  const terminalBadgeLabel =
    state.status === 'idle' && canStartAnalysis ? '就绪' : undefined

  const prepStripSummary = (() => {
    const bits: string[] = []
    if (uploadedFile) {
      const n = 1 + additionalAnalysisFiles.length
      bits.push(n > 1 ? `已上传 ${n} 个文件` : '已上传 1 个文件')
    } else bits.push('尚未选择文件')
    bits.push(activePreset?.name ?? '自定义分析指令')
    if (canStartAnalysis && isIdle) bits.push('可开始分析')
    return bits.join(' · ')
  })()

  const reportTabEnabled =
    state.reportText.trim().length > 0 || state.status === 'review' || state.status === 'approved'

  return (
    <div
      className="ai-analysis-studio motion-safe:animate-[arsStudioIn_0.55s_ease-out_both] -mx-5 -mb-6 -mt-6 flex min-h-0 w-auto max-w-none flex-col overflow-hidden rounded-2xl border border-[color:var(--ai-ar-shell-border)] bg-[color:var(--ai-ar-shell-bg)] shadow-[var(--ai-ar-shell-shadow)] backdrop-blur-md sm:-mx-7 sm:-mb-7 sm:-mt-7 lg:-mx-8 lg:-mb-8 lg:-mt-8 max-lg:max-h-none max-lg:min-h-[min(100dvh,920px)] lg:h-[calc(100dvh-7.25rem)] lg:max-h-[calc(100dvh-7.25rem)]"
      data-page="ai-analysis"
    >
      <ConfirmDialog
        open={confirmStopOpen}
        title="确认停止？"
        description="将取消当前正在进行的上传、解析或 AI 分析。解析中的任务会通知服务端取消。"
        confirmText="停止任务"
        confirmVariant="destructive"
        contentClassName="border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-modal-card-bg)] shadow-2xl dark:border-white/10"
        onCancel={() => setConfirmStopOpen(false)}
        onConfirm={() => void executeStop()}
      />

      {!online && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-400/40 bg-amber-100/90 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          当前离线，请检查网络连接
        </div>
      )}

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[color:var(--ai-ar-terminal-header-border)] bg-[color:var(--ai-ar-terminal-header-bg)] px-4 py-2.5 backdrop-blur-md sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/30 via-violet-500/25 to-emerald-400/25 ring-1 ring-white/40 dark:from-cyan-500/20 dark:via-violet-500/15 dark:to-emerald-500/15 dark:ring-white/10">
            <Sparkles className="h-4 w-4 text-cyan-700 dark:text-cyan-200" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-workspace-text-primary sm:text-xl">
              AI 需求分析
            </h1>
            <p className="truncate text-[11px] text-workspace-text-secondary sm:text-xs">
              上传需求文档，AI 自动解析并生成结构化分析报告
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {modelInfo && (
            <Badge
              variant="outline"
              className="border-violet-400/40 bg-violet-500/10 text-[11px] text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100"
            >
              {modelInfo.name}
            </Badge>
          )}
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-full border border-workspace-panel-border/60 bg-workspace-panel-muted/60 px-2.5 text-[11px] font-medium text-workspace-text-secondary transition-[opacity,transform] hover:bg-workspace-panel-muted dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
            onClick={() => setUsageHintOpen((v) => !v)}
            aria-expanded={usageHintOpen}
          >
            <Info className="h-3.5 w-3.5" />
            提示
          </button>
        </div>
      </header>

      {usageHintOpen && (
        <div className="shrink-0 border-b border-workspace-panel-border/50 bg-sky-50/95 px-4 py-2 text-[11px] leading-relaxed text-sky-950 dark:border-sky-500/20 dark:bg-sky-950/35 dark:text-sky-100 sm:px-5">
          关闭「人工审阅」时，分析结束后将自动标记为通过。编辑「解析文本」后，将优先使用编辑后的文本作为分析输入。
        </div>
      )}

      {/* 主区：左右列各自 min-h-0 + 内部滚动，整体不撑高视口 */}
      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden max-lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,42%)_minmax(0,58%)] lg:grid-rows-1">
        {/* 左栏：仅中间区域滚动；底部「人工审阅开关 + 开始/停止」固定可见 */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-[color:var(--ai-ar-divider)] bg-[color:var(--ai-ar-panel-bg)]/90 backdrop-blur-md lg:border-b-0 lg:border-r">
          <div className="ai-analysis-panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <div className="space-y-4 motion-safe:animate-[arsStudioIn_0.45s_ease-out_both]">
          <section className="rounded-xl border border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-card-bg)] p-3 shadow-[0_12px_40px_-28px_rgba(59,130,246,0.12)] dark:shadow-[0_16px_48px_-32px_rgba(0,0,0,0.45)]">
            <h2 className="mb-2 text-sm font-semibold text-workspace-text-primary">需求文档</h2>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.md,.yaml,.yml,.png,.jpg,.jpeg,.webp,.gif"
              onChange={handleInputChange}
            />

            {!uploadedFile ? (
              <div
                onDragEnter={(e) => {
                  e.preventDefault()
                  setDropzoneActive(true)
                }}
                onDragLeave={() => setDropzoneActive(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  setDropzoneActive(false)
                  handleDrop(e)
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-[opacity,transform,box-shadow] duration-300 motion-reduce:transition-none ${
                  dropzoneActive
                    ? 'border-cyan-500/70 bg-cyan-500/10 shadow-[0_0_0_6px_rgba(34,211,238,0.12)] motion-safe:animate-pulse dark:border-cyan-400/60 dark:bg-cyan-500/10'
                    : 'border-[color:var(--ai-ar-input-border)] bg-[color:var(--ai-ar-input-bg)]/80 hover:border-cyan-500/40 hover:bg-[color:var(--ai-ar-card-hover-bg)] dark:bg-slate-900/40'
                }`}
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">拖拽文件到此处，或点击选择</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  PDF / Word / Excel / TXT / MD / YAML / 图片 · 单文件 ≤ 100MB · 大于 5MB 自动分片 ·
                  可多选最多 5 张图片一次性分析
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-lg border border-[color:var(--ai-ar-upload-success-border)] bg-[color:var(--ai-ar-upload-success-bg)] p-3">
                {imagePreviewUrls.length > 0 && uploadedFile.fileType === 'IMAGE' ? (
                  <div className="flex max-w-[3.75rem] flex-shrink-0 flex-wrap content-start gap-1">
                    {imagePreviewUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="h-11 w-11 rounded border border-[color:var(--ai-ar-upload-thumb-border)] object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <FileText
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-[color:var(--ai-ar-upload-success-sub)]"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  {additionalAnalysisFiles.length === 0 ? (
                    <>
                      <p
                        className="truncate text-sm text-[color:var(--ai-ar-upload-success-text)]"
                        title={
                          uploadDisplayName ?? normalizeUploadedFilename(uploadedFile.originalName)
                        }
                      >
                        {uploadDisplayName ??
                          normalizeUploadedFilename(uploadedFile.originalName)}
                      </p>
                      <p className="text-xs text-[color:var(--ai-ar-upload-success-sub)]">
                        {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB ·{' '}
                        {uploadedFile.status === 'PARSED'
                          ? '解析完成'
                          : uploadedFile.status === 'PARSING'
                            ? `解析中 ${uploadedFile.parseStage ?? ''}`
                            : uploadedFile.status}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-[color:var(--ai-ar-upload-success-text)]">
                        多图分析 · 共 {1 + additionalAnalysisFiles.length} 张
                      </p>
                      <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-[color:var(--ai-ar-upload-success-text)]">
                        {[uploadedFile, ...additionalAnalysisFiles].map((f, idx) => (
                          <li key={f.id} className="flex min-w-0 items-center gap-2">
                            {imagePreviewUrls[idx] ? (
                              <img
                                src={imagePreviewUrls[idx]}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded border border-[color:var(--ai-ar-upload-thumb-border)] object-cover"
                              />
                            ) : null}
                            <span className="min-w-0 truncate" title={displayUploadedFilename(f.id, f.originalName)}>
                              · {displayUploadedFilename(f.id, f.originalName)}{' '}
                              <span className="text-[color:var(--ai-ar-upload-success-sub)]">
                                {f.status === 'PARSED' ? '✓' : f.status === 'PARSING' ? '解析中' : f.status}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-1 text-[color:var(--ai-ar-upload-remove)] transition-colors hover:text-[color:var(--ai-ar-upload-remove-hover)]"
                  aria-label="移除文件"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {state.status === 'uploading' && (
              <div className="space-y-1">
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgressState.percent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground flex justify-between gap-2">
                  <span>
                    {uploadProgressState.chunkTotal
                      ? `分片 ${uploadProgressState.chunkCurrent ?? 0}/${uploadProgressState.chunkTotal} · `
                      : ''}
                    {uploadProgressState.percent}% ·{' '}
                    {(uploadProgressState.loaded / 1024 / 1024).toFixed(2)} /{' '}
                    {(uploadProgressState.total / 1024 / 1024).toFixed(2)} MB
                  </span>
                  {uploadSpeedMbps ? <span>{uploadSpeedMbps} MB/s</span> : null}
                </p>
              </div>
            )}

            {state.status === 'parsing' && (
              <div className="flex flex-col gap-1 text-xs text-amber-400">
                <div className="flex items-center gap-2">
                  <TerminalLogStatusIcon status="running" />
                  正在解析… 已等待 {parseElapsed}s
                </div>
                {uploadedFile &&
                  uploadedFile.size > 5 * 1024 * 1024 &&
                  uploadedFile.parseProgress?.etaMinutes != null && (
                    <p className="text-[11px] text-muted-foreground">
                      大文件解析中，预计仍需约 {uploadedFile.parseProgress.etaMinutes} 分钟（仅供参考）
                    </p>
                  )}
                {uploadedFile?.parseProgress?.pageTotal != null &&
                  uploadedFile?.parseProgress?.pageCurrent != null &&
                  (uploadedFile.parseProgress.phase === 'TEXT_LAYER' ||
                    uploadedFile.parseProgress.phase === 'OCR') && (
                    <p className="text-[11px] text-muted-foreground">
                      {uploadedFile.parseProgress.phase === 'TEXT_LAYER'
                        ? '提取内置文本'
                        : 'OCR 识别'}
                      ：第 {uploadedFile.parseProgress.pageCurrent} / {uploadedFile.parseProgress.pageTotal} 页
                    </p>
                  )}
                {uploadedFile?.fileType === 'PDF' &&
                  uploadedFile.parseProgress?.phase === 'OCR' &&
                  typeof uploadedFile.parseProgress.message === 'string' &&
                  uploadedFile.parseProgress.message.includes('正在识别') && (
                    <p className="text-[11px] text-amber-100/90">{uploadedFile.parseProgress.message}</p>
                  )}
                {(() => {
                  const batch = uploadedFile
                    ? [uploadedFile, ...additionalAnalysisFiles]
                    : []
                  const imgs = batch.filter((f) => f.fileType === 'IMAGE')
                  if (
                    state.status !== 'parsing' ||
                    imgs.length === 0 ||
                    imgs.every((f) => f.status !== 'PARSING')
                  ) {
                    return null
                  }
                  const done = imgs.filter((f) => f.status === 'PARSED').length
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      图片识别进度：{done} / {imgs.length} 张已完成
                    </p>
                  )
                })()}
                {(() => {
                  const batch = uploadedFile
                    ? [uploadedFile, ...additionalAnalysisFiles]
                    : []
                  const focus = batch.find(
                    (f) => f.status === 'PARSING' && f.fileType === 'IMAGE',
                  )
                  const pp = focus?.parseProgress
                  if (
                    !pp ||
                    pp.phase !== 'OCR' ||
                    pp.ocrStripTotal == null ||
                    pp.ocrStripCurrent == null
                  ) {
                    return null
                  }
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      当前图 OCR 分条：第 {pp.ocrStripCurrent} / {pp.ocrStripTotal} 条
                      {pp.message ? `（${pp.message}）` : ''}
                    </p>
                  )
                })()}
                {uploadedFile?.fileType === 'IMAGE' &&
                  uploadedFile.status === 'PARSING' &&
                  uploadedFile.parseProgress?.phase === 'OCR' &&
                  uploadedFile.parseProgress?.ocrStripTotal == null &&
                  uploadedFile.parseProgress?.message && (
                    <p className="text-[11px] text-muted-foreground">
                      {uploadedFile.parseProgress.message}
                    </p>
                  )}
                {(() => {
                  const batch = uploadedFile
                    ? [uploadedFile, ...additionalAnalysisFiles]
                    : []
                  const hint = batch.find((f) => f.parseProgress?.errorHint)?.parseProgress?.errorHint
                  if (!hint || state.status !== 'parsing') return null
                  return (
                    <p className="text-[11px] text-amber-200/85">
                      提示：{sanitizeErrorForDisplay(hint, 800)}
                    </p>
                  )
                })()}
              </div>
            )}
          </div>

          {uploadedFile?.status === 'FAILED' && (
            <div className="rounded-xl border border-[color:var(--ui-text-danger)]/25 bg-[color:var(--ui-text-danger)]/[0.06] p-3 space-y-2 text-[length:var(--text-small-size)]">
              <p className="font-semibold text-[color:var(--ui-text-danger)]">解析失败</p>
              <p className="whitespace-pre-wrap break-words leading-relaxed text-[color:var(--ui-text-secondary)] [overflow-wrap:anywhere]">
                {sanitizeErrorForDisplay(uploadedFile.parseError ?? '未知错误')}
              </p>
              {uploadedFile.parseProgress?.errorHint ? (
                <p className="text-[11px] leading-snug text-[color:var(--ui-text-muted)]">
                  识别阶段提示：{sanitizeErrorForDisplay(uploadedFile.parseProgress.errorHint, 800)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!uploadedFile?.id) return
                    operationAbortRef.current?.abort()
                    operationAbortRef.current = new AbortController()
                    void retryParseFlow(uploadedFile.id, operationAbortRef.current.signal, false)
                  }}
                >
                  手动重试
                </Button>
                {uploadedFile.fileType === 'PDF' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!uploadedFile?.id) return
                      operationAbortRef.current?.abort()
                      operationAbortRef.current = new AbortController()
                      void retryParseFlow(uploadedFile.id, operationAbortRef.current.signal, true)
                    }}
                  >
                    仅提取内置文本
                  </Button>
                )}
              </div>
            </div>
          )}

          {(uploadedFile?.status === 'PARSED' ||
            (uploadedFile?.status === 'PARSING' && uploadedFile.parsedContent?.trim())) && (
            <div className="rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/20"
                onClick={() => setPreviewOpen(!previewOpen)}
              >
                <span>查看解析文本</span>
                {previewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {previewOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border/20 pt-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setPreviewEditable(!previewEditable)
                        if (!previewEditable) toast('编辑保存后将优先用于 AI 分析', { icon: '✏️' })
                      }}
                    >
                      {previewEditable ? '完成编辑' : '编辑'}
                    </Button>
                    {parsePreviewDirty && (
                      <Badge variant="outline" className="text-[10px]">
                        已修改 · 分析时将作为文本输入
                      </Badge>
                    )}
                    {additionalAnalysisFiles.length > 0 && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                        多图模式下不可单独编辑合并文本 · 分析使用各图解析结果合并
                      </Badge>
                    )}
                  </div>
                  <textarea
                    readOnly={!previewEditable || additionalAnalysisFiles.length > 0}
                    className="w-full min-h-[120px] max-h-[240px] p-3 text-xs font-mono border-0 rounded-lg bg-background/55 shadow-sm ring-1 ring-inset ring-foreground/10 resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                    value={editedParsedText}
                    onChange={(e) => {
                      setEditedParsedText(e.target.value)
                      setParsePreviewDirty(true)
                    }}
                  />
                </div>
              )}
            </div>
          )}

          </section>

          <section className="rounded-xl border border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-card-bg)] p-3 shadow-[0_12px_40px_-28px_rgba(59,130,246,0.1)] dark:shadow-[0_16px_48px_-32px_rgba(0,0,0,0.4)]">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-sm font-semibold text-workspace-text-primary">需求上下文</h2>
              <span className="text-[10px] text-workspace-text-muted">可选 · 与指令模板组合后发给模型</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-workspace-text-secondary" htmlFor="ars-req-desc">
                    需求描述
                  </label>
                  <span className="text-[10px] tabular-nums text-workspace-text-muted">
                    {requirementDescription.length} / {REQ_DESC_MAX}
                  </span>
                </div>
                <textarea
                  id="ars-req-desc"
                  rows={5}
                  className="ars-textarea-field min-h-[120px] max-h-[240px] w-full resize-y overflow-y-auto rounded-xl border border-[color:var(--ai-ar-input-border)] bg-[color:var(--ai-ar-input-bg)] px-3 py-2.5 text-sm leading-relaxed text-workspace-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ring-0 transition-[box-shadow,opacity,transform] placeholder:text-workspace-text-muted/80 focus:border-cyan-500/55 focus:outline-none focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_0_0_3px_rgba(34,211,238,0.18)] dark:bg-slate-950/50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_rgba(34,211,238,0.22)]"
                  placeholder="例如：这是哪个产品版本、要解决什么问题、关键用户旅程是什么……"
                  value={requirementDescription}
                  onChange={(e) => setRequirementDescription(e.target.value.slice(0, REQ_DESC_MAX))}
                />
                <div className="mt-1 flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-workspace-text-secondary"
                    onClick={() => setRequirementDescription('')}
                  >
                    清空
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-workspace-text-secondary"
                    onClick={() => setLargeEditorField('desc')}
                  >
                    <Maximize2 className="h-3 w-3" />
                    展开编辑
                  </Button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-workspace-text-secondary" htmlFor="ars-req-supp">
                    补充说明
                  </label>
                  <span className="text-[10px] tabular-nums text-workspace-text-muted">
                    {requirementSupplement.length} / {REQ_SUPP_MAX}
                  </span>
                </div>
                <textarea
                  id="ars-req-supp"
                  rows={4}
                  className="ars-textarea-field min-h-[120px] max-h-[240px] w-full resize-y overflow-y-auto rounded-xl border border-[color:var(--ai-ar-input-border)] bg-[color:var(--ai-ar-input-bg)] px-3 py-2.5 text-sm leading-relaxed text-workspace-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] placeholder:text-workspace-text-muted/80 focus:border-violet-500/45 focus:outline-none focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_0_0_3px_rgba(139,92,246,0.16)] dark:bg-slate-950/50 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_rgba(139,92,246,0.2)]"
                  placeholder="约束、术语表、接口约定、非功能期望……写在这里，避免和正文混在一起。"
                  value={requirementSupplement}
                  onChange={(e) => setRequirementSupplement(e.target.value.slice(0, REQ_SUPP_MAX))}
                />
                <div className="mt-1 flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] text-workspace-text-secondary"
                    onClick={() => setRequirementSupplement('')}
                  >
                    清空
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-workspace-text-secondary"
                    onClick={() => setLargeEditorField('supp')}
                  >
                    <Maximize2 className="h-3 w-3" />
                    展开编辑
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section className="relative rounded-xl border border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-card-bg)] p-3 shadow-[0_12px_40px_-28px_rgba(59,130,246,0.1)] dark:shadow-[0_16px_48px_-32px_rgba(0,0,0,0.4)]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-workspace-text-primary">分析指令模板</h2>
              {isCustomTemplate ? (
                <Badge variant="outline" className="border-amber-400/50 bg-amber-500/10 text-[10px] text-amber-950 dark:text-amber-100">
                  已使用自定义指令
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-[10px] text-emerald-950 dark:text-emerald-100">
                  已匹配预设
                </Badge>
              )}
            </div>
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-xl border border-workspace-panel-border/70 bg-gradient-to-br from-cyan-500/10 via-white/40 to-violet-500/10 p-3 text-left transition-[opacity,transform] hover:border-cyan-500/40 dark:from-cyan-500/5 dark:via-slate-900/40 dark:to-violet-500/10 dark:hover:border-cyan-500/30"
              onClick={() => {
                setTemplatePickerOpen((o) => !o)
                setTemplateSearch('')
              }}
              aria-expanded={templatePickerOpen}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70 ring-1 ring-black/5 dark:bg-slate-800/80 dark:ring-white/10">
                <Brain className="h-5 w-5 text-violet-600 dark:text-violet-300" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-sm font-semibold text-workspace-text-primary">
                  {activePreset?.name ?? '自定义分析指令'}
                </p>
                <p className="line-clamp-2 text-[11px] text-workspace-text-secondary">
                  {activePreset ? `${activePreset.scenario} · ${activePreset.shortDesc}` : '当前内容与内置预设不一致，将按你编辑的文本优先发送'}
                </p>
                <p className="text-[10px] text-workspace-text-muted">点击展开模板库、搜索或切换预设</p>
              </div>
              <ChevronDown
                className={`mt-1 h-4 w-4 shrink-0 text-workspace-text-muted transition-transform ${templatePickerOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {templatePickerOpen && (
                <div className="absolute left-2 right-2 top-full z-20 mt-1 max-h-[min(52vh,380px)] overflow-hidden rounded-xl border border-workspace-panel-border/70 bg-workspace-panel/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95">
                <div className="border-b border-workspace-panel-border/50 p-2 dark:border-white/10">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-workspace-text-muted" />
                    <input
                      type="search"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="搜索模板名称或场景…"
                      className="h-9 w-full rounded-lg border border-workspace-panel-border/60 bg-workspace-panel-muted/60 pl-8 pr-2 text-xs text-workspace-text-primary outline-none ring-0 focus:border-cyan-500/50 dark:bg-slate-950/60"
                    />
                  </div>
                </div>
                <div className="max-h-[220px] overflow-y-auto p-2 ai-analysis-panel-scroll">
                  {recentPresetList.length > 0 && !templateSearch.trim() && (
                    <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-workspace-text-muted">
                      最近使用
                    </p>
                  )}
                  {recentPresetList.length > 0 && !templateSearch.trim() && (
                    <div className="mb-2 space-y-1">
                      {recentPresetList.map((p) => (
                        <button
                          key={`recent-${p.id}`}
                          type="button"
                          className="flex w-full flex-col gap-0.5 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs transition-[opacity,transform] hover:border-cyan-500/35 hover:bg-cyan-500/10"
                          onClick={() => {
                            setAnalysisPromptTemplate(p.body)
                            touchRecentPresetId(p.id)
                            setTemplatePickerOpen(false)
                          }}
                        >
                          <span className="font-medium text-workspace-text-primary">{p.name}</span>
                          <span className="text-[10px] text-workspace-text-secondary">{p.scenario}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-workspace-text-muted">
                    全部模板
                  </p>
                  {filteredPresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`mb-1 flex w-full flex-col gap-0.5 rounded-lg border px-2 py-2 text-left text-xs transition-[opacity,transform] last:mb-0 ${
                        matchedPresetId === p.id
                          ? 'border-cyan-500/50 bg-cyan-500/10'
                          : 'border-workspace-panel-border/40 hover:border-violet-400/40 hover:bg-violet-500/5'
                      }`}
                      onClick={() => {
                        setAnalysisPromptTemplate(p.body)
                        touchRecentPresetId(p.id)
                        setTemplatePickerOpen(false)
                      }}
                    >
                      <span className="font-semibold text-workspace-text-primary">{p.name}</span>
                      <span className="text-[10px] text-workspace-text-secondary">{p.scenario}</span>
                      <span className="line-clamp-2 text-[10px] text-workspace-text-muted">{p.shortDesc}</span>
                      <span className="text-[10px] text-workspace-text-muted/90">输出：{p.outputStyle}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-workspace-text-secondary" htmlFor="ai-analysis-prompt-template">
                  指令正文（可直接编辑）
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-workspace-text-muted"
                  onClick={resetAnalysisPromptTemplate}
                >
                  恢复默认
                </Button>
              </div>
              <textarea
                id="ai-analysis-prompt-template"
                className="min-h-[100px] max-h-[200px] w-full resize-y overflow-y-auto rounded-xl border border-[color:var(--ai-ar-input-border)] bg-[color:var(--ai-ar-input-bg)] p-3 font-mono text-[11px] leading-relaxed text-workspace-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] focus:border-violet-500/45 focus:outline-none focus:shadow-[0_0_0_3px_rgba(139,92,246,0.12)] dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                placeholder="在此微调发送给模型的系统指令…"
                value={analysisPromptTemplate}
                onChange={(e) => setAnalysisPromptTemplate(e.target.value)}
                spellCheck={false}
              />
            </div>
          </section>

          <section className="rounded-xl border border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-panel-bg)] p-3 shadow-[0_12px_40px_-28px_rgba(59,130,246,0.08)] dark:shadow-[0_16px_48px_-32px_rgba(0,0,0,0.35)]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-workspace-text-primary">历史与上传</h2>
                <div className="inline-flex rounded-full border border-workspace-panel-border/60 bg-workspace-panel-muted/50 p-0.5 text-[11px] dark:border-white/10">
                  <button
                    type="button"
                    className={`rounded-full px-2.5 py-1 font-medium transition-[opacity,transform] ${
                      historyTab === 'records'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-workspace-text-muted'
                    }`}
                    onClick={() => setHistoryTab('records')}
                  >
                    分析记录
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-2.5 py-1 font-medium transition-[opacity,transform] ${
                      historyTab === 'uploads'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-workspace-text-muted'
                    }`}
                    onClick={() => setHistoryTab('uploads')}
                  >
                    最近上传
                  </button>
                </div>
              </div>
              {historyTab === 'records' && analysisRecords.length > 0 && (
                <div className="space-y-2">
                  <input
                    type="search"
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder="按标题筛选…"
                    className="h-8 w-full rounded-lg border border-workspace-panel-border/60 bg-workspace-panel-muted/50 px-2 text-xs text-workspace-text-primary outline-none focus:border-cyan-500/45 dark:bg-slate-950/50"
                  />
                  <div className="max-h-[200px] overflow-y-auto rounded-lg border border-workspace-panel-border/50 ai-analysis-panel-scroll dark:border-white/10">
                    {(historyShowAll
                      ? analysisRecords.filter((r) =>
                          historyFilter.trim()
                            ? r.title.toLowerCase().includes(historyFilter.trim().toLowerCase())
                            : true,
                        )
                      : analysisRecords
                          .filter((r) =>
                            historyFilter.trim()
                              ? r.title.toLowerCase().includes(historyFilter.trim().toLowerCase())
                              : true,
                          )
                          .slice(0, 5)
                    ).map((r) => {
                      const rb = analysisRecordStatusBadge(r.status)
                      return (
                        <div
                          key={r.id}
                          className="group flex items-stretch gap-1 border-b border-workspace-panel-border/40 last:border-0 hover:bg-workspace-panel-muted/70 dark:border-white/[0.06] dark:hover:bg-slate-800/60"
                        >
                          <button
                            type="button"
                            onClick={() => void applyAnalysisRecord(r.id)}
                            className="flex min-w-0 flex-1 flex-col gap-0.5 p-2.5 text-left text-xs"
                          >
                            <span className="truncate font-medium text-workspace-text-primary">{r.title}</span>
                            <span className="text-[11px] text-workspace-text-secondary">
                              {formatUploadTime(r.createdAt)}
                              {r.file?.originalName ? ` · ${r.file.originalName}` : ''}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] text-workspace-text-muted">{formatRelative(r.createdAt)}</span>
                              <Badge variant="outline" className={`text-[10px] shrink-0 border-0 ${rb.cls}`}>
                                {rb.label}
                              </Badge>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="shrink-0 px-2 text-workspace-text-muted opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                            aria-label="删除分析记录"
                            onClick={(e) => void handleDeleteAnalysisRecord(r.id, e)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {analysisRecords.filter((r) =>
                    historyFilter.trim() ? r.title.toLowerCase().includes(historyFilter.trim().toLowerCase()) : true,
                  ).length > 5 && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300"
                      onClick={() => setHistoryShowAll((v) => !v)}
                    >
                      {historyShowAll ? '收起' : '查看全部'}
                    </button>
                  )}
                </div>
              )}
              {historyTab === 'records' && analysisRecords.length === 0 && (
                <div className="flex flex-col items-center gap-1 py-6 text-center">
                  <Sparkles className="h-6 w-6 text-cyan-500/80" />
                  <p className="text-[11px] text-workspace-text-muted">暂无分析记录，完成一次分析后会出现在这里</p>
                </div>
              )}
              {historyTab === 'uploads' && fileHistory.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto rounded-lg border border-workspace-panel-border/50 ai-analysis-panel-scroll dark:border-white/10">
                  {(historyShowAll ? fileHistory : fileHistory.slice(0, 5)).map((f) => {
                    const fb = fileHistoryStatusBadge(f.status)
                    return (
                      <div
                        key={f.id}
                        className={`group flex items-center gap-2 border-b border-workspace-panel-border/40 p-2.5 last:border-0 hover:bg-workspace-panel-muted/70 dark:border-white/[0.06] dark:hover:bg-slate-800/60 ${
                          uploadedFile?.id === f.id ? 'bg-cyan-500/10' : ''
                        }`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => selectHistoryFile(f)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              selectHistoryFile(f)
                            }
                          }}
                          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 text-left text-xs"
                        >
                          <span
                            className="truncate font-medium text-workspace-text-primary"
                            title={displayUploadedFilename(f.id, f.originalName)}
                          >
                            {displayUploadedFilename(f.id, f.originalName)}
                          </span>
                          <span className="text-[11px] text-workspace-text-secondary">
                            {formatFileSizeShort(f.size)} · {formatUploadTime(f.createdAt)}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-workspace-text-muted">{formatRelative(f.createdAt)}</span>
                            <Badge variant="outline" className={`text-[10px] shrink-0 border-0 ${fb.cls}`}>
                              {fb.label}
                            </Badge>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 p-1.5 text-workspace-text-muted opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 dark:hover:text-red-400"
                          aria-label="删除文件"
                          onClick={(ev) => void deleteHistoryFile(f.id, ev)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {historyTab === 'uploads' && fileHistory.length > 0 && fileHistory.length > 5 && (
                <button
                  type="button"
                  className="mt-1 text-[11px] font-medium text-cyan-700 underline-offset-2 hover:underline dark:text-cyan-300"
                  onClick={() => setHistoryShowAll((v) => !v)}
                >
                  {historyShowAll ? '收起' : '查看全部'}
                </button>
              )}
              {historyTab === 'uploads' && fileHistory.length === 0 && (
                <div className="flex flex-col items-center gap-1 py-6 text-center">
                  <Upload className="h-6 w-6 text-violet-500/80" />
                  <p className="text-[11px] text-workspace-text-muted">暂无上传记录</p>
                </div>
              )}
            </section>

            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-[color:var(--ai-ar-divider)] bg-[color:var(--ai-ar-sticky-bar-bg)] px-4 py-3 backdrop-blur-md sm:px-5">
            <p className="text-[11px] leading-snug text-workspace-text-secondary">{prepStripSummary}</p>
          <div className="flex items-center gap-3 py-1">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground" id="human-review-label">
              人工审阅
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={humanReview}
              aria-labelledby="human-review-label"
              aria-label="人工审阅"
              onClick={() => setHumanReview(!humanReview)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
                ${humanReview ? 'bg-blue-600' : 'bg-gray-600'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow
                  ${humanReview ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          <div className="space-y-2 pt-2">
            {showStartButton && (
              <Button
                className="w-full h-11 text-sm font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-purple-500/20"
                onClick={() => void handleStartAnalysis()}
              >
                <Brain className="w-4 h-4" />
                开始分析
              </Button>
            )}
            {busy && (
              <>
                <Button
                  className="w-full h-11 text-sm font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white opacity-70 cursor-not-allowed"
                  disabled
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {state.status === 'analyzing'
                    ? `分析中… ${analysisElapsed}s`
                    : state.status === 'parsing'
                      ? `解析中… ${parseElapsed}s`
                      : '上传中...'}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm font-medium gap-2 border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300"
                  type="button"
                  onClick={() => setConfirmStopOpen(true)}
                >
                  <Square className="w-3.5 h-3.5" />
                  {state.status === 'analyzing' ? '停止分析' : '停止'}
                </Button>
              </>
            )}
            {isIdle && !canStartAnalysis && !isUploadingOrParsing && (
              <Button
                className="w-full h-11 text-sm font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white opacity-50 cursor-not-allowed"
                disabled
              >
                <Brain className="w-4 h-4" />
                开始分析
              </Button>
            )}
          </div>
          </div>
        </aside>

        {/* 右栏：AI 分析终端 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-[color:var(--ai-ar-divider)] bg-[color:var(--ai-ar-terminal-bg)] motion-safe:animate-[arsStudioIn_0.48s_ease-out_both] max-lg:border-t lg:border-l">
          <div className="flex shrink-0 flex-col gap-1.5 rounded-t-xl border border-b-0 border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-terminal-header-bg)] px-3 py-2.5 shadow-[0_8px_32px_-24px_rgba(59,130,246,0.12)] backdrop-blur-md sm:px-4">
            <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Terminal className="h-4 w-4 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden />
                <span className="truncate text-sm font-semibold text-workspace-text-primary">AI 需求分析终端</span>
                <StatusBadge status={state.status} labelOverride={terminalBadgeLabel} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {!autoScroll && (
                  <button
                    type="button"
                    className="text-[11px] text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
                    onClick={() => setAutoScroll(true)}
                  >
                    恢复自动滚动
                  </button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-[11px] text-workspace-text-secondary hover:text-red-600 dark:hover:text-red-400"
                  disabled={state.logs.length === 0}
                  onClick={() => dispatch({ type: 'CLEAR_LOGS' })}
                >
                  清空日志
                </Button>
                {state.reportText.trim().length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-[11px] text-violet-800 dark:text-violet-200"
                      onClick={() => void handleSendToGenerate()}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      生成用例
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={exportingPdf || exportingXmind}
                      className="h-8 gap-1 text-[11px] text-workspace-text-secondary"
                      onClick={() => void handleExportXmind()}
                    >
                      {exportingXmind ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Waypoints className="h-3.5 w-3.5" />
                      )}
                      XMind
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 border-workspace-panel-border/60 text-[11px] text-workspace-text-primary"
                      onClick={copyAnalysisReport}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 border-workspace-panel-border/60 text-[11px] text-workspace-text-primary"
                      onClick={handlePrintAnalysisReport}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      打印
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={exportingPdf || exportingXmind}
                      className="h-8 gap-1 bg-gradient-to-r from-cyan-600 to-violet-600 px-3 text-[11px] font-semibold text-white shadow-md disabled:opacity-60"
                      onClick={() => void handleExportAnalysisPdf()}
                    >
                      {exportingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      PDF
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-1 border-t border-workspace-panel-border/40 pt-1.5 dark:border-white/[0.08]">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-[opacity,transform] ${
                  rightTab === 'process'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-workspace-text-muted hover:text-workspace-text-primary'
                }`}
                onClick={() => setRightTab('process')}
              >
                过程
              </button>
              <button
                type="button"
                disabled={!reportTabEnabled}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-[opacity,transform] disabled:cursor-not-allowed disabled:opacity-40 ${
                  rightTab === 'report'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                    : 'text-workspace-text-muted hover:text-workspace-text-primary'
                }`}
                onClick={() => reportTabEnabled && setRightTab('report')}
              >
                报告
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border border-t-0 border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-terminal-bg)] lg:rounded-br-xl">
            {rightTab === 'process' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 border-b border-[color:var(--ai-ar-terminal-header-border)] bg-[color:var(--ai-ar-terminal-bg)]/70 p-3">
                  <AiStudioStepRail
                    status={state.status}
                    uploadedFile={uploadedFile}
                    reportText={state.reportText}
                  />
                </div>
                <div
                  ref={logContainerRef}
                  onScroll={handleLogScroll}
                  className="ai-analysis-terminal-scroll min-h-[140px] flex-1 space-y-0.5 overflow-y-auto overscroll-contain bg-[color:var(--ai-ar-terminal-log-bg)] px-3 py-2 font-mono text-[length:var(--text-terminal-size)] leading-[1.65]"
                >
                  {state.logs.length === 0 && isIdle && !busy ? (
                    <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 px-4 py-10 text-center motion-safe:animate-[fadeIn_0.4s_ease-out]">
                      <Sparkles className="h-8 w-8 text-cyan-600/90 dark:text-cyan-300/90" />
                      <p className="text-sm font-medium text-workspace-text-primary">等待任务启动</p>
                      <p className="max-w-xs text-[11px] leading-relaxed text-workspace-text-secondary">
                        上传需求文档或填写左侧「需求描述」后，AI 会在这里输出步骤时间线与运行日志。
                      </p>
                    </div>
                  ) : state.logs.length === 0 ? (
                    <div className="py-6 text-center text-[length:var(--text-terminal-size)] text-[color:var(--ui-terminal-meta)]">
                      等待操作或开始分析…
                    </div>
                  ) : null}
                  {state.logs.map((log) => (
                    <LogLine key={log.id} entry={log} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className={`ai-analysis-report-scroll box-border min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[color:var(--ai-ar-report-bg)] px-4 py-3 [scrollbar-gutter:stable] select-text sm:px-5 ${
                    showReviewArea || showApprovedOnly ? 'scroll-pb-36 pb-32' : ''
                  }`}
                  data-testid="ai-analysis-report-panel"
                >
                  {isAnalyzingStream && !state.reportText.trim() ? (
                    <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 py-12 text-center">
                      <Loader2 className="h-7 w-7 animate-spin text-cyan-600 dark:text-cyan-300" />
                      <p className="text-sm font-medium text-workspace-text-primary">报告流式生成中…</p>
                      <p className="text-[11px] text-workspace-text-muted">生成完成后会自动切换到此标签，也可手动点开查看进度。</p>
                    </div>
                  ) : state.reportText.trim() ? (
                    <>
                      <div className="mb-3 shrink-0">
                        <h3 className="border-b border-cyan-500/50 pb-2 text-lg font-bold leading-tight text-workspace-text-primary dark:border-cyan-400/40">
                          需求文档分析报告
                        </h3>
                      </div>
                      <div
                        ref={reportMarkdownRef}
                        data-testid="ai-analysis-report-markdown"
                        className="ai-analysis-print-root min-w-0 max-w-full pb-2 text-workspace-text-primary"
                      >
                        <AnalysisMarkdownReport
                          text={state.reportText}
                          className="break-words [word-break:break-word]"
                          isStreaming={isAnalyzingStream}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 py-12 text-center">
                      <Sparkles className="h-7 w-7 text-violet-500/80" />
                      <p className="text-sm text-workspace-text-primary">暂无报告输出</p>
                      <p className="max-w-sm text-[11px] text-workspace-text-muted">
                        上传需求文档或输入需求描述后，AI 会在这里生成分析过程与结构化报告。
                      </p>
                    </div>
                  )}
                </div>

                {(showReviewArea || showApprovedOnly) && (
                  <div className="relative shrink-0 border-t border-[color:var(--ai-ar-divider)] bg-[color:var(--ai-ar-card-bg)] p-4">
                    <div
                      className="pointer-events-none absolute -top-14 left-0 right-0 z-[1] h-14 bg-gradient-to-b from-transparent via-[color:var(--ai-ar-card-bg)]/55 to-[color:var(--ai-ar-card-bg)]"
                      aria-hidden
                    />
                    {state.status === 'approved' ? (
                      <div className="space-y-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-sm font-medium">需求分析已通过</span>
                        </div>
                        <p className="text-xs text-workspace-text-muted">可继续生成测试用例或重新分析</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                          type="button"
                          onClick={() => dispatch({ type: 'RESET' })}
                        >
                          清空并重置
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h4 className="mb-2 flex shrink-0 items-center gap-2 text-sm font-medium text-workspace-text-primary">
                          <User className="h-4 w-4 text-workspace-text-muted" />
                          人工审阅
                        </h4>
                        <textarea
                          rows={5}
                          className="min-h-[120px] w-full resize-y overflow-y-auto rounded-xl border border-workspace-panel-border/60 bg-[hsl(var(--workspace-panel-muted-bg)/0.55)] p-3 text-sm leading-relaxed text-workspace-text-primary shadow-inner placeholder:text-workspace-text-muted focus:border-violet-500/45 focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:bg-slate-950/60"
                          placeholder="请输入修改意见…（Ctrl+Enter 提交）"
                          value={state.reviewText}
                          onChange={(e) => dispatch({ type: 'SET_REVIEW_TEXT', text: e.target.value })}
                          onKeyDown={handleReviewKeyDown}
                        />
                        <div className="mt-3 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                          <Button
                            className="h-11 flex-1 gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-sm font-semibold text-white shadow-md hover:from-orange-600 hover:to-amber-600"
                            type="button"
                            onClick={() => void handleSubmitRevision()}
                          >
                            <ArrowRight className="h-4 w-4" />
                            提交修改意见
                          </Button>
                          <Button
                            className="h-11 flex-1 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold text-white shadow-md hover:from-emerald-700 hover:to-teal-700"
                            type="button"
                            onClick={handleApprove}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            确认通过
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {largeEditorField && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--ai-ar-modal-overlay)] p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal
          aria-labelledby="ars-large-editor-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLargeEditorField(null)
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-[color:var(--ai-ar-panel-border)] bg-[color:var(--ai-ar-modal-card-bg)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 id="ars-large-editor-title" className="text-sm font-semibold text-workspace-text-primary">
                {largeEditorField === 'desc' ? '需求描述' : '补充说明'}
              </h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setLargeEditorField(null)}>
                完成
              </Button>
            </div>
            <textarea
              className="h-[min(60vh,480px)] w-full resize-y rounded-xl border border-[color:var(--ai-ar-input-border)] bg-[color:var(--ai-ar-input-bg)] p-3 text-sm leading-relaxed text-workspace-text-primary focus:border-cyan-500/45 focus:outline-none focus:ring-2 focus:ring-cyan-500/15"
              value={largeEditorField === 'desc' ? requirementDescription : requirementSupplement}
              onChange={(e) => {
                const v = e.target.value
                if (largeEditorField === 'desc') setRequirementDescription(v.slice(0, REQ_DESC_MAX))
                else setRequirementSupplement(v.slice(0, REQ_SUPP_MAX))
              }}
            />
            <p className="mt-2 text-right text-[11px] tabular-nums text-workspace-text-muted">
              {(largeEditorField === 'desc' ? requirementDescription : requirementSupplement).length} /{' '}
              {largeEditorField === 'desc' ? REQ_DESC_MAX : REQ_SUPP_MAX}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes arsStudioIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes arsStudioIn {
            from { opacity: 1; transform: none; }
            to { opacity: 1; transform: none; }
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function AiAnalysisPage() {
  return (
    <AiAnalysisErrorBoundary>
      <AiAnalysisPageInner />
    </AiAnalysisErrorBoundary>
  )
}
