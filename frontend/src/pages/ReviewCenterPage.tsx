import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GitCompare,
  History,
  Loader2,
  MessageSquare,
  Save,
  Search,
  Upload,
  XCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reviewsApi } from '@/api/reviews'
import { BulkActionBar } from '@/components/reviews/BulkActionBar'
import { CaseReviewStatusBadge, RecordReviewStatusBadge } from '@/components/reviews/ReviewStatusBadge'
import { ReviewCommentComposer, ReviewCommentList } from '@/components/reviews/ReviewComments'
import {
  TestCaseEditor,
  validateCaseSnapshot,
  type TestCaseEditorErrors,
} from '@/components/reviews/TestCaseEditor'
import { ReviewSidePanel, VersionHistoryPanel } from '@/components/reviews/VersionHistoryPanel'
import { VersionDiffViewer } from '@/components/reviews/VersionDiffViewer'
import type {
  CaseReviewStatus,
  CaseSnapshot,
  CaseVersionItem,
  ExecutionResultsImportResponse,
  ReviewComment,
  ReviewWorkspace,
  ReviewWorkspaceCase,
  VersionDiffField,
} from '@/types/reviews'
import { appConfirm } from '@/store/appConfirmStore'
import {
  CASE_TYPE_LABELS,
  CASE_TYPES,
  rev,
  caseReviewStatusLabel,
} from '@/utils/reviewsUi'
import {
  getReviewQueueBadges,
  matchesReviewQueueFilter,
  REVIEW_QUEUE_OPTIONS,
  type ReviewQueueFilter,
} from '@/utils/reviewQueue'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/format'

function normalizeSnapshot(raw: CaseSnapshot): CaseSnapshot {
  return {
    title: raw.title ?? '',
    priority: raw.priority ?? 'P2',
    type: raw.type ?? 'FUNCTIONAL',
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    precondition: raw.precondition ?? '',
    steps: (raw.steps ?? []).map((s, i) => ({
      order: s.order ?? i + 1,
      action: s.action ?? '',
      expected: s.expected,
    })),
    expectedResults:
      raw.expectedResults?.length
        ? [...raw.expectedResults]
        : raw.expectedResult
          ? [raw.expectedResult]
          : [''],
    expectedResult: raw.expectedResult ?? '',
    remarks: raw.remarks ?? '',
    requirementIds: Array.isArray(raw.requirementIds) ? raw.requirementIds.map(String) : [],
    testPathIds: Array.isArray(raw.testPathIds) ? raw.testPathIds.map(String) : [],
    automationReadiness: raw.automationReadiness ?? null,
  }
}

function snapshotKey(s: CaseSnapshot): string {
  return JSON.stringify(s)
}

const executionResultExample = JSON.stringify(
  {
    source: 'playwright',
    summary: '本地自动化回归',
    results: [
      {
        tpId: 'TP-001',
        reqId: 'REQ-001',
        title: '登录用例',
        status: 'failed',
        durationMs: 900,
        errorMessage: '页面未展示错误提示',
      },
    ],
  },
  null,
  2,
)

