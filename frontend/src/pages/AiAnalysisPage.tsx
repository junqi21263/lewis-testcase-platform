/**
 * AiAnalysisPage —— AI 需求分析全流程
 * 左右分栏：左侧操作区（上传文档、描述、开关、按钮）| 右侧输出区（终端日志 + 结构化报告 + 人工审阅）
 *
 * 功能：
 * 1. 真实文件上传（filesApi.upload）
 * 2. 真实大模型流式分析（aiApi.generateStream）
 * 3. 人工审阅 + 迭代修订
 */

import { useState, useCallback, useRef, useEffect, useReducer } from 'react'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { filesApi } from '@/api/files'
import { aiApi } from '@/api/ai'
import type { AIModel, UploadedFile } from '@/types'

/* ──────────────────────── 类型定义 ──────────────────────── */

type AnalysisStatus = 'idle' | 'uploading' | 'parsing' | 'analyzing' | 'review' | 'approved' | 'error'

interface LogEntry {
  id: string
  icon: 'loading' | 'success' | 'error'
  text: string
}

interface State {
  status: AnalysisStatus
  logs: LogEntry[]
  reportText: string
  reviewText: string
  revisionCount: number
}

type Action =
  | { type: 'START_UPLOAD' }
  | { type: 'UPLOAD_DONE' }
  | { type: 'START_PARSE' }
  | { type: 'START_ANALYSIS' }
  | { type: 'ADD_LOG'; log: LogEntry }
  | { type: 'APPEND_REPORT'; chunk: string }
  | { type: 'SET_REPORT'; text: string }
  | { type: 'SET_REVIEW_TEXT'; text: string }
  | { type: 'REVIEW' }
  | { type: 'APPROVE' }
  | { type: 'STOP' }
  | { type: 'ERROR'; log: LogEntry }
  | { type: 'RESET' }
  | { type: 'GO_IDLE' }

const initialState: State = {
  status: 'idle',
  logs: [],
  reportText: '',
  reviewText: '',
  revisionCount: 0,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START_UPLOAD':
      return { ...state, status: 'uploading', logs: [], reportText: '', reviewText: '' }
    case 'UPLOAD_DONE':
      return { ...state, status: 'parsing' }
    case 'START_PARSE':
      return state
    case 'START_ANALYSIS':
      return { ...state, status: 'analyzing', logs: [], reportText: '', reviewText: '' }
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.log] }
    case 'APPEND_REPORT':
      return { ...state, reportText: state.reportText + action.chunk }
    case 'SET_REPORT':
      // reportText 已通过 APPEND_REPORT 累积，此处仅切换状态
      return { ...state, status: 'review' }
    case 'SET_REVIEW_TEXT':
      return { ...state, reviewText: action.text }
    case 'REVIEW':
      return { ...state, status: 'analyzing', logs: [], reportText: '', revisionCount: state.revisionCount + 1 }
    case 'APPROVE':
      return { ...state, status: 'approved' }
    case 'STOP':
      return initialState
    case 'ERROR':
      return { ...state, logs: [...state.logs, action.log], status: 'error' }
    case 'RESET':
      return initialState
    case 'GO_IDLE':
      return { ...state, status: 'idle' }
    default:
      return state
  }
}

/* ──────────────────────── 常量 ──────────────────────── */

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

/* ──────────────────── 子组件 ──────────────────────── */

/** 终端风格状态指示灯 */
function TrafficLights() {
  return (
    <div className="flex items-center gap-1.5">
      <Circle className="w-3 h-3 fill-red-500 text-red-500" />
      <Circle className="w-3 h-3 fill-yellow-400 text-yellow-400" />
      <Circle className="w-3 h-3 fill-green-500 text-green-500" />
    </div>
  )
}

/** 状态标签 */
function StatusBadge({ status }: { status: AnalysisStatus }) {
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
  return <Badge variant="outline" className={`text-xs border ${cls}`}>{label}</Badge>
}

/** 日志条目 */
function LogLine({ entry }: { entry: LogEntry }) {
  const iconMap = {
    loading: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />,
  }
  return (
    <div className="flex items-start gap-2.5 text-sm leading-relaxed font-mono py-0.5 animate-[fadeIn_0.3s_ease-out]">
      {iconMap[entry.icon]}
      <span className="text-gray-300 whitespace-pre-wrap break-words">{entry.text}</span>
    </div>
  )
}

