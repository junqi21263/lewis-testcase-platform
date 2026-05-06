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
  Circle,
  Square,
  User,
  ArrowRight,
  X,
  Copy,
  Trash2,
  ChevronDown,
  ChevronUp,
  WifiOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { filesApi } from '@/api/files'
import { aiApi } from '@/api/ai'
import type { AIModel, UploadedFile } from '@/types'
import { safeRandomUUID } from '@/utils/uuid'
import { useChunkedUpload } from '@/hooks/useChunkedUpload'

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
    default:
      return state
  }
}

const ANALYSIS_PROMPT = `请对以下需求文档进行详细的结构化分析，输出包含以下部分：

## 1. 主要功能需求
列出所有核心功能点，每条用加粗标注关键术语。

## 2. 非功能需求
包括性能、安全、可用性、兼容性等方面的要求。

## 3. 接口需求
列出需要的 API 接口，包含方法、路径和简要说明。

## 4. 数据模型
列出主要数据实体及其关键字段。

## 5. 风险与建议
标注高/中/低风险项，并给出可行建议。

请用 Markdown 格式输出，层次清晰、内容完整。`

const POLL_INTERVAL_MS = 1000
const POLL_MAX_ROUNDS = 120

function nowTime(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
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

function mapParseStageMessage(stage: string | null | undefined): { icon: LogEntry['icon']; text: string } {
  const s = stage ?? 'PENDING'
  switch (s) {
    case 'PENDING':
      return { icon: 'loading', text: '📄 文件上传成功，等待解析...' }
    case 'CLAIMED':
      return { icon: 'loading', text: '📝 开始解析文档...' }
    case 'FILE_OK':
      return { icon: 'success', text: '✅ 文件读取成功' }
    case 'PDF':
      return { icon: 'loading', text: '📄 正在提取 PDF 文本...' }
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
    case 'DONE':
      return { icon: 'success', text: '✅ 解析完成' }
    case 'FAILED':
      return { icon: 'error', text: '❌ 解析失败' }
    case 'CANCELLED':
      return { icon: 'error', text: '❌ 已取消解析' }
    default:
      return { icon: 'loading', text: `📄 解析阶段：${s}` }
  }
}

/* ──────────────────── 子组件 ──────────────────────── */

function TrafficLights() {
  return (
    <div className="flex items-center gap-1.5">
      <Circle className="w-3 h-3 fill-red-500 text-red-500" />
      <Circle className="w-3 h-3 fill-yellow-400 text-yellow-400" />
      <Circle className="w-3 h-3 fill-green-500 text-green-500" />
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
    idle: { label: '等待上传', cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    uploading: { label: '上传中', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse' },
    parsing: { label: '解析中...', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse' },
    analyzing: { label: '分析中...', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse' },
    review: { label: '等待审阅', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    approved: { label: '已通过', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    error: { label: '分析失败', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  }
  const { label, cls } = map[status]
  return (
    <Badge variant="outline" className={`text-xs border ${cls}`}>
      {labelOverride ?? label}
    </Badge>
  )
}

function LogLine({ entry }: { entry: LogEntry }) {
  const iconMap = {
    loading: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />,
  }
  return (
    <div className="flex items-start gap-2.5 text-sm leading-relaxed font-mono py-0.5 animate-[fadeIn_0.3s_ease-out]">
      {iconMap[entry.icon]}
      <span className="text-gray-500 flex-shrink-0">[{entry.timestamp}]</span>
      <span className="text-gray-300 whitespace-pre-wrap break-words">{entry.text}</span>
    </div>
  )
}

function MarkdownReport({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm leading-[1.7] font-mono">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />

        if (trimmed.startsWith('## ')) {
          return (
            <h3
              key={i}
              className="text-base font-bold text-foreground mt-4 mb-1 border-b border-border/30 pb-1"
            >
              {trimmed.slice(3)}
            </h3>
          )
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1">
              {trimmed.slice(4)}
            </h4>
          )
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          return (
            <p key={i} className="text-foreground font-semibold">
              {trimmed.slice(2, -2)}
            </p>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed
            .slice(2)
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-primary flex-shrink-0">•</span>
              <span className="text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          )
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const content = trimmed
            .replace(/^\d+\.\s/, '')
            .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
          const num = trimmed.match(/^(\d+)\./)?.[1]
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-primary flex-shrink-0 font-semibold">{num}.</span>
              <span className="text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          )
        }
        const content = trimmed.replace(
          /\*\*(.+?)\*\*/g,
          '<strong class="text-foreground font-semibold">$1</strong>',
        )
        return <p key={i} className="text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
      })}
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
  const [state, dispatch] = useReducer(pageReducer, initialPageState)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [requirementText, setRequirementText] = useState('')
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

  const logContainerRef = useRef<HTMLDivElement>(null)
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

  const copyLogs = useCallback(() => {
    const text = state.logs.map((l) => `[${l.timestamp}] ${l.text}`).join('\n')
    void navigator.clipboard.writeText(text).then(
      () => toast.success('日志已复制'),
      () => toast.error('复制失败'),
    )
  }, [state.logs])

  const pollUntilParsed = useCallback(
    async (fileId: string, signal: AbortSignal): Promise<UploadedFile> => {
      let lastStage: string | undefined
      for (let i = 0; i < POLL_MAX_ROUNDS; i++) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        await sleep(POLL_INTERVAL_MS)
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        const f = await filesApi.getFileById(fileId)
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

      addLog('loading', `📤 正在上传：${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)

      try {
        const result = await uploadFile(file)
        if (signal.aborted) return

        setUploadedFile(result)
        setParsePreviewDirty(false)
        setEditedParsedText(result.parsedContent ?? '')
        addLog('success', `✅ 文件上传成功，服务端文件 ID：${result.id}`)

        if (result.status === 'PARSED') {
          const n = result.parsedContent?.length ?? 0
          addLog('success', `✅ 文档解析完成 (${n.toLocaleString()} 字符)`)
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
          return
        }

        dispatch({ type: 'UPLOAD_DONE' })
        addLog('loading', '📄 正在等待服务端解析文档（OCR / 文本提取）...')

        const parsed = await pollUntilParsed(result.id, signal)
        if (signal.aborted) return

        setUploadedFile(parsed)

        if (parsed.status === 'PARSED') {
          setEditedParsedText(parsed.parsedContent ?? '')
          dispatch({ type: 'GO_IDLE' })
          void loadFileHistory()
        } else {
          addLog('error', `❌ 文档解析失败：${parsed.parseError ?? '未知错误'}`)
          dispatch({
            type: 'ERROR',
            log: makeLog('error', parsed.parseError ?? '解析失败'),
          })
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          addLog('loading', '⏹ 已取消上传/解析')
          dispatch({ type: 'STOP_TO_IDLE' })
          setUploadedFile(null)
          return
        }
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
      const file = e.dataTransfer.files[0]
      if (file) void handleFileSelect(file)
    },
    [handleFileSelect],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void handleFileSelect(file)
      e.target.value = ''
    },
    [handleFileSelect],
  )

  const handleRemoveFile = useCallback(() => {
    operationAbortRef.current?.abort()
    abortUpload()
    setUploadedFile(null)
    setEditedParsedText('')
    setParsePreviewDirty(false)
    dispatch({ type: 'RESET' })
  }, [abortUpload])

  const selectHistoryFile = useCallback((f: UploadedFile) => {
    setUploadedFile(f)
    setEditedParsedText(f.parsedContent ?? '')
    setParsePreviewDirty(false)
    setPreviewEditable(false)
    dispatch({ type: 'GO_IDLE' })
    if (f.status === 'PARSED') {
      toast.success(`已选择：${f.originalName}`)
    } else {
      toast('该文件尚未解析完成', { icon: 'ℹ️' })
    }
  }, [])

  const deleteHistoryFile = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await filesApi.deleteFile(id)
        setFileHistory((prev) => prev.filter((x) => x.id !== id))
        if (uploadedFile?.id === id) {
          setUploadedFile(null)
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
      ? `${ANALYSIS_PROMPT}\n\n用户补充说明：\n${requirementText}`
      : ANALYSIS_PROMPT
    return base
  }, [requirementText])

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

      const useText =
        parsePreviewDirty && editedParsedText.trim().length > 0 && uploadedFile?.status === 'PARSED'

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
            (chunk) => {
              dispatch({ type: 'APPEND_REPORT', chunk })
            },
            () => {
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
            (err) => {
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
      parsePreviewDirty,
      editedParsedText,
      humanReview,
      addLog,
      selectedModelId,
      makeLog,
    ],
  )

  const handleStartAnalysis = useCallback(async () => {
    if (!uploadedFile || uploadedFile.status !== 'PARSED') {
      toast.error('请先上传并等待文档解析完成')
      return
    }
    await runAnalyzeStream(buildCustomPrompt(), false)
  }, [uploadedFile, buildCustomPrompt, runAnalyzeStream])

  const handleSubmitRevision = useCallback(async () => {
    if (!state.reviewText.trim()) {
      toast.error('请输入修改意见')
      return
    }
    if (!uploadedFile) return

    const revisionPrompt = `${ANALYSIS_PROMPT}

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
  }, [state.reviewText, state.reportText, uploadedFile, requirementText, runAnalyzeStream])

  const executeStop = useCallback(async () => {
    setConfirmStopOpen(false)
    operationAbortRef.current?.abort()
    abortUpload()
    streamAbortRef.current?.abort()

    const fid = uploadedFile?.id
    if (
      fid &&
      uploadedFile &&
      (uploadedFile.status === 'PENDING' || uploadedFile.status === 'PARSING')
    ) {
      try {
        await filesApi.cancelTask(fid)
      } catch {
        /* 可能已结束 */
      }
      setUploadedFile(null)
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
  }, [abortUpload, uploadedFile, addLog, state.status, loadFileHistory])

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

  const canStartAnalysis = Boolean(uploadedFile && uploadedFile.status === 'PARSED')
  const isIdle = state.status === 'idle' || state.status === 'error'
  const showStartButton = isIdle && canStartAnalysis
  const showReviewArea = humanReview && (state.status === 'review' || state.status === 'approved')
  const showApprovedOnly = !humanReview && state.status === 'approved'
  const isUploadingOrParsing = state.status === 'uploading' || state.status === 'parsing'
  const busy =
    state.status === 'uploading' || state.status === 'parsing' || state.status === 'analyzing'

  const terminalBadgeLabel =
    state.status === 'idle' && canStartAnalysis ? '就绪' : undefined

  return (
    <div className="w-full min-w-0 max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 pb-8 space-y-5">
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
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          当前离线，请检查网络连接
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            AI 需求分析
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            上传需求文档，AI 自动解析并生成结构化需求分析报告；大文件自动分片上传，支持解析阶段追踪与任务取消
          </p>
        </div>
        {modelInfo && (
          <Badge
            variant="outline"
            className="text-xs border-primary/30 text-primary bg-primary/5 flex-shrink-0"
          >
            模型：{modelInfo.name}
          </Badge>
        )}
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-sm text-blue-700 dark:text-blue-300">
        <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-medium">使用说明</p>
          <p className="text-xs opacity-80">
            关闭「人工审阅」时，分析结束后将自动标记为通过。编辑「解析文本」后，将优先使用编辑后的文本作为分析输入。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 min-h-[600px]">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">需求文档</label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xlsx,.xls,.txt,.md,.yaml,.yml,.png,.jpg,.jpeg"
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
                  PDF / Word / Excel / TXT / MD / YAML / 图片 · 单文件 ≤ 100MB · 大于 5MB 自动分片
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <FileText className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-green-300 truncate">{uploadedFile.originalName}</p>
                  <p className="text-xs text-green-400/60">
                    {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB ·{' '}
                    {uploadedFile.status === 'PARSED'
                      ? '解析完成'
                      : uploadedFile.status === 'PARSING'
                        ? `解析中 ${uploadedFile.parseStage ?? ''}`
                        : uploadedFile.status}
                  </p>
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
                  <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                  正在解析… 已等待 {parseElapsed}s
                </div>
              </div>
            )}
          </div>

          {uploadedFile?.status === 'PARSED' && (
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
                  </div>
                  <textarea
                    readOnly={!previewEditable}
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

          {fileHistory.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">最近上传</label>
              <div className="max-h-[180px] overflow-y-auto rounded-lg border border-border/30 divide-y divide-border/20">
                {fileHistory.map((f) => (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectHistoryFile(f)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectHistoryFile(f)
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-muted/30 ${
                      uploadedFile?.id === f.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <span className="flex-1 truncate text-left">{f.originalName}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {formatRelative(f.createdAt)}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {f.status}
                    </Badge>
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-destructive"
                      aria-label="删除文件"
                      onClick={(ev) => void deleteHistoryFile(f.id, ev)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
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

          <div className="flex items-center gap-3 py-2">
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

        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-t-xl bg-[#1a1a2e] border border-b-0 border-border/20 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <TrafficLights />
              <span className="text-sm font-mono text-gray-300 truncate">AI 需求分析终端</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-gray-400 hover:text-gray-200"
                onClick={copyLogs}
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                复制日志
              </Button>
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
            </div>
          </div>

          <div className="flex-1 rounded-b-xl border border-border/20 bg-[#0d0d1a] overflow-hidden flex flex-col min-h-[550px]">
            <div
              ref={logContainerRef}
              onScroll={handleLogScroll}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 min-h-[120px] max-h-[220px]"
            >
              {state.logs.length === 0 && (
                <div className="text-sm text-gray-500 font-mono py-4 text-center">
                  等待操作或开始分析…
                </div>
              )}
              {state.logs.map((log) => (
                <LogLine key={log.id} entry={log} />
              ))}
            </div>

            {state.reportText && (
              <div className="px-4 py-3 border-t border-border/20 bg-[#111125]/80 max-h-[360px] overflow-y-auto">
                <div className="mb-3">
                  <h3 className="text-lg font-bold text-foreground border-b border-border/40 pb-2">
                    需求文档分析报告
                  </h3>
                </div>
                <MarkdownReport text={state.reportText} />
              </div>
            )}

            {(showReviewArea || showApprovedOnly) && (
              <div className="px-4 py-4 border-t border-border/20 bg-[#0d0d1a]">
                {state.status === 'approved' ? (
                  <div className="text-center py-3 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-green-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">需求分析已通过</span>
                    </div>
                    <p className="text-xs text-gray-500">可继续生成测试用例或重新分析</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 mt-2 border-primary/30 text-primary hover:bg-primary/10"
                      type="button"
                      onClick={() => dispatch({ type: 'RESET' })}
                    >
                      清空并重置
                    </Button>
                  </div>
                ) : (
                  <>
                    <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      人工审阅
                    </h4>
                    <textarea
                      className="w-full h-[72px] p-3 text-sm border-0 rounded-lg bg-[#1a1a2e] shadow-sm ring-1 ring-inset ring-white/10 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-gray-500 text-gray-300"
                      placeholder={`请输入修改意见…（Ctrl+Enter 提交）`}
                      value={state.reviewText}
                      onChange={(e) => dispatch({ type: 'SET_REVIEW_TEXT', text: e.target.value })}
                      onKeyDown={handleReviewKeyDown}
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        className="flex-1 h-10 text-sm font-medium gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-md"
                        type="button"
                        onClick={() => void handleSubmitRevision()}
                      >
                        <ArrowRight className="w-4 h-4" />
                        提交修改意见
                      </Button>
                      <Button
                        className="flex-1 h-10 text-sm font-medium gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-md"
                        type="button"
                        onClick={handleApprove}
                      >
                        <CheckCircle2 className="w-4 h-4" />
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

      <style>{`
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
