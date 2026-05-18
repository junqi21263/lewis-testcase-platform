import { useState, useCallback, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Upload,
  FileText,
  Type,
  Wand2,
  Loader2,
  ChevronRight,
  X,
  RefreshCw,
  Sparkles,
  Search,
  Filter,
  History,
  ExternalLink,
  Copy,
  Trash2,
  CheckCircle2,
  FileOutput,
  ListFilter,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGenerateStore } from '@/store/generateStore'
import { filesApi } from '@/api/files'
import { aiApi } from '@/api/ai'
import { templatesApi } from '@/api/templates'
import { downloadSuiteExport, testcasesApi } from '@/api/testcases'
import { recordsApi } from '@/api/records'
import { parseAiCasesFromText } from '@/utils/parseAiCasesFromText'
import { formatFileSize } from '@/utils/format'
import { loadRecentTemplateIds, pushRecentTemplateId } from '@/utils/recentTemplates'
import {
  exportFilenameTimestamp,
  testcaseDelimitedValues,
  TESTCASE_EXPORT_COLUMNS_CN,
} from '@/utils/testcaseExportFormat'
import { copyTextToClipboard } from '@/utils/clipboard'
import { extractModuleFromTags } from '@/utils/parseLooseAiOutput'
import { preprocessPdfForUpload } from '@/utils/pdfPreprocess'
import { appConfirm } from '@/store/appConfirmStore'
import toast from 'react-hot-toast'
import type { TestCase, PromptTemplate, FileStatus, GenerationRecord } from '@/types'
import { useNavigate } from 'react-router-dom'

const INPUT_LENGTH_SOFT_WARN_CHARS = 85_000
const FILE_POLL_INTERVAL_MS = 1000
const FILE_POLL_MAX_ROUNDS = 900
const FILE_POLL_MAX_TRANSIENT_ERRORS = 90
const FILE_TRANSIENT_HTTP_STATUS = new Set([502, 503, 504, 520, 522, 524])

function pollStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : undefined
}

function isTransientFilePollError(error: unknown) {
  const status = pollStatus(error)
  if (status != null) return FILE_TRANSIENT_HTTP_STATUS.has(status)
  const e = error as { request?: unknown; code?: string; name?: string }
  return Boolean(e?.request || e?.code === 'ECONNABORTED' || e?.name === 'TimeoutError')
}

const fileStatusLabels: Record<FileStatus, string> = {
  PENDING: '等待解析',
  PARSING: '解析中…',
  PARSED: '解析完成',
  FAILED: '解析失败',
}

async function pollFileUntilParsed(fileId: string) {
  let transientErrors = 0
  for (let i = 0; i < FILE_POLL_MAX_ROUNDS; i++) {
    await new Promise((r) => setTimeout(r, FILE_POLL_INTERVAL_MS))
    try {
      const f = await filesApi.getFileById(fileId)
      transientErrors = 0
      useGenerateStore.getState().setUploadedFile(f)
      if (f.status === 'PARSED') {
        if (f.fileType === 'IMAGE' && !f.parsedContent?.trim()) {
          toast.error('图片未识别出文字，请在下方用文本补充需求，或换更清晰的截图')
        } else {
          toast.success('需求解析完成，可以开始生成')
        }
        return
      }
      if (f.status === 'FAILED') {
        toast.error('文件解析失败，无法用于生成，请换文件重试')
        return
      }
    } catch (e) {
      if (isTransientFilePollError(e) && transientErrors < FILE_POLL_MAX_TRANSIENT_ERRORS) {
        transientErrors++
        continue
      }
      toast.error('解析状态获取失败，请稍后重试')
      return
    }
  }
  toast.error('解析超时，请刷新页面或重新上传')
}

type ExpandField = 'requirement' | 'notes' | 'prompt' | null

function prettyDate(ts?: string) {
  if (!ts) return '--'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function CasePriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    P0: 'bg-rose-500/10 text-rose-500 ring-rose-500/25',
    P1: 'bg-amber-500/10 text-amber-500 ring-amber-500/25',
    P2: 'bg-sky-500/10 text-sky-500 ring-sky-500/25',
    P3: 'bg-slate-500/10 text-slate-500 ring-slate-500/25',
  }
  return (
    <Badge className={`ring-1 ring-inset ${map[priority] ?? map.P3}`} variant="secondary">
      {priority}
    </Badge>
  )
}

function SoftTextarea(props: {
  title: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  countLimit: number
  minHClass?: string
  maxHClass?: string
  onExpand?: () => void
  disabled?: boolean
}) {
  const {
    title,
    value,
    onChange,
    placeholder,
    countLimit,
    minHClass = 'min-h-[120px]',
    maxHClass = 'max-h-[260px]',
    onExpand,
    disabled,
  } = props

  return (
    <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">{title}</p>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[hsl(var(--gcs-text-muted))]">
            {value.length} / {countLimit}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onChange('')}
            disabled={disabled || value.length === 0}
          >
            清空
          </Button>
          {onExpand && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={onExpand}
              disabled={disabled}
            >
              展开编辑
            </Button>
          )}
        </div>
      </div>
      <textarea
        className={`w-full resize-none rounded-xl border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-3 py-2 text-sm outline-none ring-0 transition focus:border-[hsl(var(--gcs-input-focus))] focus:shadow-[0_0_0_3px_hsl(var(--gcs-input-focus)/0.18)] disabled:opacity-60 ${minHClass} ${maxHClass} overflow-y-auto`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  )
}