/** Markdown 简易渲染器（终端风格） */
function MarkdownReport({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm leading-[1.7] font-mono">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />

        // H2
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="text-base font-bold text-foreground mt-4 mb-1 border-b border-border/30 pb-1">
              {trimmed.slice(3)}
            </h3>
          )
        }
        // H3
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1">
              {trimmed.slice(4)}
            </h4>
          )
        }
        // Bold line
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
          return (
            <p key={i} className="text-foreground font-semibold">{trimmed.slice(2, -2)}</p>
          )
        }
        // List item
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-primary flex-shrink-0">•</span>
              <span className="text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          )
        }
        // Numbered list
        if (/^\d+\.\s/.test(trimmed)) {
          const content = trimmed.replace(/^\d+\.\s/, '').replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
          const num = trimmed.match(/^(\d+)\./)?.[1]
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-primary flex-shrink-0 font-semibold">{num}.</span>
              <span className="text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
            </div>
          )
        }
        // Normal text with bold
        const content = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
        return (
          <p key={i} className="text-gray-300" dangerouslySetInnerHTML={{ __html: content }} />
        )
      })}
    </div>
  )
}

/* ──────────────────── 主组件 ──────────────────── */

export default function AiAnalysisPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [requirementText, setRequirementText] = useState('')
  const [humanReview, setHumanReview] = useState(true)
  const [modelInfo, setModelInfo] = useState<AIModel | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>()

  const logContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 获取默认模型信息
  useEffect(() => {
    aiApi.getModels().then((models) => {
      const def = models.find((m) => m.isDefault) ?? models[0]
      if (def) {
        setModelInfo(def)
        setSelectedModelId(def.id)
      }
    }).catch(() => {})
  }, [])

  // 自动滚动日志
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [state.logs, state.reportText])

  const addLog = useCallback((icon: LogEntry['icon'], text: string) => {
    dispatch({ type: 'ADD_LOG', log: { id: crypto.randomUUID(), icon, text } })
  }, [])

  /* ──────── 文件上传 ──────── */

  const handleFileSelect = useCallback(async (file: File) => {
    dispatch({ type: 'START_UPLOAD' })
    setUploadProgress(0)
    addLog('loading', `📤 正在上传文件：${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)

    try {
      const result = await filesApi.upload(file, (p) => setUploadProgress(p))
      setUploadedFile(result)
      addLog('success', `✅ 文件上传成功，服务端文件 ID：${result.id}`)

      // 轮询等待文件解析完成
      if (result.status !== 'PARSED') {
        dispatch({ type: 'UPLOAD_DONE' })
        addLog('loading', '📄 正在等待服务端解析文档（OCR / 文本提取）...')

        const parsed = await pollUntilParsed(result.id)
        if (parsed.status === 'PARSED') {
          setUploadedFile(parsed)
          const charCount = parsed.parsedContent?.length ?? 0
          addLog('success', `✅ 文档解析完成 (${charCount.toLocaleString()} 字符)`)
          dispatch({ type: 'GO_IDLE' })
        } else {
          addLog('error', '❌ 文档解析失败，请重新上传')
          dispatch({ type: 'ERROR', log: { id: crypto.randomUUID(), icon: 'error', text: '文档解析失败' } })
        }
      } else {
        const charCount = result.parsedContent?.length ?? 0
        addLog('success', `✅ 文档解析完成 (${charCount.toLocaleString()} 字符)`)
      }
    } catch {
      addLog('error', '❌ 文件上传失败，请重试')
      dispatch({ type: 'ERROR', log: { id: crypto.randomUUID(), icon: 'error', text: '上传失败' } })
      toast.error('文件上传失败')
    }
  }, [addLog])

  /** 轮询文件解析状态 */
  const pollUntilParsed = async (fileId: string): Promise<UploadedFile> => {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const f = await filesApi.getFileById(fileId)
        if (f.status === 'PARSED' || f.status === 'FAILED') return f
      } catch {
        // 继续轮询
      }
    }
    // 超时返回最后状态
    try {
      return await filesApi.getFileById(fileId)
    } catch {
      throw new Error('轮询超时')
    }
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFileSelect(file)
  }, [handleFileSelect])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFileSelect(file)
    e.target.value = ''
  }, [handleFileSelect])

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null)
    dispatch({ type: 'STOP' })
  }, [])

  /* ──────── AI 分析 ──────── */

  const canStartAnalysis = Boolean(uploadedFile && uploadedFile.status === 'PARSED')
  const isIdle = state.status === 'idle' || state.status === 'error'

  const handleStartAnalysis = useCallback(async () => {
    if (!uploadedFile) {
      toast.error('请先上传文档')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'START_ANALYSIS' })
    addLog('loading', '🚀 开始需求分析...')
    addLog('loading', '🤖 正在调用 AI 模型进行需求归纳分析...')

    const customPrompt = requirementText.trim()
      ? `${ANALYSIS_PROMPT}\n\n用户补充说明：\n${requirementText}`
      : ANALYSIS_PROMPT

    try {
      await new Promise<void>((resolve, reject) => {
        aiApi.generateStream(
          {
            sourceType: 'file',
            fileId: uploadedFile.id,
            customPrompt,
            stream: true,
            modelConfigId: selectedModelId,
          },
          (chunk) => {
            dispatch({ type: 'APPEND_REPORT', chunk })
          },
          (_meta) => {
            addLog('success', '✅ AI 需求分析完成，请审阅下方内容。您可以输入修改意见，或点击「确认通过」继续。')
            dispatch({ type: 'SET_REPORT', text: '' }) // 触发状态变为 review，reportText 已在 APPEND_REPORT 中累积
            // 实际上需要把 reportText 保留在 state 中
            resolve()
          },
          (err) => {
            addLog('error', `❌ 分析失败：${err.message}`)
            dispatch({ type: 'ERROR', log: { id: crypto.randomUUID(), icon: 'error', text: err.message } })
            reject(err)
          },
        )
      })
    } catch {
      // 错误已在 onError 中处理
    }
  }, [uploadedFile, requirementText, addLog])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'STOP' })
    toast('已停止分析', { icon: '⏹' })
  }, [])

  const handleSubmitRevision = useCallback(async () => {
    if (!state.reviewText.trim()) {
      toast.error('请输入修改意见')
      return
    }
    if (!uploadedFile) return

    abortRef.current?.abort()
    dispatch({ type: 'REVIEW' })

    const controller = new AbortController()
    abortRef.current = controller

    const revisionPrompt = `${ANALYSIS_PROMPT}

以下是上一轮分析结果：
---
${state.reportText}
---

用户修改意见：${state.reviewText}

请根据修改意见重新分析并改进报告。`

    addLog('loading', '🔄 正在根据修改意见重新分析...')

    try {
      await new Promise<void>((resolve, reject) => {
        aiApi.generateStream(
          {
            sourceType: 'file',
            fileId: uploadedFile.id,
            customPrompt: revisionPrompt,
            stream: true,
            modelConfigId: selectedModelId,
          },
          (chunk) => {
            dispatch({ type: 'APPEND_REPORT', chunk })
          },
          () => {
            addLog('success', '✅ 修订完成，请再次审阅。')
            dispatch({ type: 'SET_REPORT', text: '' })
            resolve()
          },
          (err) => {
            addLog('error', `❌ 修订失败：${err.message}`)
            dispatch({ type: 'ERROR', log: { id: crypto.randomUUID(), icon: 'error', text: err.message } })
            reject(err)
          },
        )
      })
    } catch {
      // handled
    }
  }, [uploadedFile, state.reviewText, state.reportText, addLog])

  const handleApprove = useCallback(() => {
    dispatch({ type: 'APPROVE' })
    toast.success('需求分析已通过，可继续深度分析或生成用例')
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

  // 实际状态判断：上传/解析完成后回到 idle 让用户点开始分析
  const showStartButton = isIdle && canStartAnalysis
  const showAnalyzing = state.status === 'analyzing'
  const showReviewArea = state.status === 'review' || state.status === 'approved'
  const isUploadingOrParsing = state.status === 'uploading' || state.status === 'parsing'

  return (
    <div className="w-full min-w-0 max-w-[1600px] mx-auto px-3 sm:px-4 md:px-6 pb-8 space-y-5">
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            AI 需求分析
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            上传需求文档，AI 自动解析并生成结构化需求分析报告，支持人工审阅与迭代修订
          </p>
        </div>
        {modelInfo && (
          <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/5 flex-shrink-0">
            模型：{modelInfo.name}
          </Badge>
        )}
      </div>

      {/* 使用说明 */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-sm text-blue-700 dark:text-blue-300">
        <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-medium">使用说明</p>
          <p className="text-xs opacity-80">
            上传需求文档，AI 将自动解析文档内容并生成结构化的需求分析报告。
            分析完成后可进行人工审阅，输入修改意见后 AI 将根据反馈迭代优化报告，满意后点击「确认通过」继续。
            使用的是系统设置中配置的 AI 模型。
          </p>
        </div>
      </div>

      {/* ──────────── 左右分栏 ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 min-h-[600px]">
        {/* ──────── 左侧操作区 ──────── */}
        <div className="space-y-4">
          {/* 需求文档上传 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">需求文档</label>

            {/* 隐藏的 file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.xlsx,.txt,.md,.yaml,.yml,.png,.jpg,.jpeg"
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
                <p className="text-[11px] text-muted-foreground/60 mt-1">支持 PDF / Word / Excel / TXT / MD / 图片</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <FileText className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-green-300 truncate">{uploadedFile.originalName}</p>
                  <p className="text-xs text-green-400/60">
                    {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB · {uploadedFile.status === 'PARSED' ? '解析完成' : uploadedFile.status === 'PARSING' ? '解析中...' : uploadedFile.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="text-green-400/60 hover:text-green-300 transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 上传进度 */}
            {state.status === 'uploading' && uploadProgress > 0 && (
              <div className="space-y-1">
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
              </div>
            )}

            {/* 解析中提示 */}
            {state.status === 'parsing' && (
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在等待服务端解析文档（OCR / 文本提取可能需要一段时间）...
              </div>
            )}
          </div>

          {/* 需求描述/补充说明 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">需求描述/补充说明</label>
            <textarea
              className="w-full h-[80px] p-3 text-sm border-0 rounded-lg bg-background/55 shadow-sm ring-1 ring-inset ring-foreground/10 dark:ring-white/10 resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
              placeholder="在此输入需求背景、业务描述或补充说明..."
              value={requirementText}
              onChange={(e) => setRequirementText(e.target.value)}
            />
          </div>

          {/* 人工审阅开关 */}
          <div className="flex items-center gap-3 py-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">人工审阅</span>
            <button
              type="button"
              role="switch"
              aria-checked={humanReview}
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

          {/* 操作按钮组 */}
          <div className="space-y-2 pt-2">
            {showStartButton && (
              <Button
                className="w-full h-11 text-sm font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-purple-500/20"
                onClick={handleStartAnalysis}
              >
                <Brain className="w-4 h-4" />
                开始分析
              </Button>
            )}
            {showAnalyzing && (
              <>
                <Button
                  className="w-full h-11 text-sm font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white opacity-70 cursor-not-allowed"
                  disabled
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  分析中...
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10 text-sm font-medium gap-2 border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 hover:text-red-300"
                  onClick={handleStop}
                >
                  <Square className="w-3.5 h-3.5" />
                  停止分析
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

        {/* ──────── 右侧输出区 ──────── */}
        <div className="flex flex-col">
          {/* 终端标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 rounded-t-xl bg-[#1a1a2e] border border-b-0 border-border/20">
            <div className="flex items-center gap-3">
              <TrafficLights />
              <span className="text-sm font-mono text-gray-300">AI 需求分析终端</span>
            </div>
            <StatusBadge status={state.status} />
          </div>

          {/* 终端内容区 */}
          <div className="flex-1 rounded-b-xl border border-border/20 bg-[#0d0d1a] overflow-hidden flex flex-col min-h-[550px]">
            {/* 日志区域 */}
            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 min-h-[120px] max-h-[220px]"
            >
              {state.logs.length === 0 && (
                <div className="text-sm text-gray-500 font-mono py-4 text-center">
                  等待开始分析...
                </div>
              )}
              {state.logs.map((log) => (
                <LogLine key={log.id} entry={log} />
              ))}
            </div>

            {/* 结构化报告 */}
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

            {/* 人工审阅交互区 */}
            {showReviewArea && (
              <div className="px-4 py-4 border-t border-border/20 bg-[#0d0d1a]">
                {state.status === 'approved' ? (
                  <div className="text-center py-3 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-green-400">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">需求分析已通过</span>
                    </div>
                    <p className="text-xs text-gray-500">可以继续进行深度分析或跳转生成测试用例</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 mt-2 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => dispatch({ type: 'RESET' })}
                    >
                      重新分析
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
                      placeholder={`请输入您的修改意见，例如：\n'请补充关于性能指标的分析' 或 '第3点描述不准确，应该改为...'`}
                      value={state.reviewText}
                      onChange={(e) => dispatch({ type: 'SET_REVIEW_TEXT', text: e.target.value })}
                      onKeyDown={handleReviewKeyDown}
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        className="flex-1 h-10 text-sm font-medium gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white shadow-md"
                        onClick={() => void handleSubmitRevision()}
                      >
                        <ArrowRight className="w-4 h-4" />
                        提交修改意见 (Ctrl+Enter)
                      </Button>
                      <Button
                        className="flex-1 h-10 text-sm font-medium gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-md"
                        onClick={handleApprove}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        确认通过
                      </Button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 text-center">
                      对 AI 分析结果满意？点击「确认通过」继续深度分析 | 不满意？输入意见后 AI 将重新修改
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* fadeIn animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
