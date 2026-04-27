/**
 * 生成记录详情：与列表、生成页数据打通；部分能力依赖后端已提供字段（生成参数快照未持久化处已标注）。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEventHandler,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Copy,
  Download,
  Printer,
  Share2,
  ChevronDown,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  FileText,
  ExternalLink,
  Wand2,
  Pencil,
  CloudUpload,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { recordsApi, type RecordCompareResult } from '@/api/records'
import { testcasesApi, downloadSuiteExport } from '@/api/testcases'
import { settingsApi } from '@/api/settings'
import { filesApi } from '@/api/files'
import { formatDate, generationRecordStatusClass } from '@/utils/format'
import type { GenerationRecord, GenerationStatus, RecordDownloadEntry, TestCase } from '@/types'
import { useGenerateStore, defaultGenerationOptions } from '@/store/generateStore'
import { useAuthStore } from '@/store/authStore'
import { casesDataSnapshot, normalizeSteps, stepsToLines } from '@/components/record-detail/caseUtils'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'

const statusLabels: Record<GenerationStatus, string> = {
  PENDING: '等待中',
  PROCESSING: '生成中',
  SUCCESS: '成功',
  FAILED: '失败',
  ARCHIVED: '已归档',
  CANCELLED: '已取消',
}

function sourceLabel(r: GenerationRecord): string {
  if (r.generationSource === 'TEMPLATE' || r.templateId) return '模板复用'
  if (r.generationSource === 'FILE_PARSE' || r.sourceType === 'file' || r.fileId) {
    return '文档解析带入'
  }
  if (r.generationSource === 'MANUAL_INPUT' || r.sourceType === 'text') return '手动输入'
  return r.sourceType || '其他'
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const canEdit = user?.role !== 'VIEWER'

  const [record, setRecord] = useState<GenerationRecord | null>(null)
  const [downloads, setDownloads] = useState<RecordDownloadEntry[]>([])
  const [cases, setCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<'req' | 'cases'>('req')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [notes, setNotes] = useState('')
  const [prompt, setPrompt] = useState('')
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [syncSuiteDesc, setSyncSuiteDesc] = useState(true)

  const [caseEdit, setCaseEdit] = useState(false)
  const [caseSearch, setCaseSearch] = useState('')
  const [casePri, setCasePri] = useState<string>('all')
  const [casePage, setCasePage] = useState(1)
  const casePageSize = 15

  const [shareOpen, setShareOpen] = useState(false)
  const [shareDays, setShareDays] = useState(7)
  const [shareBusy, setShareBusy] = useState(false)
  const [compareOtherId, setCompareOtherId] = useState('')
  const [compareResult, setCompareResult] = useState<RecordCompareResult | null>(null)
  const [compareBusy, setCompareBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)

  const [savingMeta, setSavingMeta] = useState(false)
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [savingCases, setSavingCases] = useState(false)
  const [caseBusy, setCaseBusy] = useState<string | null>(null)
  /** null = 尚未完成一次成功加载，不参与用例脏比较 */
  const casesBaselineRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const r = await recordsApi.getRecordById(id)
      setRecord(r)
      setTitle(r.title)
      setTags(r.tags ?? [])
      setNotes(r.notes ?? '')
      setPrompt(r.prompt ?? '')
      const [d, c] = await Promise.all([
        recordsApi.getRecordDownloads(id),
        r.suiteId ? testcasesApi.getCasesBySuiteId(r.suiteId) : Promise.resolve([]),
      ])
      setDownloads(d)
      const normalized = c.map((x) => ({ ...x, steps: normalizeSteps(x.steps as unknown) }))
      setCases(normalized)
      casesBaselineRef.current = casesDataSnapshot(normalized)
    } catch {
      setError('加载失败或无权限查看该记录')
      setRecord(null)
      casesBaselineRef.current = null
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const dirtyMeta = !!(
    record &&
    (title !== record.title ||
      JSON.stringify(tags) !== JSON.stringify(record.tags ?? []) ||
      notes !== (record.notes ?? ''))
  )
  const dirtyPrompt = !!(record && prompt !== (record.prompt ?? ''))

  const dirtyCases = useMemo(() => {
    if (casesBaselineRef.current === null) return false
    return casesDataSnapshot(cases) !== casesBaselineRef.current
  }, [cases])

  const hasUnsavedChanges = dirtyMeta || dirtyPrompt || dirtyCases

  const confirmLeave = () =>
    !hasUnsavedChanges || window.confirm('有未保存的修改，确定离开？')

  const navWithGuard = (to: string, state?: Record<string, unknown>) => {
    if (!confirmLeave()) return
    navigate(to, state != null ? { state } : undefined)
  }

  const guardLinkClick: MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (!confirmLeave()) e.preventDefault()
  }

  const saveMeta = async () => {
    if (!id || !record) return
    setSavingMeta(true)
    try {
      const r = await recordsApi.patchRecord(id, { title, tags, notes })
      setRecord(r)
      toast.success('基础信息已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSavingMeta(false)
    }
  }

  const savePrompt = async () => {
    if (!id || !record) return
    setSavingPrompt(true)
    try {
      const r = await recordsApi.patchRecord(id, { prompt })
      setRecord(r)
      if (syncSuiteDesc && record.suiteId) {
        await testcasesApi.updateSuite(record.suiteId, {
          description: prompt.slice(0, 8000),
        })
      }
      toast.success('需求原文已保存' + (syncSuiteDesc && record.suiteId ? '，并已同步用例集说明' : ''))
    } catch {
      toast.error('保存失败')
    } finally {
      setSavingPrompt(false)
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('已复制全文')
    } catch {
      toast.error('复制失败')
    }
  }

  const handoffGenerate = async () => {
    if (!record) return
    if (!confirmLeave()) return
    let uploadedFile = null as typeof record.file | null
    if (record.fileId) {
      try {
        uploadedFile = await filesApi.getFileById(record.fileId)
      } catch {
        toast.error('无法获取关联文件信息（请确认文件仍存在）')
      }
    }
    let modelConfigId: string | undefined
    try {
      const models = await settingsApi.listModelsAdmin()
      modelConfigId = models.find((m) => m.modelId === record.modelId)?.id
    } catch {
      /* 非管理员或无权限时跳过 */
    }
    const gp = record.generateParams as { temperature?: number; maxTokens?: number } | undefined
    useGenerateStore.setState({
      sourceType: record.fileId ? 'file' : 'text',
      customPrompt: record.prompt ?? '',
      selectedTemplateId: record.templateId ?? null,
      userNotes: record.notes ?? '',
      uploadedFile: uploadedFile as any,
      inputText: '',
      currentStep: 'prompt',
      generationOptions: { ...defaultGenerationOptions },
      aiParams: {
        ...useGenerateStore.getState().aiParams,
        modelConfigId,
        ...(gp?.temperature != null ? { temperature: Number(gp.temperature) } : {}),
        ...(gp?.maxTokens != null ? { maxTokens: Number(gp.maxTokens) } : {}),
      },
    })
    navigate('/generate')
    toast.success('已预填充生成页（含已保存的模型参数快照）')
  }

  const saveAllCases = async () => {
    if (!canEdit || !cases.length) return
    setSavingCases(true)
    try {
      await Promise.all(
        cases.map((c) =>
          testcasesApi.updateCase(c.id, {
            title: c.title,
            precondition: c.precondition,
            expectedResult: c.expectedResult,
            priority: c.priority,
            type: c.type,
            tags: c.tags,
            steps: c.steps,
          }),
        ),
      )
      toast.success('用例已保存')
      setCaseEdit(false)
      void load()
    } catch {
      toast.error('部分用例保存失败')
    } finally {
      setSavingCases(false)
    }
  }

  const addCase = async () => {
    if (!record?.suiteId || !canEdit) return
    setCaseBusy('new')
    try {
      const c = await testcasesApi.createCase(record.suiteId, {
        title: '新建用例',
        expectedResult: '请填写预期结果',
        steps: [{ order: 1, action: '请填写步骤', expected: '' }],
      })
      setCases((prev) => {
        const next = [...prev, { ...c, steps: normalizeSteps(c.steps as unknown) }]
        casesBaselineRef.current = casesDataSnapshot(next)
        return next
      })
      toast.success('已新增用例')
    } catch {
      toast.error('新增失败')
    } finally {
      setCaseBusy(null)
    }
  }

  const removeCase = async (cid: string) => {
    if (!canEdit || !window.confirm('删除该用例？')) return
    setCaseBusy(cid)
    try {
      await testcasesApi.deleteCase(cid)
      setCases((prev) => {
        const next = prev.filter((c) => c.id !== cid)
        casesBaselineRef.current = casesDataSnapshot(next)
        return next
      })
      toast.success('已删除')
    } catch {
      toast.error('删除失败')
    } finally {
      setCaseBusy(null)
    }
  }

  const updateLocalCase = (cid: string, patch: Partial<TestCase>) => {
    setCases((prev) => prev.map((c) => (c.id === cid ? { ...c, ...patch } : c)))
  }

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (casePri !== 'all' && c.priority !== casePri) return false
      if (!caseSearch.trim()) return true
      const q = caseSearch.toLowerCase()
      return (
        c.title.toLowerCase().includes(q) ||
        (c.precondition ?? '').toLowerCase().includes(q) ||
        stepsToLines(c.steps).toLowerCase().includes(q)
      )
    })
  }, [cases, caseSearch, casePri])

  const pagedCases = useMemo(() => {
    const start = (casePage - 1) * casePageSize
    return filteredCases.slice(start, start + casePageSize)
  }, [filteredCases, casePage, casePageSize])

  const caseTotalPages = Math.max(1, Math.ceil(filteredCases.length / casePageSize))

  const doExport = async (format: string) => {
    if (!record?.suiteId) {
      toast.error('无关联用例集，无法导出')
      return
    }
    try {
      await downloadSuiteExport(record.suiteId, format)
      toast.success('已开始下载')
      void load()
    } catch {
      toast.error('导出失败')
    }
    setExportOpen(false)
  }

  const copyShare = async () => {
    if (!id) return
    if (!canEdit) {
      try {
        const loginLink = `${window.location.origin}/records/${id}`
        await navigator.clipboard.writeText(`${loginLink}\n（需登录后访问详情）`)
        toast.success('已复制详情链接（登录访问）')
        setShareOpen(false)
      } catch {
        toast.error('复制失败')
      }
      return
    }
    setShareBusy(true)
    try {
      const res = await recordsApi.createShare(id, { expiresDays: shareDays })
      const url = `${window.location.origin}${res.path}`
      await navigator.clipboard.writeText(
        `${url}\n（免登录只读分享，约定 ${shareDays} 天内有效）`,
      )
      toast.success('分享链接已复制')
      setShareOpen(false)
    } catch {
      toast.error('创建分享失败')
    } finally {
      setShareBusy(false)
    }
  }

  const runCompare = async () => {
    if (!id || !compareOtherId.trim()) {
      toast.error('请填写另一条记录 ID')
      return
    }
    setCompareBusy(true)
    setCompareResult(null)
    try {
      const r = await recordsApi.compareRecords(id, compareOtherId.trim())
      setCompareResult(r)
      toast.success('对比完成')
    } catch {
      toast.error('对比失败或无权限')
    } finally {
      setCompareBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="h-24 bg-muted rounded" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (error || !record) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <p className="text-destructive">{error ?? '记录不存在'}</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            重试
          </Button>
          <Button onClick={() => navigate('/records')}>返回列表</Button>
        </div>
      </div>
    )
  }

  return (
    <div id="record-detail-root" className="space-y-4 max-w-5xl mx-auto min-w-0 pb-16 print:pb-0">
      {/* 面包屑 */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
        <button
          type="button"
          className="hover:text-foreground"
          onClick={() => navWithGuard('/records')}
        >
          生成记录
        </button>
        <span>/</span>
        <span className="text-foreground">记录详情</span>
      </nav>

      {/* 核心操作栏（打印时隐藏） */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-2 p-2 -mx-2 rounded-lg border bg-background/90 backdrop-blur">
        <Button size="sm" className="gap-1" onClick={() => void handoffGenerate()}>
          <Wand2 className="w-3.5 h-3.5" />
          一键复用
        </Button>
        {canEdit && record.suiteId && (
          <Button
            size="sm"
            variant={caseEdit ? 'default' : 'outline'}
            className="gap-1"
            onClick={() => (caseEdit ? void saveAllCases() : setCaseEdit(true))}
            disabled={savingCases}
          >
            {caseEdit ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {caseEdit ? (savingCases ? '保存中…' : '保存用例') : '编辑用例'}
          </Button>
        )}
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={!record.suiteId}
            onClick={() => setExportOpen((v) => !v)}
          >
            <Download className="w-3.5 h-3.5" />
            导出
            <ChevronDown className="w-3 h-3" />
          </Button>
          {exportOpen && (
            <div className="absolute left-0 mt-1 z-30 min-w-[180px] rounded-md border bg-popover shadow-md py-1 text-sm">
              {(['EXCEL', 'JSON', 'MARKDOWN'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-accent"
                  onClick={() => void doExport(f)}
                >
                  {f}
                </button>
              ))}
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-muted-foreground cursor-not-allowed"
                disabled
              >
                Word / PDF（即将支持）
              </button>
            </div>
          )}
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setShareOpen(true)}>
          <Share2 className="w-3.5 h-3.5" />
          分享
        </Button>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5" />
          打印
        </Button>
        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => setSyncOpen((v) => !v)}
          >
            <CloudUpload className="w-3.5 h-3.5" />
            同步第三方
            <ChevronDown className="w-3 h-3" />
          </Button>
          {syncOpen && (
            <div className="absolute right-0 mt-1 z-30 min-w-[160px] rounded-md border bg-popover shadow-md py-1 text-sm">
              {['禅道', 'Jira', 'TestLink'].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-accent"
                  onClick={() => {
                    toast(`${n} 同步即将支持`, { icon: 'ℹ️' })
                    setSyncOpen(false)
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 分享弹窗 */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 no-print">
          <div className="bg-card border rounded-lg max-w-md w-full p-5 space-y-3">
            <h3 className="font-semibold">分享记录</h3>
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? `生成免登录只读链接，约定 ${shareDays} 天内有效（后端到期自动失效）。`
                : '只读账号仅可复制「需登录」的详情链接。'}
            </p>
            {canEdit ? (
              <label className="text-xs flex items-center gap-2">
                约定有效期（天）
                <Input
                  type="number"
                  min={1}
                  max={365}
                  className="h-8 w-24"
                  value={shareDays}
                  onChange={(e) => setShareDays(+e.target.value || 7)}
                />
              </label>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareOpen(false)}>
                关闭
              </Button>
              <Button onClick={() => void copyShare()} disabled={shareBusy}>
                {shareBusy ? '生成中…' : '复制链接'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 基础信息 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            基础信息
            <Badge variant="outline" className={generationRecordStatusClass[record.status]}>
              {statusLabels[record.status]}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">标题</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-xs text-muted-foreground">模型 / 用例数 / 创建时间</p>
              <p>
                {record.modelName} · {record.caseCount} 条 ·{' '}
                {formatDate(record.createdAt, 'yyyy-MM-dd HH:mm')}
              </p>
              <p className="text-xs text-muted-foreground">
                耗时 {record.duration != null ? `${Math.round(record.duration / 1000)}s` : '—'} ·
                操作人 {record.creator?.username ?? '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="text-muted-foreground">来源</span>
            <Badge variant="secondary">{sourceLabel(record)}</Badge>
            {record.file && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  to={`/upload`}
                  state={{ highlightFileId: record.file.id }}
                  onClick={guardLinkClick}
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  关联文档 {record.file.originalName}
                </Link>
              </Button>
            )}
            {record.template && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/templates" onClick={guardLinkClick}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  模板：{record.template.name}
                </Link>
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">标签（回车添加）</label>
            <div className="flex flex-wrap gap-1 items-center">
              {tags.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="gap-1 cursor-pointer"
                  onClick={() => canEdit && setTags((x) => x.filter((y) => y !== t))}
                >
                  {t}
                  {canEdit ? '×' : ''}
                </Badge>
              ))}
              {canEdit && (
                <Input
                  className="h-8 max-w-[160px] text-xs"
                  value={tagInput}
                  placeholder="输入后回车"
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = tagInput.trim()
                      if (v && !tags.includes(v)) setTags([...tags, v])
                      setTagInput('')
                    }
                  }}
                />
              )}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">备注（支持换行，轻量文本）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => void saveMeta()} disabled={savingMeta || !dirtyMeta}>
              {savingMeta ? '保存中…' : '保存基础信息'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b">
        <button
          type="button"
          className={cn(
            'px-3 py-2 text-sm border-b-2 -mb-px',
            tab === 'req' ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
          )}
          onClick={() => setTab('req')}
        >
          需求原文
        </button>
        <button
          type="button"
          className={cn(
            'px-3 py-2 text-sm border-b-2 -mb-px',
            tab === 'cases' ? 'border-primary font-medium' : 'border-transparent text-muted-foreground',
          )}
          onClick={() => setTab('cases')}
        >
          生成用例集
        </button>
      </div>

      {tab === 'req' && (
        <Card>
          <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">需求原文 / 提示词</CardTitle>
            <div className="flex flex-wrap gap-2 no-print">
              <Button size="sm" variant="outline" onClick={() => void copyPrompt()}>
                <Copy className="w-3.5 h-3.5 mr-1" />
                复制全文
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toast('请前往「文档解析」页上传文档后使用「重新结构化」', { icon: 'ℹ️' })
                }
              >
                重新提取需求点
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={!canEdit}
              rows={promptExpanded ? 24 : 12}
              className="w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-sm font-mono"
            />
            <div className="flex flex-wrap items-center gap-3 text-sm no-print">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={promptExpanded}
                  onChange={(e) => setPromptExpanded(e.target.checked)}
                />
                展开大段文本
              </label>
              {record.suiteId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncSuiteDesc}
                    onChange={(e) => setSyncSuiteDesc(e.target.checked)}
                  />
                  保存时同步到用例集说明
                </label>
              )}
              {canEdit && (
                <Button size="sm" onClick={() => void savePrompt()} disabled={savingPrompt || !dirtyPrompt}>
                  {savingPrompt ? '保存中…' : '保存需求原文'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'cases' && (
        <Card>
          <CardHeader className="pb-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">
                用例列表 · 共 {cases.length} 条
                {caseEdit && <span className="text-muted-foreground font-normal">（编辑模式）</span>}
              </CardTitle>
              {canEdit && record.suiteId && (
                <Button size="sm" variant="outline" onClick={() => void addCase()} disabled={!!caseBusy}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  新增用例
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Input
                placeholder="搜索标题/步骤/前置"
                className="h-8 max-w-xs"
                value={caseSearch}
                onChange={(e) => {
                  setCaseSearch(e.target.value)
                  setCasePage(1)
                }}
              />
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={casePri}
                onChange={(e) => {
                  setCasePri(e.target.value)
                  setCasePage(1)
                }}
              >
                <option value="all">全部优先级</option>
                {(['P0', 'P1', 'P2', 'P3'] as const).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {!record.suiteId ? (
              <p className="text-sm text-muted-foreground">该记录尚未关联用例集。</p>
            ) : (
              <>
                <table className="w-full text-xs border-collapse min-w-[800px]">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="p-2 w-[72px]">ID</th>
                      <th className="p-2 min-w-[120px]">标题</th>
                      <th className="p-2 w-[88px]">模块</th>
                      <th className="p-2 min-w-[100px]">前置</th>
                      <th className="p-2 min-w-[180px]">步骤</th>
                      <th className="p-2 min-w-[120px]">预期</th>
                      <th className="p-2 w-[52px]">优先级</th>
                      <th className="p-2 w-[72px] no-print">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCases.map((c) => (
                      <tr key={c.id} className="border-b align-top">
                        <td className="p-2 font-mono text-[10px] text-muted-foreground">
                          {c.id.slice(0, 8)}…
                        </td>
                        <td className="p-2">
                          {caseEdit ? (
                            <Input
                              className="h-7 text-xs"
                              value={c.title}
                              onChange={(e) => updateLocalCase(c.id, { title: e.target.value })}
                            />
                          ) : (
                            <span className="line-clamp-2 font-medium">{c.title}</span>
                          )}
                        </td>
                        <td className="p-2">
                          {caseEdit ? (
                            <Input
                              className="h-7 text-xs"
                              value={c.tags[0] ?? ''}
                              placeholder="模块"
                              onChange={(e) =>
                                updateLocalCase(c.id, {
                                  tags: e.target.value ? [e.target.value] : [],
                                })
                              }
                            />
                          ) : (
                            c.tags[0] ?? '—'
                          )}
                        </td>
                        <td className="p-2">
                          {caseEdit ? (
                            <textarea
                              className="w-full min-h-[48px] rounded border bg-transparent text-xs p-1"
                              value={c.precondition ?? ''}
                              onChange={(e) =>
                                updateLocalCase(c.id, { precondition: e.target.value })
                              }
                            />
                          ) : (
                            <span className="line-clamp-3">{c.precondition || '—'}</span>
                          )}
                        </td>
                        <td className="p-2">
                          {caseEdit ? (
                            <textarea
                              className="w-full min-h-[64px] rounded border bg-transparent text-xs p-1 font-mono"
                              value={stepsToLines(c.steps)}
                              onChange={(e) => {
                                const lines = e.target.value.split('\n').filter(Boolean)
                                const steps = lines.map((line, i) => {
                                  const m = /^(\d+)\.\s*(.*)$/.exec(line.trim())
                                  if (m) {
                                    return {
                                      order: +m[1],
                                      action: m[2],
                                      expected: '',
                                    }
                                  }
                                  return { order: i + 1, action: line.trim(), expected: '' }
                                })
                                updateLocalCase(c.id, {
                                  steps: steps.length ? steps : [{ order: 1, action: '', expected: '' }],
                                })
                              }}
                            />
                          ) : (
                            <pre className="whitespace-pre-wrap font-mono text-[11px] line-clamp-4">
                              {stepsToLines(c.steps)}
                            </pre>
                          )}
                        </td>
                        <td className="p-2">
                          {caseEdit ? (
                            <textarea
                              className="w-full min-h-[48px] rounded border bg-transparent text-xs p-1"
                              value={c.expectedResult}
                              onChange={(e) =>
                                updateLocalCase(c.id, { expectedResult: e.target.value })
                              }
                            />
                          ) : (
                            <span className="line-clamp-3">{c.expectedResult}</span>
                          )}
                        </td>
                        <td className="p-2">
                          {caseEdit ? (
                            <select
                              className="h-7 w-full rounded border bg-background text-xs"
                              value={c.priority}
                              onChange={(e) =>
                                updateLocalCase(c.id, {
                                  priority: e.target.value as TestCase['priority'],
                                })
                              }
                            >
                              {(['P0', 'P1', 'P2', 'P3'] as const).map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          ) : (
                            c.priority
                          )}
                        </td>
                        <td className="p-2 no-print">
                          {canEdit && caseEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => void removeCase(c.id)}
                              disabled={caseBusy === c.id}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground no-print">
                  <span>
                    第 {casePage} / {caseTotalPages} 页 · 筛选后 {filteredCases.length} 条
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={casePage <= 1}
                      onClick={() => setCasePage((p) => p - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={casePage >= caseTotalPages}
                      onClick={() => setCasePage((p) => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* 关联追溯区 */}
      <div className="space-y-2 no-print">
        <details className="rounded-lg border bg-card px-4 py-2">
          <summary className="cursor-pointer font-medium text-sm">生成参数与模板快照</summary>
          <div className="mt-3 text-xs text-muted-foreground space-y-2">
            <p>
              模型标识：<span className="text-foreground">{record.modelId}</span> · 展示名{' '}
              {record.modelName}
            </p>
            <p>关联模板名：{record.template?.name ?? '—'}（当前库内模板可在上方入口查看）</p>
            {record.generateParams != null && Object.keys(record.generateParams).length > 0 ? (
              <div className="space-y-1">
                <p className="text-foreground font-medium">已保存参数快照（JSON）</p>
                <pre className="text-[11px] whitespace-pre-wrap font-mono max-h-40 overflow-auto border rounded-md p-2 bg-muted/30 text-foreground">
                  {JSON.stringify(record.generateParams, null, 2)}
                </pre>
              </div>
            ) : (
              <p>本次记录无 generateParams 快照（旧数据或本地生成）。</p>
            )}
            {(record.promptTemplateSnapshot || record.template?.content) && (
              <div className="space-y-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const text =
                      record.promptTemplateSnapshot ?? record.template?.content ?? ''
                    void navigator.clipboard.writeText(text)
                    toast.success(
                      record.promptTemplateSnapshot ? '已复制当时模板快照' : '已复制当前库模板正文',
                    )
                  }}
                >
                  复制模板全文（优先快照）
                </Button>
              </div>
            )}
            <p className="text-[10px]">
              测试类型/粒度/场景占比等若未出现在快照中，一键复用将沿用生成页默认偏好。
            </p>
          </div>
        </details>
        <details className="rounded-lg border bg-card px-4 py-2" open>
          <summary className="cursor-pointer font-medium text-sm">导出 / 下载记录</summary>
          <div className="mt-3 overflow-x-auto">
            {downloads.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无导出记录</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1">时间</th>
                    <th className="py-1">来源</th>
                    <th className="py-1">格式</th>
                    <th className="py-1">操作人</th>
                    <th className="py-1">大小</th>
                    <th className="py-1">次数</th>
                    <th className="py-1">路径</th>
                  </tr>
                </thead>
                <tbody>
                  {downloads.map((d) => (
                    <tr key={`${d.source}-${d.id}`} className="border-b border-border/50">
                      <td className="py-1 whitespace-nowrap">
                        {formatDate(d.createdAt, 'MM-dd HH:mm')}
                      </td>
                      <td className="py-1">{d.source === 'record' ? '记录' : '用例集'}</td>
                      <td className="py-1">{d.format}</td>
                      <td className="py-1">{d.downloader?.username ?? '—'}</td>
                      <td className="py-1">
                        {d.fileSize != null ? `${Math.round(d.fileSize / 1024)} KB` : '—'}
                      </td>
                      <td className="py-1">{d.downloadCount ?? 1}</td>
                      <td
                        className="py-1 font-mono truncate max-w-[180px]"
                        title={d.downloadUrl ?? ''}
                      >
                        {d.downloadUrl ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">
              「记录」来源为按生成记录维度落库的导出流水；重新导出请使用顶部「导出」。
            </p>
          </div>
        </details>
        <details className="rounded-lg border bg-card px-4 py-2" open>
          <summary className="cursor-pointer font-medium text-sm">操作日志</summary>
          <div className="mt-3 overflow-x-auto">
            {!record.auditLogs?.length ? (
              <p className="text-xs text-muted-foreground">暂无审计记录</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1">时间</th>
                    <th className="py-1">操作人</th>
                    <th className="py-1">动作</th>
                    <th className="py-1">IP</th>
                    <th className="py-1">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {record.auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border/50 align-top">
                      <td className="py-1 whitespace-nowrap">
                        {formatDate(log.createdAt, 'MM-dd HH:mm')}
                      </td>
                      <td className="py-1">{log.operator?.username ?? log.operatorId.slice(0, 8)}</td>
                      <td className="py-1 font-mono">{log.action}</td>
                      <td className="py-1">{log.ip ?? '—'}</td>
                      <td className="py-1 max-w-[200px] truncate font-mono text-[10px]">
                        {log.detail != null ? JSON.stringify(log.detail) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
        <details className="rounded-lg border bg-card px-4 py-2">
          <summary className="cursor-pointer font-medium text-sm">版本对比</summary>
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-muted-foreground">
              输入另一条可访问的生成记录 ID，对比两者用例集差异（不回滚数据）。
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <Input
                className="h-8 max-w-[280px] text-xs font-mono"
                placeholder="另一条记录 ID"
                value={compareOtherId}
                onChange={(e) => setCompareOtherId(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={compareBusy}
                onClick={() => void runCompare()}
              >
                {compareBusy ? '对比中…' : '对比'}
              </Button>
            </div>
            {compareResult && (
              <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
                <div className="rounded border p-2 bg-muted/20">
                  <p className="font-medium text-foreground mb-1">新增 ({compareResult.added.length})</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    {compareResult.added.slice(0, 20).map((x) => (
                      <li key={x.id}>{x.title}</li>
                    ))}
                  </ul>
                  {compareResult.added.length > 20 ? <p>…</p> : null}
                </div>
                <div className="rounded border p-2 bg-muted/20">
                  <p className="font-medium text-foreground mb-1">
                    删除 ({compareResult.removed.length})
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    {compareResult.removed.slice(0, 20).map((x) => (
                      <li key={x.id}>{x.title}</li>
                    ))}
                  </ul>
                  {compareResult.removed.length > 20 ? <p>…</p> : null}
                </div>
                <div className="rounded border p-2 bg-muted/20">
                  <p className="font-medium text-foreground mb-1">
                    变更 ({compareResult.changed.length})
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    {compareResult.changed.slice(0, 10).map((x, i) => (
                      <li key={`${x.leftId}-${i}`}>{x.title}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </details>
      </div>

      <div className="no-print pt-4">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navWithGuard('/records')}>
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </Button>
      </div>
    </div>
  )
}
