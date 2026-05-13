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
  History,
  Waypoints,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
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

/* ──────────────────────── 类型 ──────────────────────── */

type AnalysisStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'analyzing'
  | 'review'
  | 'approved'
  | 'error'

interface LogEntry {
  id: string
  icon: 'loading' | 'success' | 'error'
  text: string
  timestamp: string
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

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

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
 * 终端日志左侧图标仅由本行文案决定（与 dispatch 时写入的 icon 字段无关），避免全局阶段与文案语义不一致。
 * 优先级：失败类 → 成功类 → 进行中类 → 默认进行中。
 */
function terminalLogIconFromText(text: string): LogEntry['icon'] {
  const t = text
  const errorLike =
    t.includes('失败') || (t.includes('错误') && !t.includes('无错误'))
  if (errorLike) return 'error'

  const successLike =
    t.includes('上传成功') ||
    t.includes('解析成功') ||
    t.includes('读取成功') ||
    (t.includes('完成') && !t.includes('未完成'))
  if (successLike) return 'success'

  const loadingLike =
    t.includes('正在上传') ||
    t.includes('正在等待') ||
    t.includes('等待解析') ||
    t.includes('正在')
  if (loadingLike) return 'loading'

  return 'loading'
}

function mapParseStageMessage(stage: string | null | undefined): { icon: LogEntry['icon']; text: string } {
  const s = stage ?? 'PENDING'
  switch (s) {
    case 'PENDING':
      return { icon: 'loading', text: '📄 文件上传成功，等待解析...' }
    case 'CLAIMED':
      return { icon: 'loading', text: '📝 开始解析文档...' }
    case 'FILE_OK':
      return { icon: 'loading', text: '✅ 文件读取成功，继续解析…' }
    case 'PDF':
      return { icon: 'loading', text: '📄 正在提取 PDF 文本...' }
    case 'PDF_TEXT_LAYER':
      return { icon: 'loading', text: '📄 正在提取 PDF 内置文本层...' }
    case 'PDF_TEXT_LAYER_OK':
      return { icon: 'loading', text: '✅ PDF 内置文本可用，跳过 OCR' }
    case 'PDF_OCR_PIPELINE':
      return { icon: 'loading', text: '🔍 扫描件或文本不足，正在分页 OCR（分批处理）...' }
    case 'WORD':
      return { icon: 'loading', text: '📄 正在提取 Word 文本...' }
    case 'EXCEL':
      return { icon: 'loading', text: '📊 正在解析 Excel 表格...' }
    case 'YAML':
    case 'TEXT':
      return { icon: 'loading', text: '📄 正在读取文本...' }
    case 'IMAGE':
      return { icon: 'loading', text: '🔍 检测到扫描件，正在 OCR 识别...' }
    case 'STRUCTURE':
      return { icon: 'loading', text: '⚙️ 正在结构化需求提取...' }
    case 'PDF_OCR_PARTIAL':
      return { icon: 'loading', text: '📎 已生成部分解析文本，后台继续识别剩余页面…' }
    case 'DONE':
      return { icon: 'success', text: '✅ 解析完成' }
    case 'FAILED':
      return { icon: 'error', text: '❌ 解析失败' }
    case 'CANCELLED':
      return { icon: 'error', text: '❌ 已取消解析' }
    default: {
      const m = /^PDF_OCR_P(\d+)_(\d+)$/.exec(s || '')
      if (m) {
        return {
          icon: 'loading',
          text: `🔍 正在识别 PDF 第 ${m[1]}–${m[2]} 页（分批 OCR）...`,
        }
      }
      return { icon: 'loading', text: `📄 解析阶段：${s}` }
    }
  }
}

/* ──────────────────── 子组件 ──────────────────────── */

/** 终端日志左侧状态图标：同一 icon 类型始终同一组件与同一像素尺寸，避免同页多种 Loader2 样式漂移 */
const TERMINAL_LOG_ICON_PX = 14

function TerminalLogStatusIcon({ status }: { status: LogEntry['icon'] }) {
  const box = 'inline-flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center'
  if (status === 'success') {
    return (
      <span className={box} aria-hidden>
        <CheckCircle2 size={TERMINAL_LOG_ICON_PX} strokeWidth={2} className="text-green-400" />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className={box} aria-hidden>
        <XCircle size={TERMINAL_LOG_ICON_PX} strokeWidth={2} className="text-red-400" />
      </span>
    )
  }
  return (
    <span className={box} aria-hidden>
      <Loader2
        size={TERMINAL_LOG_ICON_PX}
        strokeWidth={2}
        className="text-blue-400 animate-spin"
      />
    </span>
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
    idle: { label: '等待上传', cls: 'bg-slate-600 text-white border-0 shadow-sm' },
    uploading: { label: '上传中', cls: 'bg-blue-600 text-white border-0 shadow-sm animate-pulse' },
    parsing: { label: '解析中...', cls: 'bg-blue-600 text-white border-0 shadow-sm animate-pulse' },
    analyzing: { label: '分析中...', cls: 'bg-blue-600 text-white border-0 shadow-sm animate-pulse' },
    review: { label: '等待审阅', cls: 'bg-amber-500 text-white border-0 shadow-sm' },
    approved: { label: '已通过', cls: 'bg-emerald-600 text-white border-0 shadow-sm' },
    error: { label: '分析失败', cls: 'bg-red-600 text-white border-0 shadow-sm' },
  }
  const { label, cls } = map[status]
  return (
    <Badge variant="outline" className={`text-xs font-semibold border-transparent ${cls}`}>
      {labelOverride ?? label}
    </Badge>
  )
}

/** 日志行文案语义 → 文本颜色（与 icon 判断一致） */
function terminalLogTextClass(text: string): string {
  const kind = terminalLogIconFromText(text)
  if (kind === 'error') return 'text-red-400'
  if (kind === 'success') return 'text-emerald-400'
  return 'text-blue-300'
}

function LogLine({ entry }: { entry: LogEntry }) {
  const status = terminalLogIconFromText(entry.text)
  const textCls = terminalLogTextClass(entry.text)
  return (
    <div className="flex items-start gap-2 font-mono py-0.5 animate-[fadeIn_0.3s_ease-out] text-[12px] leading-[1.5]">
      <TerminalLogStatusIcon status={status} />
      <span className="text-slate-500 flex-shrink-0">[{entry.timestamp}]</span>
      <span className={`whitespace-pre-wrap break-words ${textCls}`}>{entry.text}</span>
    </div>
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
  const [requirementText, setRequirementText] = useState('')
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

  const makeLog = useCallback((icon: LogEntry['icon'], text: string): LogEntry => {
    return { id: safeRandomUUID(), icon, text, timestamp: nowTime() }
  }, [])

  const addLog = useCallback(
    (icon: LogEntry['icon'], text: string) => {
      dispatch({ type: 'ADD_LOG', log: makeLog(icon, text) })
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
      if (!window.confirm('确定删除该条分析记录？')) return
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
    if (requirementText.trim()) {
      parts.push(`【补充说明】\n${requirementText.trim()}`)
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
    requirementText,
    setPendingGenerateHandoff,
    state.reportText,
    uploadedFile,
  ])

  /** 多图并行轮询时同步更新主文件或附加列表中的同一条记录 */
  const updateFileInPlace = useCallback((f: UploadedFile) => {
    setUploadedFile((prev) => (prev?.id === f.id ? f : prev))
    setAdditionalAnalysisFiles((prev) => prev.map((p) => (p.id === f.id ? f : p)))
  }, [])

  const pollUntilParsed = useCallback(
    async (
      fileId: string,
      signal: AbortSignal,
      onTick?: (f: UploadedFile) => void,
    ): Promise<UploadedFile> => {
      let lastStage: string | undefined
      for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await sleep(POLL_INTERVAL_MS)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const f = await filesApi.getFileById(fileId)
        onTick?.(f)
        const stage = f.parseStage ?? undefined
        if (stage !== lastStage) {
          lastStage = stage
          const mapped = mapParseStageMessage(stage)
          if (stage === 'FAILED') {
            addLog('error', `${mapped.text}: ${f.parseError ?? '未知错误'}`)
          } else if (stage !== 'DONE') {
            addLog(mapped.icon, mapped.text)
          }
        }
        if (f.status === 'PARSED') {
          const n = f.parsedContent?.length ?? 0
          addLog('success', `✅ 解析完成 (${n.toLocaleString()} 字符)`)
          return f
        }
        if (f.status === 'FAILED') {
          return f
        }
      }
      return filesApi.getFileById(fileId)
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
      setUploadedFile(r)
      dispatch({ type: 'UPLOAD_DONE' })
      addLog(
        'loading',
        textOnly ? '📄 已提交「仅内置文本」重新解析…' : '📄 已提交重新解析…',
      )
      const parsed = await pollUntilParsed(fileId, signal, setUploadedFile)
      setUploadedFile(parsed)
      if (parsed.status === 'PARSED') {
        setEditedParsedText(parsed.parsedContent ?? '')
        dispatch({ type: 'GO_IDLE' })
        void loadFileHistory()
      } else {
        addLog('error', `❌ ${parsed.parseError ?? '解析失败'}`)
        dispatch({
          type: 'ERROR',
          log: makeLog('error', parsed.parseError ?? '解析失败'),
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
                parseError: p.parseError,
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

      addLog('loading', `📤 批量上传 ${arr.length} 张图片…`)

      try {
        const uploadedRows = await Promise.all(
          arr.map(async (file, i) => {
            addLog('loading', `📤 图片 ${i + 1}/${arr.length}：${file.name}`)
            const cur = await uploadFile(file)
            if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
            stashUploadedOriginalName(cur.id, file.name)
            return cur
          }),
        )

        if (signal.aborted) return

        const first = uploadedRows[0]
        if (first) {
          setUploadedFile(first)
          setAdditionalAnalysisFiles(uploadedRows.slice(1))
        }

        const needParse = uploadedRows.filter((u) => u.status !== 'PARSED')
        if (needParse.length > 0) {
          dispatch({ type: 'UPLOAD_DONE' })
          addLog('loading', `📄 并行解析 ${needParse.length} 张图片…`)
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
          setUploadedFile(firstR)
          setAdditionalAnalysisFiles(results.slice(1))
        }

        const joined = results
          .map((r) => r.parsedContent ?? '')
          .filter(Boolean)
          .join('\n\n---\n\n')
        setEditedParsedText(joined)
        setParsePreviewDirty(false)

        if (results.every((r) => r.status === 'PARSED')) {
          addLog('success', `✅ ${results.length} 张图片已就绪，可开始分析`)
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
        } else {
          const failed = results.find((r) => r.status === 'FAILED')
          addLog('error', `❌ 图片解析失败：${failed?.parseError ?? '未知错误'}`)
          dispatch({
            type: 'ERROR',
            log: makeLog('error', failed?.parseError ?? '解析失败'),
          })
          toast.error('部分图片解析失败')
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          addLog('loading', '⏹ 已取消上传/解析')
          dispatch({ type: 'STOP_TO_IDLE' })
          replaceImagePreviews([])
          setUploadedFile(null)
          setAdditionalAnalysisFiles([])
          setUploadDisplayName(null)
          return
        }
        addLog('error', `❌ ${(e as Error).message || '上传失败'}`)
        dispatch({ type: 'ERROR', log: makeLog('error', '上传失败') })
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

      addLog('loading', `📤 正在上传：${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)

      try {
        const result = await uploadFile(file)
        if (signal.aborted) return

        stashUploadedOriginalName(result.id, file.name)
        setUploadedFile(result)
        setParsePreviewDirty(false)
        setEditedParsedText(result.parsedContent ?? '')
        addLog('success', `✅ 文件上传成功，服务端文件 ID：${result.id}`)

        if (result.status === 'PARSED') {
          const n = result.parsedContent?.length ?? 0
          addLog('success', `✅ 需求解析完成 (${n.toLocaleString()} 字符)`)
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
          return
        }

        dispatch({ type: 'UPLOAD_DONE' })
        addLog(
          'loading',
          '📄 正在等待服务端解析文档（服务端会按文档自动选择：内置文本层 / 混元多模态直读 / OCR 等）...',
        )

        const parsed = await pollUntilParsed(result.id, signal, setUploadedFile)
        if (signal.aborted) return

        setUploadedFile(parsed)

        if (parsed.status === 'PARSED') {
          setEditedParsedText(parsed.parsedContent ?? '')
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
        } else {
          addLog('error', `❌ 需求解析失败：${parsed.parseError ?? '未知错误'}`)
          dispatch({
            type: 'ERROR',
            log: makeLog('error', parsed.parseError ?? '解析失败'),
          })
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          addLog('loading', '⏹ 已取消上传/解析')
          dispatch({ type: 'STOP_TO_IDLE' })
          replaceImagePreviews([])
          setUploadedFile(null)
          setAdditionalAnalysisFiles([])
          setUploadDisplayName(null)
          return
        }
        setUploadDisplayName(null)
        addLog('error', `❌ ${(e as Error).message || '上传失败'}`)
        dispatch({ type: 'ERROR', log: makeLog('error', '上传失败') })
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
    setUploadedFile(f)
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
    const base = requirementText.trim()
      ? `${analysisPromptTemplate}\n\n用户补充说明：\n${requirementText}`
      : analysisPromptTemplate
    return base
  }, [analysisPromptTemplate, requirementText])

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
        addLog('loading', '🚀 开始需求分析...')
        addLog('loading', '🤖 正在调用 AI 模型（需求分析通道）...')
      } else {
        addLog('loading', '🔄 正在根据修改意见重新分析...')
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
                  'success',
                  '✅ AI 需求分析完成。您可审阅报告或输入修改意见（Ctrl+Enter 提交修订）。',
                )
                dispatch({ type: 'SET_REPORT' })
              } else {
                addLog('success', '✅ AI 需求分析完成（已跳过人工审阅，自动通过）。')
                dispatch({ type: 'APPROVE' })
                toast.success('需求分析已完成并已通过')
              }
              resolve()
            },
            (err: Error) => {
              addLog('error', `❌ 分析失败：${err.message}`)
              dispatch({ type: 'ERROR', log: makeLog('error', err.message) })
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

    const extra = requirementText.trim()
      ? `\n\n用户补充说明：\n${requirementText}`
      : ''
    await runAnalyzeStream(revisionPrompt + extra, true)
  }, [
    analysisPromptTemplate,
    state.reviewText,
    state.reportText,
    uploadedFile,
    requirementText,
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
      addLog('loading', '⏹ 已请求取消解析任务')
      dispatch({ type: 'STOP_TO_IDLE' })
      toast('已停止', { icon: '⏹' })
      void loadFileHistory()
      return
    }

    if (state.status === 'analyzing') {
      addLog('loading', '⏹ 已停止分析')
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

  const terminalBadgeLabel =
    state.status === 'idle' && canStartAnalysis ? '就绪' : undefined

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-background">
      <ConfirmDialog
        open={confirmStopOpen}
        title="确认停止？"
        description="将取消当前正在进行的上传、解析或 AI 分析。解析中的任务会通知服务端取消。"
        confirmText="停止"
        confirmVariant="destructive"
        onCancel={() => setConfirmStopOpen(false)}
        onConfirm={() => void executeStop()}
      />

      {!online && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          当前离线，请检查网络连接
        </div>
      )}

      {/* 顶栏：固定高度，不参与主区滚动 */}
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/40 px-3 py-3 sm:px-4 md:px-5">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Brain className="h-6 w-6 shrink-0 text-primary" />
            AI 需求分析
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
            上传需求文档，AI 自动解析并生成结构化需求分析报告；大文件自动分片上传，支持解析阶段追踪与任务取消
          </p>
        </div>
        {modelInfo && (
          <Badge
            variant="outline"
            className="shrink-0 border-primary/30 bg-primary/5 text-xs text-primary"
          >
            模型：{modelInfo.name}
          </Badge>
        )}
      </header>

      <div className="flex shrink-0 items-start gap-2.5 border-b border-border/30 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 sm:px-4 md:px-5">
        <FileText className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">使用说明</p>
          <p className="opacity-80">
            关闭「人工审阅」时，分析结束后将自动标记为通过。编辑「解析文本」后，将优先使用编辑后的文本作为分析输入。
          </p>
        </div>
      </div>

      {/* 主区：左右列各自 min-h-0 + 内部滚动，整体不撑高视口 */}
      <div className="grid min-h-0 flex-1 gap-0 overflow-hidden max-lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,44%)_minmax(0,56%)] lg:grid-rows-1">
        {/* 左栏：仅中间区域滚动；底部「人工审阅开关 + 开始/停止」固定可见 */}
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-border/40 bg-card/15 lg:border-b-0 lg:border-r lg:border-border/40">
          <div className="ai-analysis-panel-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">需求文档</label>
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
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200 border-border/40 bg-muted/15 hover:border-primary/40 hover:bg-muted/25"
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">拖拽文件到此处，或点击选择</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  PDF / Word / Excel / TXT / MD / YAML / 图片 · 单文件 ≤ 100MB · 大于 5MB 自动分片 ·
                  可多选最多 5 张图片一次性分析
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                {imagePreviewUrls.length > 0 && uploadedFile.fileType === 'IMAGE' ? (
                  <div className="flex flex-wrap gap-1 flex-shrink-0 max-w-[3.75rem] content-start">
                    {imagePreviewUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        className="w-11 h-11 object-cover rounded border border-green-500/30"
                      />
                    ))}
                  </div>
                ) : (
                  <FileText className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  {additionalAnalysisFiles.length === 0 ? (
                    <>
                      <p
                        className="text-sm text-green-300 truncate"
                        title={
                          uploadDisplayName ?? normalizeUploadedFilename(uploadedFile.originalName)
                        }
                      >
                        {uploadDisplayName ??
                          normalizeUploadedFilename(uploadedFile.originalName)}
                      </p>
                      <p className="text-xs text-green-400/60">
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
                      <p className="text-xs font-medium text-green-200">
                        多图分析 · 共 {1 + additionalAnalysisFiles.length} 张
                      </p>
                      <ul className="text-xs text-green-300 space-y-1 max-h-36 overflow-y-auto">
                        {[uploadedFile, ...additionalAnalysisFiles].map((f, idx) => (
                          <li key={f.id} className="flex items-center gap-2 min-w-0">
                            {imagePreviewUrls[idx] ? (
                              <img
                                src={imagePreviewUrls[idx]}
                                alt=""
                                className="w-8 h-8 object-cover rounded border border-green-500/25 shrink-0"
                              />
                            ) : null}
                            <span className="truncate min-w-0" title={displayUploadedFilename(f.id, f.originalName)}>
                              · {displayUploadedFilename(f.id, f.originalName)}{' '}
                              <span className="text-green-400/70">
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
                  className="text-green-400/60 hover:text-green-300 transition-colors p-1"
                  aria-label="移除文件"
                >
                  <X className="w-4 h-4" />
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
                  <TerminalLogStatusIcon status="loading" />
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
                  return <p className="text-[11px] text-amber-200/85">提示：{hint}</p>
                })()}
              </div>
            )}
          </div>

          {uploadedFile?.status === 'FAILED' && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 space-y-2 text-xs">
              <p className="text-red-300 font-medium">解析失败</p>
              <p className="text-muted-foreground whitespace-pre-wrap break-words">
                {uploadedFile.parseError ?? '未知错误'}
              </p>
              {uploadedFile.parseProgress?.errorHint ? (
                <p className="text-amber-200/90 text-[11px]">识别阶段提示：{uploadedFile.parseProgress.errorHint}</p>
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

          {analysisRecords.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                分析记录
              </label>
              <p className="text-[11px] text-muted-foreground">
                以下为已成功落库的「需求分析」生成记录（关键词检索）；点击查看完整报告。
              </p>
              <div className="max-h-[min(30vh,220px)] overflow-y-auto rounded border border-border/30 ai-analysis-panel-scroll">
                {analysisRecords.map((r) => {
                  const rb = analysisRecordStatusBadge(r.status)
                  return (
                    <div
                      key={r.id}
                      className="flex items-stretch gap-1 border-b border-border/20 last:border-0 hover:bg-[#1E293B] transition-colors rounded"
                    >
                      <button
                        type="button"
                        onClick={() => void applyAnalysisRecord(r.id)}
                        className="flex flex-1 min-w-0 flex-col gap-1 p-3 text-left text-xs rounded"
                      >
                        <span className="truncate font-medium text-foreground">{r.title}</span>
                        <span className="text-[12px] text-[#64748B]">
                          {formatUploadTime(r.createdAt)}
                          {r.file?.originalName ? ` · ${r.file.originalName}` : ''}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">{formatRelative(r.createdAt)}</span>
                          <Badge variant="outline" className={`text-[10px] shrink-0 border-0 ${rb.cls}`}>
                            {rb.label}
                          </Badge>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 px-2 text-muted-foreground hover:text-red-500 transition-colors rounded"
                        aria-label="删除分析记录"
                        onClick={(e) => void handleDeleteAnalysisRecord(r.id, e)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {fileHistory.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">最近上传</label>
              <div className="max-h-[min(30vh,220px)] overflow-y-auto rounded border border-border/30 ai-analysis-panel-scroll">
                {fileHistory.map((f) => {
                  const fb = fileHistoryStatusBadge(f.status)
                  return (
                    <div
                      key={f.id}
                      className={`flex items-center gap-2 border-b border-border/20 last:border-0 p-3 rounded transition-colors hover:bg-[#1E293B] ${
                        uploadedFile?.id === f.id ? 'bg-primary/10' : ''
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
                        className="flex flex-1 min-w-0 cursor-pointer flex-col gap-1 text-left text-xs"
                      >
                        <span
                          className="truncate text-foreground font-medium"
                          title={displayUploadedFilename(f.id, f.originalName)}
                        >
                          {displayUploadedFilename(f.id, f.originalName)}
                        </span>
                        <span className="text-[12px] text-[#64748B]">
                          {formatFileSizeShort(f.size)} · {formatUploadTime(f.createdAt)}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">{formatRelative(f.createdAt)}</span>
                          <Badge variant="outline" className={`text-[10px] shrink-0 border-0 ${fb.cls}`}>
                            {fb.label}
                          </Badge>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded"
                        aria-label="删除文件"
                        onClick={(ev) => void deleteHistoryFile(f.id, ev)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">需求描述/补充说明</label>
            <textarea
              className="w-full h-[80px] p-3 text-sm border-0 rounded-lg bg-background/55 shadow-sm ring-1 ring-inset ring-foreground/10 dark:ring-white/10 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
              placeholder="在此输入需求背景、业务描述或补充说明..."
              value={requirementText}
              onChange={(e) => setRequirementText(e.target.value)}
            />
          </div>

          <div className="flex max-h-[min(40vh,320px)] min-h-[160px] flex-col gap-2 overflow-hidden rounded-lg border border-border/30 bg-muted/10 p-3">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-foreground" htmlFor="ai-analysis-prompt-template">
                分析指令模板（Prompt）
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={resetAnalysisPromptTemplate}
              >
                恢复默认
              </Button>
            </div>
            <p className="shrink-0 text-xs leading-relaxed text-muted-foreground">
              作为发送给模型的分析指令；可与上方「补充说明」组合。修改后自动保存在本机浏览器。
            </p>
            <textarea
              id="ai-analysis-prompt-template"
              className="min-h-[120px] w-full flex-1 resize-none overflow-y-auto rounded-lg border-0 bg-background/55 p-3 font-mono text-xs shadow-sm ring-1 ring-inset ring-foreground/10 focus:outline-none focus:ring-2 focus:ring-ring dark:ring-white/10 placeholder:text-muted-foreground/60"
              placeholder="编辑 AI 分析指令..."
              value={analysisPromptTemplate}
              onChange={(e) => setAnalysisPromptTemplate(e.target.value)}
              spellCheck={false}
            />
          </div>

            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 bg-muted/25 px-4 py-3 sm:px-5">
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

        {/* 右栏：顶栏固定；日志固定高；报告区 flex 滚动；人工审阅贴底 */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col gap-0 rounded-t-xl bg-[#1a1a2e] border border-b-0 border-border/20">
            <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Terminal className="h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden />
                <span className="truncate font-mono text-sm text-slate-300">AI 需求分析终端</span>
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                {state.reportText.trim().length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-1.5 text-xs text-violet-300 hover:bg-violet-500/15 hover:text-violet-100"
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
                      className="h-9 gap-1.5 text-xs text-slate-300 hover:bg-slate-700/50 hover:text-slate-100"
                      onClick={() => void handleExportXmind()}
                    >
                      {exportingXmind ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Waypoints className="h-3.5 w-3.5" />
                      )}
                      导出 XMind
                    </Button>
                  </>
                )}
                {!autoScroll && (
                  <button
                    type="button"
                    className="text-[11px] text-amber-400 hover:underline"
                    onClick={() => setAutoScroll(true)}
                  >
                    恢复自动滚动
                  </button>
                )}
                <StatusBadge status={state.status} labelOverride={terminalBadgeLabel} />
                {state.reportText.trim().length > 0 && (
                  <>
                    <div className="mx-1 hidden h-6 w-px bg-border/40 sm:block" aria-hidden />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 rounded border-border/50 bg-transparent px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800/80"
                      onClick={copyAnalysisReport}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制文本
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 rounded border-border/50 bg-transparent px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800/80"
                      onClick={handlePrintAnalysisReport}
                    >
                      <Printer className="h-3.5 w-3.5" />
                      打印
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={exportingPdf || exportingXmind}
                      className="h-9 gap-1.5 rounded bg-[#2563EB] px-4 text-sm font-bold text-white shadow-md hover:bg-[#1D4ED8] disabled:opacity-60"
                      onClick={() => void handleExportAnalysisPdf()}
                    >
                      {exportingPdf ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      导出 PDF
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl border border-border/20 border-t-0 bg-[#0d0d1a] lg:rounded-br-xl">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/20 px-4 py-2">
              <span className="text-xs font-medium text-slate-500">分析日志</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-slate-400 hover:text-red-400"
                disabled={state.logs.length === 0}
                onClick={() => dispatch({ type: 'CLEAR_LOGS' })}
              >
                清空日志
              </Button>
            </div>
            <div
              ref={logContainerRef}
              onScroll={handleLogScroll}
              className="ai-analysis-panel-scroll h-[100px] shrink-0 space-y-0.5 overflow-y-auto overscroll-contain px-4 py-2"
            >
              {state.logs.length === 0 && (
                <div className="py-6 text-center font-mono text-[12px] leading-[1.5] text-slate-500">
                  等待操作或开始分析…
                </div>
              )}
              {state.logs.map((log) => (
                <LogLine key={log.id} entry={log} />
              ))}
            </div>

            {/* 报告滚动区 + 底部审阅：同一列内 flex，审阅条永远贴在右栏底部 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border/20 bg-[#111125]/80">
              <div
                className="ai-analysis-report-scroll box-border min-h-0 max-h-[calc(100dvh-220px)] flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-6 py-3 [scrollbar-gutter:stable] select-text sm:px-6"
                data-testid="ai-analysis-report-panel"
              >
                {isAnalyzingStream && !state.reportText.trim() ? (
                  <div className="flex min-h-[140px] flex-col justify-center py-10 text-center text-xs text-slate-500">
                    报告内容将在此处流式输出…
                  </div>
                ) : state.reportText.trim() ? (
                  <>
                    <div className="mb-4 shrink-0">
                      <h3 className="border-b-2 border-[#3B82F6] pb-2 text-[20px] font-bold leading-tight text-white">
                        需求文档分析报告
                      </h3>
                    </div>
                    <div
                      ref={reportMarkdownRef}
                      data-testid="ai-analysis-report-markdown"
                      className="ai-analysis-print-root min-w-0 max-w-full pb-1"
                    >
                      <AnalysisMarkdownReport text={state.reportText} className="break-words [word-break:break-word]" />
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-600">完成分析后，报告将显示在此区域</div>
                )}
              </div>

              {(showReviewArea || showApprovedOnly) && (
                <div className="shrink-0 border-t border-[#475569] bg-[#0d0d1a] p-4">
                  {state.status === 'approved' ? (
                    <div className="space-y-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-green-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="text-sm font-medium">需求分析已通过</span>
                      </div>
                      <p className="text-xs text-slate-500">可继续生成测试用例或重新分析</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                        type="button"
                        onClick={() => dispatch({ type: 'RESET' })}
                      >
                        清空并重置
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h4 className="mb-3 flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                        <User className="h-4 w-4 text-muted-foreground" />
                        人工审阅
                      </h4>
                      <textarea
                        rows={5}
                        className="min-h-[120px] w-full resize-y overflow-y-auto rounded border-0 bg-[#1a1a2e] p-3 text-sm leading-relaxed text-slate-200 shadow-sm ring-1 ring-inset ring-white/10 placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="请输入修改意见…（Ctrl+Enter 提交）"
                        value={state.reviewText}
                        onChange={(e) => dispatch({ type: 'SET_REVIEW_TEXT', text: e.target.value })}
                        onKeyDown={handleReviewKeyDown}
                      />
                      <div className="mt-4 flex shrink-0 items-center gap-3">
                        <Button
                          className="h-11 flex-1 gap-2 rounded bg-orange-500 text-sm font-bold text-white shadow-md hover:bg-orange-600"
                          type="button"
                          onClick={() => void handleSubmitRevision()}
                        >
                          <ArrowRight className="h-4 w-4" />
                          提交修改意见
                        </Button>
                        <Button
                          className="h-11 flex-1 gap-2 rounded bg-emerald-600 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
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
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ai-analysis-panel-scroll {
          scrollbar-width: thin;
          scrollbar-color: #475569 #1e293b;
        }
        .ai-analysis-panel-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .ai-analysis-panel-scroll::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 3px;
        }
        .ai-analysis-panel-scroll::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
        .ai-analysis-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
        .ai-analysis-report-scroll {
          scrollbar-width: thin;
          scrollbar-color: #475569 #1e293b;
        }
        .ai-analysis-report-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .ai-analysis-report-scroll::-webkit-scrollbar-track {
          background: #1e293b;
          border-radius: 3px;
        }
        .ai-analysis-report-scroll::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
        .ai-analysis-report-scroll::-webkit-scrollbar-thumb:hover {
          background: #64748b;
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
