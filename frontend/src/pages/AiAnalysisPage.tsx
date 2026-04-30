/**
 * AiAnalysisPage —— AI 需求分析全流程
 * 左右分栏：左侧操作区（上传/选择文档、描述、开关、按钮）| 右侧输出区（终端日志 + 结构化报告 + 人工审阅）
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
  ChevronDown,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/* ──────────────────────── 类型定义 ──────────────────────── */

type AnalysisStatus = 'idle' | 'uploading' | 'analyzing' | 'review' | 'approved' | 'error'

interface LogEntry {
  id: string
  icon: 'loading' | 'success' | 'error'
  text: string
}

interface AnalysisReport {
  title: string
  sections: { heading: string; items: string[] }[]
}

interface State {
  status: AnalysisStatus
  logs: LogEntry[]
  report: AnalysisReport | null
  reviewText: string
  revisionCount: number
}

type Action =
  | { type: 'START' }
  | { type: 'ADD_LOG'; log: LogEntry }
  | { type: 'SET_REPORT'; report: AnalysisReport }
  | { type: 'SET_REVIEW_TEXT'; text: string }
  | { type: 'REVIEW' }
  | { type: 'APPROVE' }
  | { type: 'STOP' }
  | { type: 'ERROR'; log: LogEntry }
  | { type: 'RESET' }

const initialState: State = {
  status: 'idle',
  logs: [],
  report: null,
  reviewText: '',
  revisionCount: 0,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      return { ...state, status: 'analyzing', logs: [], report: null, reviewText: '' }
    case 'ADD_LOG':
      return { ...state, logs: [...state.logs, action.log] }
    case 'SET_REPORT':
      return { ...state, report: action.report, reviewText: '', status: 'review' }
    case 'SET_REVIEW_TEXT':
      return { ...state, reviewText: action.text }
    case 'REVIEW':
      return { ...state, status: 'analyzing', revisionCount: state.revisionCount + 1 }
    case 'APPROVE':
      return { ...state, status: 'approved' }
    case 'STOP':
      return { ...initialState }
    case 'ERROR':
      return { ...state, logs: [...state.logs, action.log], status: 'error' }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

/* ──────────────────────── 模拟数据 ──────────────────────── */

const MOCK_PROJECTS = ['电商平台 v2.1', '内部 OA 系统', '移动端 App', '数据分析平台']

const MOCK_UPLOADED_FILES = [
  '用户管理需求文档.pdf',
  '订单流程设计.docx',
  '支付接口说明.md',
  '数据字典 v3.xlsx',
]

function generateMockReport(revision: number): AnalysisReport {
  const suffix = revision > 0 ? `（第 ${revision + 1} 次修订）` : ''
  return {
    title: `电商平台用户管理系统${suffix}`,
    sections: [
      {
        heading: '1. 主要功能需求',
        items: [
          `用户注册与登录：支持手机号、邮箱注册${suffix}`,
          '**多因素认证（MFA）**：短信验证码 + 邮箱验证双因子',
          '用户信息管理：头像、昵称、密码修改、绑定手机/邮箱',
          '**权限角色体系**：管理员 / 普通用户 / 访客三种角色',
          '操作审计日志：记录关键操作（登录、密码修改、权限变更）',
        ],
      },
      {
        heading: '2. 非功能需求',
        items: [
          '**性能**：登录接口响应时间 < 200ms（P99）',
          '**并发**：支持 5000 QPS 用户登录',
          '**安全**：密码 bcrypt 加密存储，登录失败 5 次锁定 30 分钟',
          '**可用性**：99.9% SLA，故障自动切换至备用节点',
        ],
      },
      {
        heading: '3. 接口需求',
        items: [
          'POST /api/auth/register — 用户注册',
          'POST /api/auth/login — 用户登录（返回 JWT）',
          'POST /api/auth/refresh — 刷新 Token',
          'GET /api/users/me — 获取当前用户信息',
          'PATCH /api/users/me — 更新用户信息',
        ],
      },
      {
        heading: '4. 数据模型',
        items: [
          '**users**：id, username, email, phone, password_hash, role, avatar_url, status, created_at',
          '**audit_logs**：id, user_id, action, target, ip_address, created_at',
          '**login_attempts**：id, user_id, ip, success, created_at',
        ],
      },
      {
        heading: '5. 风险与建议',
        items: [
          '**高风险**：手机号注册需对接短信网关，建议预留 2 周联调时间',
          '**中风险**：JWT 密钥轮换策略需提前设计',
          '**建议**：优先实现邮箱注册 + 登录，手机注册作为 P1 迭代',
        ],
      },
    ],
  }
}

/* ──────────────────── 模拟分析流程 ──────────────────── */

async function simulateAnalysis(
  dispatch: React.Dispatch<Action>,
  signal: AbortSignal,
  revision: number,
): Promise<void> {
  const logs = [
    { icon: 'loading' as const, text: '🚀 开始需求分析...' },
    { icon: 'loading' as const, text: '📄 正在解析上传的文档...' },
    { icon: 'success' as const, text: '✅ 文档解析完成 (12,480 字符)' },
    { icon: 'loading' as const, text: '📥 正在将文档存入向量数据库...' },
    { icon: 'success' as const, text: '✅ 向量数据库处理完成' },
    { icon: 'loading' as const, text: '🤖 AI 正在进行需求归纳分析...' },
    { icon: 'success' as const, text: '✅ AI 需求归纳已输出，请审阅下方内容。您可以输入修改意见，或点击「确认通过」继续。' },
  ]

  for (let i = 0; i < logs.length; i++) {
    if (signal.aborted) return
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 800))
    dispatch({
      type: 'ADD_LOG',
      log: { id: crypto.randomUUID(), ...logs[i] },
    })
  }

  await new Promise((r) => setTimeout(r, 500))
  if (!signal.aborted) {
    dispatch({ type: 'SET_REPORT', report: generateMockReport(revision) })
  }
}