export default function ReviewCenterPage() {
  const { recordId } = useParams<{ recordId: string }>()
  const navigate = useNavigate()

  const [workspace, setWorkspace] = useState<ReviewWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CaseSnapshot | null>(null)
  const [savedKey, setSavedKey] = useState('')
  const [editorErrors, setEditorErrors] = useState<TestCaseEditorErrors>({})
  const [saving, setSaving] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CaseReviewStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [queueFilter, setQueueFilter] = useState<ReviewQueueFilter>('all')
  const [onlyFailed, setOnlyFailed] = useState(false)
  const [onlyComments, setOnlyComments] = useState(false)
  const [onlyDirty, setOnlyDirty] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const [sidePanel, setSidePanel] = useState<'versions' | 'diff' | null>(null)
  const [versions, setVersions] = useState<CaseVersionItem[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [diffFields, setDiffFields] = useState<VersionDiffField[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false)
  const [executionJson, setExecutionJson] = useState(executionResultExample)
  const [executionImporting, setExecutionImporting] = useState(false)
  const [executionSummary, setExecutionSummary] = useState<ExecutionResultsImportResponse | null>(null)

  const dirtyIdsRef = useRef<Set<string>>(new Set())
  const draftRef = useRef<CaseSnapshot | null>(null)
  const savedKeyRef = useRef('')

  const isDirty = draft != null && savedKey !== '' && snapshotKey(draft) !== savedKey

  useEffect(() => {
    draftRef.current = draft
    savedKeyRef.current = savedKey
  }, [draft, savedKey])

  const loadWorkspace = useCallback(async () => {
    if (!recordId) return
    setLoading(true)
    try {
      let ws = await reviewsApi.getWorkspace(recordId)
      const needsBootstrap =
        ws.cases.length > 0 && ws.cases.every((c) => !c.reviewId) && ws.record.suiteId
      if (needsBootstrap) {
        await reviewsApi.bootstrap(recordId)
        ws = await reviewsApi.getWorkspace(recordId)
      }
      setWorkspace(ws)
      if (!selectedId && ws.cases.length) {
        setSelectedId(ws.cases[0].id)
      }
    } catch (e) {
      toast.error((e as Error).message || '加载评审中心失败')
      setWorkspace(null)
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const loadCaseDetail = useCallback(
    async (caseId: string) => {
      if (!recordId) return
      setCommentsLoading(true)
      try {
        const res = await reviewsApi.getCaseDetail(recordId, caseId)
        const snap = normalizeSnapshot(res.snapshot)
        setDraft(snap)
        setSavedKey(snapshotKey(snap))
        setEditorErrors({})
        setComments(res.comments ?? [])
        dirtyIdsRef.current.delete(caseId)
      } catch (e) {
        toast.error((e as Error).message || '加载用例失败')
      } finally {
        setCommentsLoading(false)
      }
    },
    [recordId],
  )

  useEffect(() => {
    if (!selectedId) return
    void loadCaseDetail(selectedId)
  }, [selectedId, loadCaseDetail])

  const confirmDiscard = async (): Promise<boolean> => {
    if (!isDirty) return true
    return appConfirm({
      title: '放弃未保存的修改？',
      description: '当前用例有未保存的编辑，切换后将丢失这些更改。',
      confirmText: '放弃修改',
      confirmVariant: 'destructive',
    })
  }

  const selectCase = async (caseId: string) => {
    if (caseId === selectedId) return
    const ok = await confirmDiscard()
    if (!ok) return
    if (isDirty && selectedId) dirtyIdsRef.current.add(selectedId)
    setSelectedId(caseId)
  }

  const filteredCases = useMemo(() => {
    if (!workspace) return []
    let list = workspace.cases
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((c) => c.title.toLowerCase().includes(q))
    if (statusFilter !== 'all') list = list.filter((c) => c.reviewStatus === statusFilter)
    if (priorityFilter !== 'all') list = list.filter((c) => c.priority === priorityFilter)
    if (typeFilter !== 'all') list = list.filter((c) => c.type === typeFilter)
    if (queueFilter !== 'all') list = list.filter((c) => matchesReviewQueueFilter(c, queueFilter))
    if (onlyFailed) {
      list = list.filter(
        (c) => c.reviewStatus === 'changes_requested' || c.reviewStatus === 'rejected',
      )
    }
    if (onlyComments) list = list.filter((c) => Boolean(c.latestComment?.trim()))
    if (onlyDirty) {
      list = list.filter((c) => {
        if (c.id === selectedId && isDirty) return true
        return dirtyIdsRef.current.has(c.id)
      })
    }
    return list
  }, [
    workspace,
    search,
    statusFilter,
    priorityFilter,
    typeFilter,
    queueFilter,
    onlyFailed,
    onlyComments,
    onlyDirty,
    selectedId,
    isDirty,
  ])

  const selectedCase = workspace?.cases.find((c) => c.id === selectedId)

  const handleSave = async () => {
    if (!recordId || !selectedId || !draft) return
    const errs = validateCaseSnapshot(draft)
    setEditorErrors(errs)
    if (Object.keys(errs).length) {
      toast.error('请修正表单错误后再保存')
      return
    }
    setSaving(true)
    try {
      const res = await reviewsApi.saveCase(recordId, selectedId, draft)
      toast.success(`已保存为 v${res.versionNumber}`)
      setSavedKey(snapshotKey(draft))
      dirtyIdsRef.current.delete(selectedId)
      await loadWorkspace()
      if (selectedId) await loadCaseDetail(selectedId)
    } catch (e) {
      toast.error((e as Error).message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = async () => {
    if (!selectedId) return
    if (isDirty) {
      const ok = await appConfirm({
        title: '放弃未保存的修改？',
        confirmText: '放弃',
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    await loadCaseDetail(selectedId)
  }

  const setReviewStatus = async (
    status: CaseReviewStatus,
    opts?: { comment?: string; confirmReject?: boolean },
  ) => {
    if (!recordId || !selectedId) return
    if (status === 'rejected') {
      const ok = await appConfirm({
        title: '驳回该用例？',
        confirmText: '确认驳回',
        confirmVariant: 'destructive',
      })
      if (!ok) return
    }
    setStatusBusy(true)
    try {
      await reviewsApi.updateStatus(recordId, selectedId, {
        status,
        comment: opts?.comment,
        commentType: status === 'changes_requested' ? 'change_request' : 'note',
      })
      toast.success('评审状态已更新')
      await loadWorkspace()
      await loadCaseDetail(selectedId)
    } catch (e) {
      toast.error((e as Error).message || '状态更新失败')
    } finally {
      setStatusBusy(false)
    }
  }

  const batchStatus = async (status: CaseReviewStatus) => {
    if (!recordId || checked.size === 0) return
    const ids = [...checked]
    const label =
      status === 'approved' ? '通过' : status === 'changes_requested' ? '待修改' : '更新'
    const ok = await appConfirm({
      title: `批量${label} ${ids.length} 条用例？`,
      description: '将同时更新所选用例的评审状态。',
      confirmText: `确认批量${label}`,
    })
    if (!ok) return
    setStatusBusy(true)
    try {
      await reviewsApi.batchStatus(recordId, {
        caseIds: ids,
        status,
      })
      toast.success(`已批量${label} ${ids.length} 条`)
      setChecked(new Set())
      await loadWorkspace()
      if (selectedId) await loadCaseDetail(selectedId)
    } catch (e) {
      toast.error((e as Error).message || '批量操作失败')
    } finally {
      setStatusBusy(false)
    }
  }

  const importExecutionResults = async () => {
    if (!recordId) return
    setExecutionImporting(true)
    try {
      const parsed = JSON.parse(executionJson)
      const res = await reviewsApi.importExecutionResults(recordId, parsed)
      setExecutionSummary(res)
      toast.success(`执行结果导入完成：匹配 ${res.matched} 条，未匹配 ${res.unmatched} 条`)
      await loadWorkspace()
      if (selectedId) await loadCaseDetail(selectedId)
    } catch (e) {
      const message = e instanceof SyntaxError ? 'JSON 格式不正确' : (e as Error).message || '导入执行结果失败'
      toast.error(message)
    } finally {
      setExecutionImporting(false)
    }
  }

  const openVersions = async () => {
    if (!selectedId) return
    setSidePanel('versions')
    setVersionsLoading(true)
    try {
      const list = await reviewsApi.listVersions(selectedId)
      setVersions(list)
    } catch (e) {
      toast.error((e as Error).message || '加载版本失败')
    } finally {
      setVersionsLoading(false)
    }
  }

  const openDiff = async (leftVersionId?: string) => {
    if (!selectedId) return
    setSidePanel('diff')
    setDiffLoading(true)
    try {
      const fields = await reviewsApi.diff(selectedId, { leftVersionId })
      setDiffFields(fields)
    } catch (e) {
      toast.error((e as Error).message || '加载 diff 失败')
    } finally {
      setDiffLoading(false)
    }
  }

  const restoreVersion = async (versionId: string, versionNumber: number) => {
    const ok = await appConfirm({
      title: `恢复至 v${versionNumber}？`,
      description: '将基于该版本快照创建新版本，不会删除历史记录。',
      confirmText: '确认恢复',
    })
    if (!ok) return
    try {
      const res = await reviewsApi.restoreVersion(versionId)
      toast.success(`已恢复为 v${res.versionNumber}`)
      setSidePanel(null)
      await loadWorkspace()
      if (selectedId) await loadCaseDetail(selectedId)
    } catch (e) {
      toast.error((e as Error).message || '恢复失败')
    }
  }

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const filteredIds = useMemo(() => filteredCases.map((c) => c.id), [filteredCases])
  const allFilteredChecked =
    filteredIds.length > 0 && filteredIds.every((id) => checked.has(id))
  const someFilteredChecked = filteredIds.some((id) => checked.has(id))

  const toggleSelectAllFiltered = () => {
    setChecked((prev) => {
      const n = new Set(prev)
      if (allFilteredChecked) {
        for (const id of filteredIds) n.delete(id)
      } else {
        for (const id of filteredIds) n.add(id)
      }
      return n
    })
  }

  const selectNextFilteredCase = async () => {
    if (filteredCases.length === 0) return
    const currentIndex = filteredCases.findIndex((c) => c.id === selectedId)
    const next = filteredCases[currentIndex >= 0 ? (currentIndex + 1) % filteredCases.length : 0]
    if (next) await selectCase(next.id)
  }

  if (!recordId) {
    return (
      <div className={rev.page}>
        <p className="p-8 text-sm text-muted-foreground">缺少记录 ID</p>
      </div>
    )
  }

  if (loading && !workspace) {
    return (
      <div className={cn(rev.page, 'flex items-center justify-center')}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className={rev.page}>
        <div className="p-8">
          <p className="text-sm text-muted-foreground">无法加载评审数据</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/records')}>
            返回生成记录
          </Button>
        </div>
      </div>
    )
  }

  const { record, summary } = workspace

  return (
    <div className={rev.page}>
      <div className={rev.shell}>
        <header className={rev.header}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
                <Link to="/records">
                  <ArrowLeft className="h-4 w-4" />
                  生成记录
                </Link>
              </Button>
              <RecordReviewStatusBadge status={summary.status} />
            </div>
            <h1 className={cn(rev.headerTitle, 'mt-2')}>{record.title}</h1>
            <p className={rev.headerMeta}>
              {record.suite?.name ? `${record.suite.name} · ` : ''}
              {record.modelName} · {formatDate(record.createdAt)} · {record.caseCount} 条用例
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={rev.btnSecondary}
              onClick={() => {
                setExecutionSummary(null)
                setExecutionDialogOpen(true)
              }}
            >
              <Upload className="h-3.5 w-3.5" />
              导入执行结果
            </Button>
          </div>
        </header>

        {workspace.coverageMatrix && workspace.coverageMatrix.length > 0 && (
          <section
            className="rounded-xl border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] p-3"
            data-testid="review-coverage-matrix"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-[hsl(var(--review-text-primary))]">
                  需求覆盖矩阵
                </h2>
                <p className="text-xs text-[hsl(var(--review-text-muted))]">
                  按 REQ-ID 追踪关联用例与最新执行结果
                </p>
              </div>
              <span className="rounded-full border border-[hsl(var(--review-panel-border))] px-2 py-1 text-xs text-[hsl(var(--review-text-secondary))]">
                {workspace.coverageMatrix.filter((item) => item.coveredCaseIds.length > 0).length}/{workspace.coverageMatrix.length} 已覆盖
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {workspace.coverageMatrix.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-chip-bg))] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-[hsl(var(--review-text-primary))]">
                      {item.reqId}
                    </span>
                    <span className="rounded-full bg-[hsl(var(--review-row-accent))]/15 px-2 py-0.5 text-[10px] text-[hsl(var(--review-row-accent))]">
                      {item.coveredCaseIds.length} 用例
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[hsl(var(--review-text-secondary))]">
                    {item.requirementText}
                  </p>
                  <p className="mt-1 text-[11px] text-[hsl(var(--review-text-muted))]">
                    执行：{item.latestExecutionStatus || item.gapReason || '未回写'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {executionDialogOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[hsl(var(--review-text-primary))]">
                    导入执行结果
                  </h2>
                  <p className="mt-1 text-xs text-[hsl(var(--review-text-muted))]">
                    支持 Playwright 或 Test Agent 输出整理后的 JSON，优先按 caseId 匹配。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={rev.btnGhost}
                  onClick={() => setExecutionDialogOpen(false)}
                >
                  关闭
                </Button>
              </div>
              <label className="mt-4 block text-xs font-medium text-[hsl(var(--review-text-secondary))]">
                执行结果 JSON
                <textarea
                  className={cn(rev.input, 'mt-2 min-h-[260px] w-full resize-y p-3 font-mono text-xs leading-5')}
                  value={executionJson}
                  onChange={(e) => setExecutionJson(e.target.value)}
                />
              </label>
              {executionSummary && (
                <div className="mt-3 rounded-xl border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-chip-bg))] p-3 text-xs text-[hsl(var(--review-text-secondary))]">
                  <p>
                    匹配 {executionSummary.matched} 条，未匹配 {executionSummary.unmatched} 条，通过 {executionSummary.passed} 条，失败 {executionSummary.failed} 条，跳过 {executionSummary.skipped} 条
                  </p>
                  {executionSummary.unmatchedItems.length > 0 && (
                    <p className="mt-1 text-[hsl(var(--review-badge-warning-text))]">
                      未匹配：{executionSummary.unmatchedItems.map((item) => item.title || item.caseId || item.reason).join('、')}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={rev.btnSecondary}
                  onClick={() => setExecutionJson(executionResultExample)}
                  disabled={executionImporting}
                >
                  恢复示例
                </Button>
                <Button
                  type="button"
                  className={rev.btnPrimary}
                  onClick={() => void importExecutionResults()}
                  disabled={executionImporting}
                >
                  {executionImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  确认导入
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className={rev.workspace}>
          <aside className={rev.listPanel}>
            <div className={rev.listToolbar}>
              <div className={rev.listToolbarSection}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--review-text-muted))]" />
                  <Input
                    className={cn(rev.input, 'h-10 pl-9')}
                    placeholder="搜索标题…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    className={rev.select}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as CaseReviewStatus | 'all')}
                  >
                    <option value="all">全部状态</option>
                    {(
                      [
                        'pending_review',
                        'approved',
                        'changes_requested',
                        'rejected',
                        'draft',
                      ] as CaseReviewStatus[]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {caseReviewStatusLabel(s)}
                      </option>
                    ))}
                  </select>
                  <select
                    className={rev.select}
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                  >
                    <option value="all">优先级</option>
                    {['P0', 'P1', 'P2', 'P3'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    className={rev.select}
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                  >
                    <option value="all">类型</option>
                    {CASE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {CASE_TYPE_LABELS[t] ?? t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={rev.listToolbarSection}>
                <div className="flex flex-wrap items-center gap-2">
                  {REVIEW_QUEUE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        queueFilter === option.value
                          ? rev.chipActive + ' ' + rev.chip
                          : rev.chipGhost + ' ' + rev.chip
                      }
                      onClick={() => setQueueFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(rev.btnSecondary, 'h-8 gap-1 px-2 text-xs')}
                    disabled={filteredCases.length === 0}
                    onClick={() => void selectNextFilteredCase()}
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    下一条
                  </Button>
                </div>
              </div>
              <div className={rev.listToolbarSection}>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={onlyFailed ? rev.chipActive + ' ' + rev.chip : rev.chipGhost + ' ' + rev.chip}
                    onClick={() => setOnlyFailed((v) => !v)}
                  >
                    未通过
                  </button>
                  <button
                    type="button"
                    className={
                      onlyComments ? rev.chipActive + ' ' + rev.chip : rev.chipGhost + ' ' + rev.chip
                    }
                    onClick={() => setOnlyComments((v) => !v)}
                  >
                    有评论
                  </button>
                  <button
                    type="button"
                    className={onlyDirty ? rev.chipActive + ' ' + rev.chip : rev.chipGhost + ' ' + rev.chip}
                    onClick={() => setOnlyDirty((v) => !v)}
                  >
                    有未保存修改
                  </button>
                </div>
              </div>
            </div>

            <div className={rev.listBulkZone}>
              <BulkActionBar
                count={checked.size}
                busy={statusBusy}
                onClear={() => setChecked(new Set())}
                onApprove={() => void batchStatus('approved')}
                onRequestChanges={() => void batchStatus('changes_requested')}
              />
              {filteredCases.length > 0 ? (
                <label className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-1 hover:bg-[hsl(var(--review-row-hover-bg))]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[hsl(var(--review-row-accent))]"
                    checked={allFilteredChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someFilteredChecked && !allFilteredChecked
                    }}
                    onChange={toggleSelectAllFiltered}
                    data-testid="review-select-all"
                  />
                  <span className="text-xs font-medium text-[hsl(var(--review-text-secondary))]">
                    全选当前列表（{filteredCases.length}）
                  </span>
                </label>
              ) : null}
            </div>

            <div className={rev.listScroll}>
              {filteredCases.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-[hsl(var(--review-text-muted))]">
                  无匹配用例
                </p>
              ) : (
                filteredCases.map((c) => (
                  <CaseListItem
                    key={c.id}
                    item={c}
                    active={c.id === selectedId}
                    checked={checked.has(c.id)}
                    dirty={
                      (c.id === selectedId && isDirty) || dirtyIdsRef.current.has(c.id)
                    }
                    onSelect={() => void selectCase(c.id)}
                    onCheck={() => toggleCheck(c.id)}
                  />
                ))
              )}
            </div>
          </aside>

          <main className={rev.detailPanel}>
            {!selectedCase || !draft ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-[hsl(var(--review-text-muted))]">
                {workspace.cases.length === 0 ? '该记录暂无用例' : '请选择一条用例'}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className={rev.detailToolbar} data-testid="review-detail-toolbar">
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <CaseReviewStatusBadge status={selectedCase.reviewStatus} />
                      <span className="text-xs text-[hsl(var(--review-text-muted))]">
                        v{selectedCase.currentVersionNumber}
                        {isDirty ? (
                          <span className="ml-2 font-medium text-[hsl(var(--review-badge-warning-text))]">
                            · 未保存
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-base font-semibold leading-snug text-[hsl(var(--review-text-primary))]">
                      {selectedCase.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(draft.requirementIds ?? []).map((id) => (
                        <span key={id} className="rounded-full border border-[hsl(var(--review-panel-border))] px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--review-text-secondary))]">
                          {id}
                        </span>
                      ))}
                      {(draft.testPathIds ?? []).map((id) => (
                        <span key={id} className="rounded-full border border-[hsl(var(--review-row-accent))]/40 px-2 py-0.5 font-mono text-[10px] text-[hsl(var(--review-row-accent))]">
                          {id}
                        </span>
                      ))}
                      {draft.automationReadiness?.status ? (
                        <span className="rounded-full border border-[hsl(var(--review-panel-border))] px-2 py-0.5 text-[10px] text-[hsl(var(--review-text-muted))]">
                          {draft.automationReadiness.status}：{draft.automationReadiness.reason}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={rev.actionGroup}>
                      <Button
                        type="button"
                        size="sm"
                        className={rev.btnPrimary}
                        disabled={statusBusy}
                        data-testid="review-approve-btn"
                        onClick={() => void setReviewStatus('approved')}
                      >
                        <Check className="h-3.5 w-3.5" />
                        通过
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={rev.btnSecondary}
                        disabled={statusBusy}
                        onClick={() => void setReviewStatus('changes_requested')}
                      >
                        待修改
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={rev.btnDanger}
                        disabled={statusBusy}
                        onClick={() => void setReviewStatus('rejected')}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        驳回
                      </Button>
                    </div>
                    <span className={rev.actionDivider} aria-hidden />
                    <div className={rev.actionGroup}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={rev.btnGhost}
                        data-testid="review-versions-btn"
                        onClick={() => void openVersions()}
                      >
                        <History className="h-3.5 w-3.5" />
                        版本
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={rev.btnGhost}
                        onClick={() => void openDiff()}
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                        Diff
                      </Button>
                    </div>
                  </div>
                </div>

                <div className={rev.detailBody}>
                  <div key={selectedId} className="review-detail-fade">
                    <TestCaseEditor
                      value={draft}
                      onChange={(next) => {
                        setDraft(next)
                        if (selectedId && snapshotKey(next) !== savedKeyRef.current) {
                          dirtyIdsRef.current.add(selectedId)
                        }
                      }}
                      errors={editorErrors}
                    />

                    <section className={rev.commentSection}>
                      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--review-text-primary))]">
                        <MessageSquare className="h-4 w-4 text-[hsl(var(--review-text-muted))]" />
                        评论与修改建议
                      </h3>
                      {commentsLoading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--review-text-muted))]" />
                      ) : (
                        <ReviewCommentList comments={comments} />
                      )}
                      <ReviewCommentComposer
                        busy={statusBusy}
                        onSubmit={async (content, commentType) => {
                          if (!recordId || !selectedId) return
                          await reviewsApi.addComment(recordId, selectedId, {
                            content,
                            commentType,
                          })
                          toast.success('评论已提交')
                          await loadCaseDetail(selectedId)
                        }}
                      />
                    </section>
                  </div>
                </div>

                <div className={rev.detailStickyFooter}>
                  <p className="mb-2 text-[11px] text-[hsl(var(--review-text-muted))]">
                    用例编辑保存区 — 仅保存结构化字段，与上方评论提交无关
                  </p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={rev.btnGhost}
                      disabled={saving || !isDirty}
                      onClick={() => void handleCancelEdit()}
                    >
                      取消修改
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={rev.btnPrimary}
                      disabled={saving || !isDirty}
                      data-testid="review-save-btn"
                      onClick={() => void handleSave()}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      保存用例
                    </Button>
                  </div>
                </div>

                {sidePanel === 'versions' ? (
                  <ReviewSidePanel open title="版本历史" onClose={() => setSidePanel(null)}>
                    <VersionHistoryPanel
                      versions={versions}
                      currentVersion={selectedCase?.currentVersionNumber ?? 1}
                      loading={versionsLoading}
                      onSelectDiff={(id) => void openDiff(id)}
                      onRestore={(id, num) => void restoreVersion(id, num)}
                    />
                  </ReviewSidePanel>
                ) : null}
                {sidePanel === 'diff' ? (
                  <ReviewSidePanel open title="版本对比" onClose={() => setSidePanel(null)}>
                    <VersionDiffViewer fields={diffFields} loading={diffLoading} />
                  </ReviewSidePanel>
                ) : null}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function CaseListItem(props: {
  item: ReviewWorkspaceCase
  active: boolean
  checked: boolean
  dirty: boolean
  onSelect: () => void
  onCheck: () => void
}) {
  const { item, active, checked, dirty, onSelect, onCheck } = props
  return (
    <div
      className={cn(
        rev.caseRow,
        active ? rev.caseRowActive : checked ? rev.caseRowChecked : rev.caseRowIdle,
      )}
      data-testid="review-case-row"
    >
      <div className={rev.caseRowInner}>
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--review-row-accent))]"
          checked={checked}
          data-testid="review-case-checkbox"
          onChange={(e) => {
            e.stopPropagation()
            onCheck()
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-start justify-between gap-3">
            <span className={rev.caseTitle}>{item.title}</span>
            <CaseReviewStatusBadge status={item.reviewStatus} />
          </div>
          <div className={rev.caseMeta}>
            <span className={rev.caseMetaPill}>{item.priority}</span>
            <span className={rev.caseMetaPill}>{CASE_TYPE_LABELS[item.type] ?? item.type}</span>
            <span className={rev.caseMetaPill}>v{item.currentVersionNumber}</span>
            {(item.requirementIds ?? []).slice(0, 2).map((id) => (
              <span key={id} className={rev.caseMetaPill}>{id}</span>
            ))}
            {(item.testPathIds ?? []).slice(0, 2).map((id) => (
              <span key={id} className={rev.caseMetaPill}>{id}</span>
            ))}
            {getReviewQueueBadges(item).map((badge) => (
              <span key={badge} className={rev.caseMetaPill}>
                {badge}
              </span>
            ))}
            {dirty ? (
              <span className="font-medium text-[hsl(var(--review-badge-warning-text))]">未保存</span>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  )
}
