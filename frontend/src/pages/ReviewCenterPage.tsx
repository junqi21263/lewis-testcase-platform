import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  GitCompare,
  History,
  Loader2,
  MessageSquare,
  Save,
  Search,
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
  }
}

function snapshotKey(s: CaseSnapshot): string {
  return JSON.stringify(s)
}

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
  const [onlyFailed, setOnlyFailed] = useState(false)
  const [onlyComments, setOnlyComments] = useState(false)
  const [onlyDirty, setOnlyDirty] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const [sidePanel, setSidePanel] = useState<'versions' | 'diff' | null>(null)
  const [versions, setVersions] = useState<CaseVersionItem[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [diffFields, setDiffFields] = useState<VersionDiffField[]>([])
  const [diffLoading, setDiffLoading] = useState(false)

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
    setStatusBusy(true)
    try {
      await reviewsApi.batchStatus(recordId, {
        caseIds: [...checked],
        status,
      })
      toast.success(`已批量更新 ${checked.size} 条`)
      setChecked(new Set())
      await loadWorkspace()
      if (selectedId) await loadCaseDetail(selectedId)
    } catch (e) {
      toast.error((e as Error).message || '批量操作失败')
    } finally {
      setStatusBusy(false)
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
        </header>

        <div className={rev.workspace}>
          <aside className={rev.listPanel}>
            <div className={rev.listToolbar}>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--review-text-muted))]" />
                <Input
                  className="h-9 pl-8"
                  placeholder="搜索标题…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <select
                  className="h-8 max-w-full rounded-lg bg-[hsl(var(--review-input-bg))] px-2 text-xs ring-1 ring-[hsl(var(--review-border))]"
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
                  className="h-8 rounded-lg bg-[hsl(var(--review-input-bg))] px-2 text-xs ring-1 ring-[hsl(var(--review-border))]"
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
                  className="h-8 rounded-lg bg-[hsl(var(--review-input-bg))] px-2 text-xs ring-1 ring-[hsl(var(--review-border))]"
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
              <div className="flex flex-wrap gap-1.5">
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
              <div className="mt-3">
                <BulkActionBar
                  count={checked.size}
                  busy={statusBusy}
                  onClear={() => setChecked(new Set())}
                  onApprove={() => void batchStatus('approved')}
                  onRequestChanges={() => void batchStatus('changes_requested')}
                />
              </div>
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

          <main className={cn(rev.detailPanel, 'relative')}>
            {!selectedCase || !draft ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[hsl(var(--review-text-muted))]">
                {workspace.cases.length === 0 ? '该记录暂无用例' : '请选择一条用例'}
              </div>
            ) : (
              <div className="relative flex min-h-0 flex-1 flex-col">
                <div className={rev.detailToolbar} data-testid="review-detail-toolbar">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CaseReviewStatusBadge status={selectedCase.reviewStatus} />
                      <span className="text-xs text-[hsl(var(--review-text-muted))]">
                        v{selectedCase.currentVersionNumber}
                        {isDirty ? (
                          <span className="ml-2 font-medium text-amber-600 dark:text-amber-300">
                            · 未保存
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-[hsl(var(--review-text-primary))]">
                      {selectedCase.title}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      disabled={statusBusy}
                      data-testid="review-approve-btn"
                      onClick={() => void setReviewStatus('approved')}
                    >
                      <Check className="h-3.5 w-3.5" />
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={statusBusy}
                      onClick={() => void setReviewStatus('changes_requested')}
                    >
                      待修改
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-rose-600"
                      disabled={statusBusy}
                      onClick={() => void setReviewStatus('rejected')}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      驳回
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1"
                      data-testid="review-versions-btn"
                      onClick={() => void openVersions()}
                    >
                      <History className="h-3.5 w-3.5" />
                      版本
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1"
                      onClick={() => void openDiff()}
                    >
                      <GitCompare className="h-3.5 w-3.5" />
                      Diff
                    </Button>
                  </div>
                </div>

                <div className={rev.detailBody}>
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

                  <div className="mt-8 border-t border-[hsl(var(--review-border))] pt-6">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[hsl(var(--review-text-primary))]">
                      <MessageSquare className="h-4 w-4" />
                      评论与修改建议
                    </h3>
                    {commentsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
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
                  </div>
                </div>

                <div className="relative z-[30] flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[hsl(var(--review-border))] bg-[hsl(var(--review-panel-bg))] px-4 py-3">
                  <Button size="sm" variant="ghost" disabled={saving || !isDirty} onClick={() => void handleCancelEdit()}>
                    取消修改
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={saving || !isDirty}
                    data-testid="review-save-btn"
                    onClick={() => void handleSave()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    保存
                  </Button>
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
        active ? rev.caseRowActive : rev.caseRowIdle,
      )}
    >
      <div className="flex gap-2">
        <input
          type="checkbox"
          className="mt-1 shrink-0"
          checked={checked}
          onChange={(e) => {
            e.stopPropagation()
            onCheck()
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-sm font-medium text-[hsl(var(--review-text-primary))]">
              {item.title}
            </span>
            <CaseReviewStatusBadge status={item.reviewStatus} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-[hsl(var(--review-text-muted))]">
            <span>{item.priority}</span>
            <span>{CASE_TYPE_LABELS[item.type] ?? item.type}</span>
            <span>v{item.currentVersionNumber}</span>
            {dirty ? <span className="text-amber-600 dark:text-amber-300">未保存</span> : null}
          </div>
        </button>
      </div>
    </div>
  )
}