/* ──────────────────────── 子组件 ──────────────────────── */

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
    uploading: { label: '上传中', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
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
      <span className="text-gray-300">{entry.text}</span>
    </div>
  )
}

/** 结构化报告 */
function AnalysisReport({ report }: { report: AnalysisReport }) {
  return (
    <div className="mt-4 space-y-5 text-sm leading-[1.6]">
      <h3 className="text-lg font-bold text-foreground border-b border-border/40 pb-2">
        需求文档分析摘要：{report.title}
      </h3>
      {report.sections.map((sec) => (
        <div key={sec.heading} className="space-y-2">
          <h4 className="font-semibold text-foreground">{sec.heading}</h4>
          <ul className="space-y-1.5 pl-4">
            {sec.items.map((item, i) => (
              <li key={i} className="text-gray-300 list-disc">
                <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>') }} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** 小型文件上传区 */
function MiniDropZone({ onFile }: { onFile: (name: string) => void }) {
  const [dragging, setDragging] = useState(false)

  const handleClick = () => {
    // 模拟选择文件
    onFile('新建需求文档.pdf')
    toast.success('文件已添加')
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const name = e.dataTransfer.files[0]?.name ?? '上传文件.pdf'
        onFile(name)
        toast.success('文件已添加')
      }}
      onClick={handleClick}
      className={`
        cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200
        ${dragging
          ? 'border-primary bg-primary/10 scale-[1.02]'
          : 'border-border/40 bg-muted/15 hover:border-primary/40 hover:bg-muted/25'
        }
      `}
    >
      <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">拖拽文件到此处，或点击选择</p>
      <p className="text-[11px] text-muted-foreground/60 mt-1">支持 PDF / Word / Excel / TXT / MD</p>
    </div>
  )
}

/* ──────────────────── 自定义 Select ──────────────────── */

interface SelectOption {
  value: string
  label: string
}

function GlassSelect({
  value,
  onChange,
  options,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between h-10 rounded-md border-0 bg-background/55 px-3 text-sm shadow-sm ring-1 ring-inset ring-foreground/10 dark:ring-white/10 hover:ring-primary/40 transition-colors text-left"
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected?.label ?? placeholder ?? '请选择'}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-xl max-h-60 overflow-y-auto backdrop-blur-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2.5 text-sm hover:bg-accent transition-colors ${
                o.value === value ? 'bg-primary/10 text-primary' : 'text-foreground'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ──────────────────── 主组件 ──────────────────── */

export default function AiAnalysisPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [selectedProject, setSelectedProject] = useState('')
  const [uploadedFile, setUploadedFile] = useState('')
  const [selectedExistingFile, setSelectedExistingFile] = useState('')
  const [requirementText, setRequirementText] = useState('')
  const [humanReview, setHumanReview] = useState(true)

  const logContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 自动滚动日志
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [state.logs])

  const hasDocument = Boolean(uploadedFile || selectedExistingFile)
  const isIdle = state.status === 'idle' || state.status === 'error'

  const handleStartAnalysis = useCallback(async () => {
    if (!hasDocument) {
      toast.error('请先上传或选择文档')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    dispatch({ type: 'START' })
    try {
      await simulateAnalysis(dispatch, controller.signal, state.revisionCount)
    } catch {
      dispatch({ type: 'ERROR', log: { id: crypto.randomUUID(), icon: 'error', text: '❌ 分析过程中发生错误' } })
    }
  }, [hasDocument, state.revisionCount])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    dispatch({ type: 'STOP' })
    toast('已停止分析', { icon: '⏹' })
  }, [])

  const handleSubmitRevision = useCallback(() => {
    if (!state.reviewText.trim()) {
      toast.error('请输入修改意见')
      return
    }
    abortRef.current?.abort()
    dispatch({ type: 'REVIEW' })
    // 重新开始分析
    setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      void simulateAnalysis(dispatch, controller.signal, state.revisionCount + 1)
    }, 300)
  }, [state.reviewText, state.revisionCount])

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

  const handleFileDrop = useCallback((name: string) => {
    setUploadedFile(name)
  }, [])

  const projectOptions: SelectOption[] = MOCK_PROJECTS.map((p) => ({ value: p, label: p }))
  const existingFileOptions: SelectOption[] = MOCK_UPLOADED_FILES.map((f) => ({ value: f, label: f }))

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
      </div>

      {/* 使用说明 */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-sm text-blue-700 dark:text-blue-300">
        <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-medium">使用说明</p>
          <p className="text-xs opacity-80">
            上传需求文档或从已上传文件中选择，AI 将自动解析文档内容并生成结构化的需求分析报告。
            分析完成后可进行人工审阅，输入修改意见后 AI 将根据反馈迭代优化报告，满意后点击「确认通过」继续。
          </p>
        </div>
      </div>

      {/* 用例生成模板（保留原有样式） */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">用例生成模板</label>
          <select className="h-10 min-w-0 flex-1 rounded-md border-0 bg-background/55 px-3 text-sm shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-md dark:ring-white/10">
            <option value="">— 使用默认模板 —</option>
            <option>功能测试用例模板</option>
            <option>接口测试用例模板</option>
            <option>性能测试用例模板</option>
          </select>
        </div>
      </div>

      {/* ──────────── 左右分栏 ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 min-h-[600px]">
        {/* ──────── 左侧操作区 ──────── */}
        <div className="space-y-4">
          {/* 关联项目 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">关联项目</label>
            <GlassSelect
              value={selectedProject}
              onChange={setSelectedProject}
              options={projectOptions}
              placeholder="请选择关联项目"
            />
          </div>

          {/* 需求文档 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">需求文档</label>
            <MiniDropZone onFile={handleFileDrop} />
            {uploadedFile && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <FileText className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-300 flex-1 truncate">{uploadedFile}</span>
                <button
                  type="button"
                  onClick={() => setUploadedFile('')}
                  className="text-green-400/60 hover:text-green-300 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">或从已上传文件中选择</p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <GlassSelect
                  value={selectedExistingFile}
                  onChange={setSelectedExistingFile}
                  options={existingFileOptions}
                  placeholder="选择已上传的文档"
                />
              </div>
              {selectedExistingFile && (
                <button
                  type="button"
                  onClick={() => setSelectedExistingFile('')}
                  className="flex-shrink-0 p-2 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
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
            {isIdle ? (
              <Button
                className="w-full h-11 text-sm font-medium gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasDocument}
                onClick={handleStartAnalysis}
              >
                <Brain className="w-4 h-4" />
                开始分析
              </Button>
            ) : state.status === 'analyzing' ? (
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
            ) : null}
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
              className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 min-h-[160px] max-h-[280px]"
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
            {state.report && (
              <div className="px-4 py-3 border-t border-border/20 bg-[#111125]/80 max-h-[320px] overflow-y-auto">
                <AnalysisReport report={state.report} />
              </div>
            )}

            {/* 人工审阅交互区 */}
            {(state.status === 'review' || state.status === 'approved') && (
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
                        onClick={handleSubmitRevision}
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