function FileUploadZone() {
  const { setUploadedFile, uploadedFile } = useGenerateStore()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      await uploadFile(file)
    },
    [],
  )

  const uploadFile = async (file: File) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/x-yaml',
      'image/png',
      'image/jpeg',
    ]
    const okMime = allowed.some((t) => file.type.includes(t.split('/')[1]))
    const okExt = file.name.match(/\.(pdf|docx|xlsx|txt|yaml|yml|png|jpg|jpeg)$/i)
    if (!okMime && !okExt) {
      toast.error('不支持的文件格式，请上传 PDF/Word/Excel/YAML/图片 文件')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      let toUpload = file
      if (file.name.toLowerCase().endsWith('.pdf')) toUpload = await preprocessPdfForUpload(file)
      const result = await filesApi.upload(toUpload, setProgress)
      setUploadedFile(result)
      toast.success('上传成功，正在解析文档…')
      void pollFileUntilParsed(result.id)
    } catch {
      toast.error('文件上传失败')
    } finally {
      setUploading(false)
    }
  }

  if (uploadedFile) {
    const parsing = uploadedFile.status === 'PENDING' || uploadedFile.status === 'PARSING'
    return (
      <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3">
        <div className="max-h-36 space-y-2 overflow-y-auto pr-1">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <FileText className="h-7 w-7 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{uploadedFile.originalName}</p>
              <p className="text-xs text-[hsl(var(--gcs-text-muted))]">
                {formatFileSize(uploadedFile.size)} · {uploadedFile.fileType}
                {' · '}
                <span className={uploadedFile.status === 'FAILED' ? 'text-destructive' : ''}>
                  {fileStatusLabels[uploadedFile.status]}
                </span>
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUploadedFile(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {parsing && (
          <p className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            正在解析文档，完成后再开始生成
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      className={`cursor-pointer rounded-2xl border border-dashed bg-[hsl(var(--gcs-dropzone-bg))] p-6 text-center transition ${
        dragging
          ? 'border-[hsl(var(--gcs-input-focus))] shadow-[0_0_0_3px_hsl(var(--gcs-input-focus)/0.2)]'
          : 'border-[hsl(var(--gcs-dropzone-border))] hover:border-[hsl(var(--gcs-input-focus)/0.7)]'
      }`}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        accept=".pdf,.docx,.xlsx,.txt,.yaml,.yml,.png,.jpg,.jpeg"
        onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
      />
      {uploading ? (
        <div className="space-y-3">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" />
          <p className="text-sm text-[hsl(var(--gcs-text-secondary))]">上传中... {progress}%</p>
          <div className="h-1.5 w-full rounded-full bg-secondary">
            <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <>
          <Upload className="mx-auto mb-3 h-9 w-9 text-[hsl(var(--gcs-text-muted))]" />
          <p className="text-sm font-medium">拖拽文件到这里，或点击上传</p>
          <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            支持 PDF、Word、Excel、YAML、图片
          </p>
        </>
      )}
    </div>
  )
}

function ExpandedEditorDialog(props: {
  open: boolean
  title: string
  value: string
  onChange: (next: string) => void
  onOpenChange: (open: boolean) => void
  placeholder: string
}) {
  const { open, title, value, onChange, onOpenChange, placeholder } = props
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[130] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[131] w-[min(920px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-modal-bg))] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <textarea
            className="h-[50vh] max-h-[560px] min-h-[320px] w-full resize-none rounded-2xl border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] p-3 text-sm outline-none focus:border-[hsl(var(--gcs-input-focus))] focus:shadow-[0_0_0_3px_hsl(var(--gcs-input-focus)/0.18)]"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RecentHistoryPanel() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<GenerationRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'ALL' | 'SUCCESS' | 'FAILED' | 'PROCESSING'>('ALL')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await recordsApi.getRecords({
        page: 1,
        pageSize: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
      setItems(res.list)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return items
      .filter((r) => (status === 'ALL' ? true : r.status === status))
      .filter((r) =>
        keyword.trim()
          ? `${r.title} ${r.modelName}`.toLowerCase().includes(keyword.toLowerCase())
          : true,
      )
      .slice(0, 3)
  }, [items, status, keyword])

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: '删除这条生成记录？',
      description: '删除后可在回收站恢复。',
      confirmText: '确认删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    try {
      await recordsApi.deleteRecord(id)
      toast.success('已删除记录')
      await load()
    } catch {
      toast.error('删除失败')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--gcs-text-muted))]">
          <History className="h-3.5 w-3.5" />
          最近 3 条
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => navigate('/records')}
        >
          查看全部
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] pl-8 pr-3 text-xs outline-none focus:border-[hsl(var(--gcs-input-focus))]"
              placeholder="搜索记录"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'ALL' | 'SUCCESS' | 'FAILED' | 'PROCESSING')}
            className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
          >
            <option value="ALL">全部</option>
            <option value="SUCCESS">成功</option>
            <option value="PROCESSING">处理中</option>
            <option value="FAILED">失败</option>
          </select>
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {loading && <p className="text-xs text-[hsl(var(--gcs-text-muted))]">加载中…</p>}
          {!loading && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-4 text-center">
              <Sparkles className="mx-auto mb-1 h-4 w-4 text-[hsl(var(--gcs-text-muted))]" />
              <p className="text-xs text-[hsl(var(--gcs-text-muted))]">暂无匹配记录</p>
            </div>
          )}
          {filtered.map((r) => (
            <div
              key={r.id}
              className="group rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-2.5"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="line-clamp-1 text-xs font-medium">{r.title}</p>
                <Badge
                  variant={r.status === 'SUCCESS' ? 'success' : r.status === 'FAILED' ? 'destructive' : 'warning'}
                >
                  {r.status}
                </Badge>
              </div>
              <p className="text-[11px] text-[hsl(var(--gcs-text-muted))]">
                {prettyDate(r.createdAt)} · {r.caseCount} 条
              </p>
              <div className="mt-2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => navigate(`/records/${r.id}`)}
                >
                  查看
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={async () => {
                    const ok = await copyTextToClipboard(`${r.title} (${r.id})`)
                    if (ok) toast.success('已复制记录信息')
                    else toast.error('复制失败')
                  }}
                >
                  复制
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 px-2 text-[11px] text-destructive opacity-40 transition group-hover:opacity-100"
                  onClick={() => handleDelete(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GenerateResult({ cases }: { cases: TestCase[] }) {
  const navigate = useNavigate()
  const { reset, lastRecordId, lastSuiteId, setGeneratedCases } = useGenerateStore()
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'P0' | 'P1' | 'P2' | 'P3'>('ALL')
  const [typeFilter, setTypeFilter] = useState<'ALL' | string>('ALL')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showMoreActions, setShowMoreActions] = useState(false)

  const canExport = Boolean(lastSuiteId) || cases.length > 0
  const availableTypes = useMemo(() => Array.from(new Set(cases.map((c) => c.type))), [cases])
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      const hitQuery = query.trim()
        ? `${c.title} ${c.precondition ?? ''} ${c.expectedResult} ${(c.tags ?? []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
        : true
      const hitPriority = priorityFilter === 'ALL' ? true : c.priority === priorityFilter
      const hitType = typeFilter === 'ALL' ? true : c.type === typeFilter
      return hitQuery && hitPriority && hitType
    })
  }, [cases, query, priorityFilter, typeFilter])
  const stats = useMemo(() => {
    const typeMap = filteredCases.reduce<Record<string, number>>((acc, c) => {
      acc[c.type] = (acc[c.type] ?? 0) + 1
      return acc
    }, {})
    return {
      total: filteredCases.length,
      functional: typeMap.FUNCTIONAL ?? 0,
      edge: typeMap.EDGE ?? 0,
      api: typeMap.API ?? 0,
      negative: typeMap.NEGATIVE ?? 0,
    }
  }, [filteredCases])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedCases = filteredCases.filter((c) => selected.has(c.id))

  const downloadTextFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const toMarkdown = (arr: TestCase[]) => {
    const lines: string[] = []
    lines.push(`# 测试用例（${arr.length} 条）`)
    lines.push('')
    for (const [idx, c] of arr.entries()) {
      lines.push(`## ${idx + 1}. ${c.title}`)
      lines.push('')
      lines.push(`- 优先级：${c.priority}`)
      lines.push(`- 类型：${c.type}`)
      if (c.precondition) lines.push(`- 前置条件：${c.precondition}`)
      lines.push('')
      lines.push('### 步骤')
      for (const s of c.steps ?? []) lines.push(`[${s.order}] ${s.action}${s.expected ? `（期望：${s.expected}）` : ''}`)
      lines.push('')
      lines.push('### 预期结果')
      lines.push(c.expectedResult || '')
      lines.push('')
    }
    return lines.join('\n')
  }

  const handleExport = async (format: 'EXCEL' | 'CSV' | 'JSON' | 'MARKDOWN') => {
    if (!canExport) {
      toast.error('暂无可导出的用例')
      return
    }
    if (lastSuiteId) {
      try {
        await downloadSuiteExport(lastSuiteId, format)
        toast.success('已开始下载')
        return
      } catch {
        // fallback
      }
    }
    const tsName = `${exportFilenameTimestamp()}`
    if (format === 'JSON') {
      downloadTextFile(`${tsName}.json`, JSON.stringify(cases, null, 2), 'application/json;charset=utf-8')
      toast.success('已导出 JSON')
      return
    }
    if (format === 'MARKDOWN') {
      downloadTextFile(`${tsName}.md`, toMarkdown(cases), 'text/markdown;charset=utf-8')
      toast.success('已导出 Markdown')
      return
    }
    if (format === 'CSV') {
      let moduleLabel = ''
      if (cases[0]?.suiteId) {
        try {
          const suite = await testcasesApi.getSuiteById(cases[0].suiteId)
          moduleLabel = (suite.projectName && suite.projectName.trim()) || suite.name || ''
        } catch {
          // ignore
        }
      }
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
      const header = TESTCASE_EXPORT_COLUMNS_CN.map((h) => esc(h)).join(',')
      const rows = cases.map((c) => testcaseDelimitedValues(c, moduleLabel).map(esc).join(','))
      downloadTextFile(`${tsName}.csv`, [header, ...rows].join('\n'), 'text/csv;charset=utf-8')
      toast.success('已导出 CSV')
      return
    }
    toast.error('Excel 需服务端用例集。请到「生成记录」内导出。')
  }

  const handleCopyJson = async () => {
    const text = JSON.stringify(cases, null, 2)
    const ok = await copyTextToClipboard(text)
    if (ok) toast.success('已复制 JSON 到剪贴板')
    else toast.error('复制失败，请手动复制')
  }

  const handleCreateShare = async () => {
    if (!lastRecordId) {
      toast.error('未找到生成记录，无法创建分享链接')
      return
    }
    try {
      const res = await recordsApi.createShare(lastRecordId, { expiresDays: 7 })
      const url = `${window.location.origin}${res.path || `/records/public/shares/${res.token}`}`
      const copied = await copyTextToClipboard(url)
      if (copied) toast.success('分享链接已复制（有效期 7 天）')
      else toast.success(`分享已创建：${url}`)
    } catch {
      toast.error('创建分享链接失败')
    }
  }

  const handleDeleteSelectedLocal = async () => {
    if (selected.size === 0) {
      toast.error('请先选择用例')
      return
    }
    const ok = await appConfirm({
      title: `删除已选 ${selected.size} 条用例？`,
      description: '仅影响当前页面结果，不会删除历史记录中的原始数据。',
      confirmText: '确认删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    setGeneratedCases(cases.filter((c) => !selected.has(c.id)))
    setSelected(new Set())
    toast.success('已删除选中项')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">生成完成</h3>
            <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">
              共 {stats.total} 条 · 功能 {stats.functional} · 异常 {stats.negative} · 边界 {stats.edge}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport('EXCEL')} disabled={!canExport}>
              导出 Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('MARKDOWN')} disabled={!canExport}>
              导出 Markdown
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('JSON')} disabled={!canExport}>
              导出 JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyJson} disabled={cases.length === 0}>
              复制 JSON
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowMoreActions((v) => !v)}>
              <MoreHorizontal className="h-4 w-4" />
              更多
            </Button>
          </div>
        </div>
        {showMoreActions && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-[hsl(var(--gcs-panel-border))] pt-3">
            {lastRecordId && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/records/${lastRecordId}`)}>
                查看记录
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleCreateShare} disabled={!lastRecordId}>
              生成分享链接
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={async () => {
                const ok = await appConfirm({
                  title: '重新生成前清空当前结果？',
                  description: '你将返回输入区，可重新配置并生成。',
                  confirmText: '确认清空',
                })
                if (ok) reset()
              }}
            >
              <RefreshCw className="h-4 w-4" />
              重新生成
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] pl-8 pr-3 text-sm outline-none focus:border-[hsl(var(--gcs-input-focus))]"
              placeholder="搜索用例标题/内容/标签"
            />
          </div>
          <div className="flex items-center gap-1 text-xs text-[hsl(var(--gcs-text-muted))]">
            <Filter className="h-3.5 w-3.5" />
            筛选
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | 'P0' | 'P1' | 'P2' | 'P3')}
            className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
          >
            <option value="ALL">全部优先级</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
          >
            <option value="ALL">全部类型</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => setExpanded(new Set(filteredCases.map((c) => c.id)))}
          >
            <ChevronDown className="h-4 w-4" />
            展开全部
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setExpanded(new Set())}>
            <ChevronUp className="h-4 w-4" />
            收起全部
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[hsl(var(--gcs-panel-border))] pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setSelected(new Set(filteredCases.map((c) => c.id)))}
          >
            全选
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setSelected(new Set())}>
            清空选择
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={async () => {
              if (selectedCases.length === 0) {
                toast.error('请先选择用例')
                return
              }
              const ok = await copyTextToClipboard(JSON.stringify(selectedCases, null, 2))
              if (ok) toast.success(`已复制 ${selectedCases.length} 条`)
              else toast.error('复制失败')
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            批量复制
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              if (selectedCases.length === 0) {
                toast.error('请先选择用例')
                return
              }
              const name = `${exportFilenameTimestamp()}-selected.json`
              downloadTextFile(name, JSON.stringify(selectedCases, null, 2), 'application/json;charset=utf-8')
              toast.success(`已导出 ${selectedCases.length} 条`)
            }}
          >
            <FileOutput className="h-3.5 w-3.5" />
            批量导出
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="ml-auto h-8"
            onClick={handleDeleteSelectedLocal}
          >
            <Trash2 className="h-3.5 w-3.5" />
            批量删除
          </Button>
        </div>
      </div>

      <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
        {filteredCases.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-8 text-center">
            <ListFilter className="mx-auto mb-2 h-5 w-5 text-[hsl(var(--gcs-text-muted))]" />
            <p className="text-sm">没有匹配的用例</p>
            <p className="mt-1 text-xs text-[hsl(var(--gcs-text-muted))]">调整搜索词或筛选条件试试</p>
          </div>
        )}

        {filteredCases.map((c, i) => {
          const caseId = c.id || `idx-${i}`
          const isExpanded = expanded.has(caseId)
          const caseModule = extractModuleFromTags(c.tags)
          const caseTags = (c.tags ?? []).filter((t) => t && !t.startsWith('模块:'))
          const shortPrecondition =
            !c.precondition || isExpanded
              ? c.precondition
              : `${c.precondition.slice(0, 140)}${c.precondition.length > 140 ? '...' : ''}`
          const showSteps = isExpanded ? c.steps : c.steps.slice(0, 3)
          return (
            <Card
              key={caseId}
              className="border-[hsl(var(--gcs-testcase-card-border))] bg-[hsl(var(--gcs-testcase-card-bg))] transition hover:bg-[hsl(var(--gcs-card-hover-bg))]"
            >
              <CardContent className="p-4">
                <div className="mb-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-input"
                    checked={selected.has(caseId)}
                    onChange={(e) => toggleSelected(caseId, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold">{c.title}</h4>
                      <div className="flex items-center gap-1.5">
                        <CasePriorityBadge priority={c.priority} />
                        <Badge
                          variant="secondary"
                          className="bg-sky-500/10 text-sky-500 ring-1 ring-inset ring-sky-500/20"
                        >
                          {c.type}
                        </Badge>
                      </div>
                    </div>
                    {(caseModule || caseTags.length > 0) && (
                      <p className="mt-1 text-[11px] text-[hsl(var(--gcs-text-muted))]">
                        {caseModule ? `模块：${caseModule}` : ''}
                        {caseModule && caseTags.length > 0 ? ' · ' : ''}
                        {caseTags.length > 0 ? `标签：${caseTags.join(', ')}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                {shortPrecondition && (
                  <div className="mb-2 rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2.5 py-2 text-xs">
                    <span className="font-medium text-[hsl(var(--gcs-text-secondary))]">前置条件：</span>
                    <span className="text-[hsl(var(--gcs-text-secondary))]">{shortPrecondition}</span>
                  </div>
                )}

                <div className="rounded-lg bg-[hsl(var(--gcs-panel-muted-bg))] px-2.5 py-2 text-xs">
                  <p className="mb-1 font-medium text-[hsl(var(--gcs-text-secondary))]">步骤描述</p>
                  <ol className="list-decimal space-y-1 pl-4">
                    {showSteps.map((step) => (
                      <li key={step.order} className="text-[hsl(var(--gcs-text-secondary))]">
                        {step.action}
                        {step.expected ? (
                          <span className="ml-1 text-[hsl(var(--gcs-text-muted))]">（期望：{step.expected}）</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  {!isExpanded && c.steps.length > 3 && (
                    <p className="mt-1 text-[11px] text-[hsl(var(--gcs-text-muted))]">还有 {c.steps.length - 3} 步未展开</p>
                  )}
                </div>

                <p className="mt-2 text-xs">
                  <span className="font-medium text-emerald-500">预期结果：</span>
                  <span className="text-[hsl(var(--gcs-text-secondary))]">{c.expectedResult}</span>
                </p>

                <div className="mt-3 flex justify-end">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleExpanded(caseId)}>
                    {isExpanded ? '收起' : '展开'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export default function GeneratePage() {
  const navigate = useNavigate()
  const {
    currentStep,
    setStep,
    sourceType,
    setSourceType,
    uploadedFile,
    setUploadedFile,
    inputText,
    setInputText,
    userNotes,
    setUserNotes,
    customPrompt,
    setCustomPrompt,
    selectedTemplateId,
    setSelectedTemplateId,
    aiParams,
    setAiParams,
    generatedCases,
    setGeneratedCases,
    setLastRecordId,
    setLastSuiteId,
    isGenerating,
    setIsGenerating,
    streamContent,
    appendStreamContent,
    clearStreamContent,
  } = useGenerateStore()

  const [templateOptions, setTemplateOptions] = useState<PromptTemplate[]>([])
  const [recentTplIds, setRecentTplIds] = useState<string[]>(() => loadRecentTemplateIds())
  const [templateKeyword, setTemplateKeyword] = useState('')
  const [expandField, setExpandField] = useState<ExpandField>(null)
  const [showHistory, setShowHistory] = useState(true)
  const [showLogs, setShowLogs] = useState(true)
  const [phaseIndex, setPhaseIndex] = useState(0)

  useEffect(() => {
    const h = useGenerateStore.getState().pendingGenerateHandoff
    if (!h) return
    setCustomPrompt(h.filledPrompt)
    setSelectedTemplateId(h.templateId)
    setSourceType('text')
    setInputText('')
    setUploadedFile(null)
    setStep('prompt')
    useGenerateStore.getState().setPendingGenerateHandoff(null)
    toast.success(
      h.handoffSource === 'ai-analysis'
        ? '已从 AI 需求分析载入材料，可直接生成'
        : '已从需求材料载入需求与提示词，可直接生成',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await templatesApi.getTemplates({ page: 1, pageSize: 100 })
        if (!cancelled) setTemplateOptions(res.list)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (useGenerateStore.getState().aiParams.modelConfigId) return
    let cancelled = false
    aiApi
      .getModels()
      .then((list) => {
        if (cancelled) return
        const def = list.find((m) => m.isDefault) ?? list[0]
        if (def?.id) setAiParams({ modelConfigId: def.id })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [setAiParams])

  useEffect(() => {
    if (!isGenerating) {
      setPhaseIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setPhaseIndex((p) => (p >= 3 ? 3 : p + 1))
    }, 1600)
    return () => window.clearInterval(timer)
  }, [isGenerating])

  const templateById = useMemo(
    () => Object.fromEntries(templateOptions.map((t) => [t.id, t] as const)),
    [templateOptions],
  )
  const selectedTemplate = selectedTemplateId ? templateById[selectedTemplateId] : null
  const filteredTemplates = useMemo(() => {
    return templateOptions.filter((t) => {
      if (!templateKeyword.trim()) return true
      const search = `${t.name} ${t.description ?? ''} ${t.category}`.toLowerCase()
      return search.includes(templateKeyword.toLowerCase())
    })
  }, [templateKeyword, templateOptions])
  const recentTemplates = useMemo(
    () => recentTplIds.map((id) => templateById[id]).filter(Boolean) as PromptTemplate[],
    [recentTplIds, templateById],
  )

  const stepItems = [
    { key: 'upload', label: '输入准备' },
    { key: 'prompt', label: '提示词配置' },
    { key: 'generating', label: 'AI 生成' },
    { key: 'result', label: '结果处理' },
  ] as const

  const textReady = inputText.trim().length > 0
  const promptReady = customPrompt.trim().length > 0
  const fileReady = sourceType !== 'file' || (uploadedFile && uploadedFile.status === 'PARSED')
  const sourceReady = sourceType === 'file' ? Boolean(uploadedFile) : textReady
  const canStartGenerate = sourceReady && promptReady && fileReady
  const readinessLabel = canStartGenerate
    ? '已准备好生成'
    : sourceType === 'file'
      ? !uploadedFile
        ? '需先上传文档'
        : uploadedFile.status !== 'PARSED'
          ? '等待文档解析完成'
          : '请补充提示词'
      : !textReady
        ? '请填写需求内容'
        : '请补充提示词'

  const handleGenerate = async () => {
    if (sourceType === 'file' && !uploadedFile) {
      toast.error('请先上传文件')
      return
    }
    if (sourceType === 'text' && !inputText.trim() && !customPrompt.trim()) {
      toast.error('请输入需求文本，或确保提示词中已包含完整需求描述')
      return
    }
    if (!customPrompt.trim()) {
      toast.error('请输入或选择提示词模板')
      return
    }

    if (sourceType === 'file' && uploadedFile) {
      let file = uploadedFile
      try {
        file = await filesApi.getFileById(uploadedFile.id)
        useGenerateStore.getState().setUploadedFile(file)
      } catch {
        toast.error('无法获取文件状态，请重试')
        return
      }
      if (file.status !== 'PARSED') {
        toast.error('请等待文件解析完成（须显示「解析完成」）后再生成')
        return
      }
      if (!file.parsedContent?.trim()) {
        toast.error('文件没有可用文本。请改用文本输入补充需求，或换一份文档。')
        return
      }
    }

    setIsGenerating(true)
    clearStreamContent()
    setStep('generating')

    try {
      if (aiParams.stream) {
        await aiApi.generateStream(
          {
            sourceType,
            fileId: uploadedFile?.id,
            text: inputText,
            customPrompt,
            templateId: selectedTemplateId ?? undefined,
            ...aiParams,
          },
          (chunk) => appendStreamContent(chunk),
          async (meta) => {
            const { streamContent: fullText } = useGenerateStore.getState()
            setIsGenerating(false)
            setLastRecordId(meta?.recordId ?? null)
            setLastSuiteId(meta?.suiteId ?? null)
            let cases: TestCase[] = []
            if (meta?.suiteId) {
              try {
                cases = await testcasesApi.getCasesBySuiteId(meta.suiteId)
              } catch {
                cases = []
              }
            }
            if (cases.length === 0) cases = parseAiCasesFromText(fullText)
            setGeneratedCases(cases)
            setStep('result')
            if (cases.length === 0) toast.error('未生成任何用例，请检查模型或输入内容')
            else toast.success(`用例生成完成，共 ${cases.length} 条`)
          },
          (err) => {
            setIsGenerating(false)
            toast.error(`生成失败: ${err.message}`)
            setStep('prompt')
          },
        )
      } else {
        const result = await aiApi.generateTestCases({
          sourceType,
          fileId: uploadedFile?.id,
          text: inputText,
          customPrompt,
          templateId: selectedTemplateId ?? undefined,
          ...aiParams,
        })
        setGeneratedCases(result.cases)
        setLastRecordId(result.recordId ?? null)
        try {
          const rec = await recordsApi.getRecordById(result.recordId)
          setLastSuiteId(rec.suiteId ?? null)
        } catch {
          setLastSuiteId(null)
        }
        setIsGenerating(false)
        setStep('result')
        if (result.warnings?.length) {
          for (const w of result.warnings) toast(w, { duration: 9000 })
        }
        toast.success(`成功生成 ${result.cases.length} 条用例！`)
      }
    } catch {
      setIsGenerating(false)
      setStep('prompt')
    }
  }

  const phaseLabels = ['解析输入', '理解需求', '生成用例', '结构化整理']

  return (
    <div className="generate-case-studio mx-auto flex h-full min-h-0 w-full max-w-[1520px] flex-col space-y-4 px-4 pb-4 pt-6 md:px-6">
      <div className="gcs-appear-1 flex-shrink-0 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">生成测试用例</h1>
            <p className="mt-1 text-sm text-[hsl(var(--gcs-text-muted))]">
              上传需求文档或输入需求描述，AI 自动生成标准化测试用例
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">
              模型：{aiParams.modelConfigId ? '已选择' : '自动默认'}
            </Badge>
            <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">
              执行策略：{aiParams.forceConfiguredModel === false ? '允许混元直出' : '强制所选模型'}
            </Badge>
            <Badge
              variant={isGenerating ? 'warning' : generatedCases.length > 0 ? 'success' : 'outline'}
              className="bg-[hsl(var(--gcs-panel-muted-bg))]"
            >
              {isGenerating ? '生成中' : generatedCases.length > 0 ? '已完成' : '待开始'}
            </Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => navigate('/templates')}>
              帮助 / 模板管理
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {stepItems.map((item, i) => {
            const idx = stepItems.findIndex((x) => x.key === currentStep)
            const isActive = currentStep === item.key
            const isDone = idx > i
            return (
              <div key={item.key} className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : isDone
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-[hsl(var(--gcs-panel-muted-bg))] text-[hsl(var(--gcs-text-muted))]'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-[hsl(var(--gcs-panel-border))] text-[hsl(var(--gcs-text-secondary))]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  {item.label}
                </div>
                {i < stepItems.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--gcs-text-muted))]" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(360px,40%)_minmax(0,60%)]">
        <section className="gcs-appear-2 flex min-h-0 flex-col gap-4">
          <Card className="flex h-full border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] xl:min-h-0 xl:flex-1 xl:flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">输入与配置</CardTitle>
              <CardDescription>左侧配置输入，右侧实时查看生成过程和结果</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
              <div className="space-y-3 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                <div className="space-y-1">
                  <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">输入来源</p>
                  <p className="text-xs text-[hsl(var(--gcs-text-muted))]">选择文档上传、文本输入或从需求分析导入</p>
                </div>
                <div className="grid grid-cols-1 gap-2 rounded-xl bg-[hsl(var(--gcs-card-bg))] p-1.5 ring-1 ring-inset ring-[hsl(var(--gcs-panel-border))] md:grid-cols-3">
                  <button
                    type="button"
                    className={`h-10 rounded-xl px-3 text-sm ring-1 ring-inset transition ${
                      sourceType === 'file'
                        ? 'bg-primary/15 text-primary ring-primary/30'
                        : 'bg-transparent text-[hsl(var(--gcs-text-secondary))] ring-transparent hover:bg-[hsl(var(--gcs-panel-muted-bg))]'
                    }`}
                    onClick={() => setSourceType('file')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Upload className="h-4 w-4" />
                      上传文档
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`h-10 rounded-xl px-3 text-sm ring-1 ring-inset transition ${
                      sourceType === 'text'
                        ? 'bg-primary/15 text-primary ring-primary/30'
                        : 'bg-transparent text-[hsl(var(--gcs-text-secondary))] ring-transparent hover:bg-[hsl(var(--gcs-panel-muted-bg))]'
                    }`}
                    onClick={() => setSourceType('text')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Type className="h-4 w-4" />
                      文本输入
                    </span>
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-transparent px-3 text-sm text-[hsl(var(--gcs-text-secondary))] ring-1 ring-inset ring-transparent transition hover:bg-[hsl(var(--gcs-panel-muted-bg))]"
                    onClick={() => navigate('/ai-analysis')}
                  >
                    从需求分析导入
                  </button>
                </div>
                <div key={sourceType} className="gcs-switch-stage">
                  {sourceType === 'file' ? (
                    <FileUploadZone />
                  ) : (
                    <SoftTextarea
                      title="文本输入"
                      value={inputText}
                      onChange={setInputText}
                      placeholder="请输入需求描述、功能说明、接口文档内容或业务规则..."
                      countLimit={5000}
                      minHClass="min-h-[140px]"
                      onExpand={() => setExpandField('requirement')}
                    />
                  )}
                </div>
              </div>

              <SoftTextarea
                title="需求描述"
                value={inputText}
                onChange={setInputText}
                placeholder="请输入需求描述、功能说明、接口文档内容或业务规则..."
                countLimit={5000}
                minHClass="min-h-[140px]"
                onExpand={() => setExpandField('requirement')}
              />

              <SoftTextarea
                title="补充说明"
                value={userNotes}
                onChange={setUserNotes}
                placeholder="补充边界条件、角色权限、异常流程、非功能要求等..."
                countLimit={3000}
                minHClass="min-h-[110px]"
                maxHClass="max-h-[220px]"
                onExpand={() => setExpandField('notes')}
              />

              <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">提示词 / 模板配置</p>
                  <Badge variant={customPrompt.trim() ? 'success' : 'outline'}>
                    {customPrompt.trim() ? '已使用自定义指令' : '未填写自定义指令'}
                  </Badge>
                </div>

                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    value={templateKeyword}
                    onChange={(e) => setTemplateKeyword(e.target.value)}
                    placeholder="搜索模板名称/分类"
                    className="h-9 w-full rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] pl-8 pr-3 text-xs outline-none focus:border-[hsl(var(--gcs-input-focus))]"
                  />
                </div>

                {selectedTemplate && (
                  <div className="mb-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
                    <p className="text-xs font-semibold text-primary">当前模板：{selectedTemplate.name}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] text-[hsl(var(--gcs-text-muted))]">
                      {selectedTemplate.description || '无描述'}
                    </p>
                  </div>
                )}

                {recentTemplates.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {recentTemplates.slice(0, 6).map((tpl) => (
                      <Button
                        key={tpl.id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setSelectedTemplateId(tpl.id)
                          setCustomPrompt(tpl.content)
                          pushRecentTemplateId(tpl.id)
                          setRecentTplIds(loadRecentTemplateIds())
                          toast.success(`已载入模板：${tpl.name}`)
                        }}
                      >
                        {tpl.name}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                  {filteredTemplates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`w-full rounded-lg border p-2 text-left transition ${
                        selectedTemplateId === tpl.id
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] hover:bg-[hsl(var(--gcs-card-hover-bg))]'
                      }`}
                      onClick={() => {
                        setSelectedTemplateId(tpl.id)
                        setCustomPrompt(tpl.content)
                        pushRecentTemplateId(tpl.id)
                        setRecentTplIds(loadRecentTemplateIds())
                        toast.success(`已载入模板：${tpl.name}`)
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-xs font-medium">{tpl.name}</p>
                        <Badge variant="outline">{tpl.category}</Badge>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <SoftTextarea
                    title="自定义提示词"
                    value={customPrompt}
                    onChange={setCustomPrompt}
                    placeholder="例如：请根据以上需求生成完整的功能测试用例，包含正向、逆向和边界测试..."
                    countLimit={12000}
                    minHClass="min-h-[140px]"
                    onExpand={() => setExpandField('prompt')}
                  />
                </div>
                {customPrompt.length + inputText.length > INPUT_LENGTH_SOFT_WARN_CHARS && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                    当前提示词与文本合计约 {customPrompt.length + inputText.length} 字，已超过建议上限（约{' '}
                    {INPUT_LENGTH_SOFT_WARN_CHARS.toLocaleString()} 字）。
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                <p className="mb-2 text-xs font-semibold text-[hsl(var(--gcs-text-secondary))]">生成设置</p>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={aiParams.stream}
                      onChange={(e) => setAiParams({ stream: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    流式输出
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={aiParams.forceConfiguredModel !== false}
                      onChange={(e) => setAiParams({ forceConfiguredModel: e.target.checked })}
                      className="h-4 w-4 rounded border-input"
                    />
                    强制使用后台所选模型
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[hsl(var(--gcs-text-muted))]">最大 Token</span>
                    <select
                      value={aiParams.maxTokens}
                      onChange={(e) => setAiParams({ maxTokens: Number(e.target.value) })}
                      className="h-9 rounded-lg border border-[hsl(var(--gcs-input-border))] bg-[hsl(var(--gcs-input-bg))] px-2 text-xs"
                    >
                      {[2048, 4096, 8192, 16384, 32768].map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[hsl(var(--gcs-text-muted))]">
                  开启后将跳过 hunyuan-vision 文件直出通道，始终按系统设置中的已选模型执行生成。
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-[650] text-[hsl(var(--gcs-text-primary))]">最近生成记录</p>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowHistory((v) => !v)}>
                    {showHistory ? '收起' : '展开'}
                  </Button>
                </div>
                {showHistory && <RecentHistoryPanel />}
              </div>
            </CardContent>

            <div className="gcs-action-footer relative z-[5] min-h-[74px] flex-shrink-0 border-t border-[hsl(var(--gcs-action-footer-border))] bg-[hsl(var(--gcs-action-footer-bg))] px-4 py-3">
              <div className="pointer-events-none absolute -top-3 left-0 right-0 h-3 bg-gradient-to-t from-[hsl(var(--gcs-action-footer-bg))] to-transparent" />
              <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                <div className="gcs-footer-status flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gcs-action-chip">
                    {sourceType === 'text' ? `文本输入 ${textReady ? '已填写' : '未填写'}` : uploadedFile ? `文档 ${fileStatusLabels[uploadedFile.status]}` : '文档 未上传'}
                  </Badge>
                  <Badge variant="outline" className="gcs-action-chip">文本 {inputText.length} 字</Badge>
                  <Badge variant="outline" className="gcs-action-chip">
                    {selectedTemplate ? `模板：${selectedTemplate.name}` : '未选模板'}
                  </Badge>
                  <Badge variant={canStartGenerate ? 'success' : 'outline'} className="gcs-action-chip">
                    {readinessLabel}
                  </Badge>
                </div>
                <div className="gcs-footer-actions ml-auto flex w-full justify-end md:w-auto">
                <Button
                  type="button"
                  size="lg"
                  className="gcs-action-primary h-11 w-full min-w-[148px] gap-2 md:w-auto md:min-w-[164px]"
                  onClick={handleGenerate}
                  disabled={isGenerating || !canStartGenerate}
                  aria-busy={isGenerating}
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {isGenerating ? '生成中...' : '开始生成'}
                </Button>
              </div>
            </div>
            </div>
          </Card>
        </section>

        <section className="gcs-appear-3 min-h-0">
          <Card className="flex h-full min-h-[420px] flex-col border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-result-panel-bg))]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">AI Generation Console</CardTitle>
                  <CardDescription>实时显示生成过程与结构化测试用例结果</CardDescription>
                </div>
                {isGenerating && <Badge variant="warning">生成中</Badge>}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
              {!isGenerating && generatedCases.length === 0 && (
                <div className="flex h-full min-h-[360px] items-center justify-center">
                  <div className="gcs-console-ready w-full max-w-2xl rounded-2xl border border-dashed border-[hsl(var(--gcs-panel-border))] p-8 text-center">
                    <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
                    <p className="text-sm font-semibold">配置输入后，AI 会在这里生成测试用例</p>
                    <p className="mx-auto mt-2 max-w-[520px] text-xs text-[hsl(var(--gcs-text-muted))]">
                      将自动整理为标题、前置条件、步骤、预期结果和优先级
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">用例标题</Badge>
                      <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">操作步骤</Badge>
                      <Badge variant="outline" className="bg-[hsl(var(--gcs-panel-muted-bg))]">预期结果</Badge>
                    </div>
                    <div className="mx-auto mt-5 grid max-w-lg gap-2 rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-bg))] p-3 text-left">
                      <div className="h-3 w-3/5 rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                      <div className="h-2.5 w-full rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                      <div className="h-2.5 w-5/6 rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                      <div className="h-2.5 w-2/3 rounded-full bg-[hsl(var(--gcs-panel-muted-bg))]" />
                    </div>
                  </div>
                </div>
              )}

              {isGenerating && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                    <p className="mb-2 text-sm font-semibold">生成进度</p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {phaseLabels.map((label, idx) => (
                        <div
                          key={label}
                          className={`rounded-lg border px-2.5 py-2 text-xs ${
                            idx <= phaseIndex
                              ? 'border-primary/35 bg-primary/10 text-primary'
                              : 'border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] text-[hsl(var(--gcs-text-muted))]'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {idx <= phaseIndex ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <Loader2 className="h-3.5 w-3.5" />
                            )}
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-panel-muted-bg))] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">流式日志</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowLogs((v) => !v)}
                      >
                        {showLogs ? '折叠' : '展开'}
                      </Button>
                    </div>
                    {showLogs && (
                      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[hsl(var(--gcs-panel-border))] bg-[hsl(var(--gcs-card-bg))] p-3 font-mono text-xs">
                        {streamContent || '等待 AI 响应...'}
                      </pre>
                    )}
                  </div>
                </div>
              )}

              {!isGenerating && generatedCases.length > 0 && <GenerateResult cases={generatedCases} />}
            </CardContent>
          </Card>
        </section>
      </div>

      <ExpandedEditorDialog
        open={expandField === 'requirement'}
        title="展开编辑：需求描述"
        value={inputText}
        onChange={setInputText}
        onOpenChange={(open) => setExpandField(open ? 'requirement' : null)}
        placeholder="请输入需求描述、功能说明、接口文档内容或业务规则..."
      />
      <ExpandedEditorDialog
        open={expandField === 'notes'}
        title="展开编辑：补充说明"
        value={userNotes}
        onChange={setUserNotes}
        onOpenChange={(open) => setExpandField(open ? 'notes' : null)}
        placeholder="补充边界条件、角色权限、异常流程、非功能要求等..."
      />
      <ExpandedEditorDialog
        open={expandField === 'prompt'}
        title="展开编辑：自定义提示词"
        value={customPrompt}
        onChange={setCustomPrompt}
        onOpenChange={(open) => setExpandField(open ? 'prompt' : null)}
        placeholder="请输入模板指令或自定义提示词..."
      />
    </div>
  )
}
