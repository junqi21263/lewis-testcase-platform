import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { recordsApi, type RecordsListQuery, type RecordsSummary } from '@/api/records'
import { settingsApi } from '@/api/settings'
import { filesApi } from '@/api/files'
import { formatDate } from '@/utils/format'
import { copyTextToClipboard } from '@/utils/clipboard'
import { rec, recordStatusBadge } from '@/utils/recordsUi'
import { RecordsEmptyState } from '@/components/records/RecordsEmptyState'
import { RecordsSegmentedTabs } from '@/components/records/RecordsSegmentedTabs'
import { RecordsBatchBar } from '@/components/records/RecordsBatchBar'
import { RecordsRowActions } from '@/components/records/RecordsRowActions'
import type { GenerationRecord, GenerationStatus } from '@/types'
import { useGenerateStore, defaultGenerationOptions } from '@/store/generateStore'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  loadRecordsSort,
  saveRecordsSort,
  loadRecordsPageSize,
  saveRecordsPageSize,
  loadRecordsColumns,
  saveRecordsColumns,
  type RecordsSortState,
  type RecordsColumnKey,
} from '@/utils/recordsPrefs'
import { rangeFromPreset, toIsoDate, type DatePresetId } from '@/utils/recordsDateRange'
import { HighlightText } from '@/components/records/HighlightText'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'
import type { BatchRecordAction } from '@/types/records'

const STATUS_ORDER: GenerationStatus[] = [
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'ARCHIVED',
  'CANCELLED',
]

const statusLabels: Record<GenerationStatus, string> = {
  PENDING: '等待中',
  PROCESSING: '生成中',
  SUCCESS: '成功',
  FAILED: '失败',
  ARCHIVED: '已归档',
  CANCELLED: '已取消',
}

function sourceLabel(r: GenerationRecord): string {
  if (r.templateId) return '模板复用'
  if (r.sourceType === 'file' || r.fileId) return '需求文档带入'
  if (r.sourceType === 'text') return '手动输入'
  return r.sourceType || '其他'
}

function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  return `${m} m ${rs} s`
}

function promptSummary(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  return `${t.slice(0, n)}…`
}

type ConfirmState =
  | { type: 'none' }
  | { type: 'soft_delete'; ids: string[] }
  | { type: 'hard_delete'; ids: string[] }

const LS_FILTERS = 'records-filters-v1'

function loadFilterState(): {
  datePreset: DatePresetId
  dateFrom: string
  dateTo: string
  caseBucket: string
} {
  try {
    const raw = localStorage.getItem(LS_FILTERS)
    if (!raw)
      return { datePreset: 'custom', dateFrom: '', dateTo: '', caseBucket: 'all' }
    return { ...JSON.parse(raw) }
  } catch {
    return { datePreset: 'custom', dateFrom: '', dateTo: '', caseBucket: 'all' }
  }
}

function saveFilterState(s: ReturnType<typeof loadFilterState>) {
  localStorage.setItem(LS_FILTERS, JSON.stringify(s))
}

export default function RecordsPage() {
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<'list' | 'recycle'>('list')
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword, 400)
  const [statusSet, setStatusSet] = useState<Set<GenerationStatus>>(new Set())
  const [summary, setSummary] = useState<RecordsSummary | null>(null)

  const [datePreset, setDatePreset] = useState<DatePresetId>('custom')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [caseBucket, setCaseBucket] = useState('all')
  const [modelPick, setModelPick] = useState<string[]>([])
  const [sourcePick, setSourcePick] = useState<string[]>([])
  const [modelOptions, setModelOptions] = useState<{ modelId: string; modelName: string }[]>([])

  const formatModelLabel = useCallback((name: string) => {
    const t = String(name || '').trim()
    if (!t) return '（未知模型）'
    // 避免 select 选项过长撑破布局
    return t.length > 22 ? `${t.slice(0, 22)}…` : t
  }, [])

  const [sort, setSort] = useState<RecordsSortState>(() => loadRecordsSort())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(() => loadRecordsPageSize())
  const [cols, setCols] = useState(() => loadRecordsColumns())
  const [showColMenu, setShowColMenu] = useState(false)

  const [list, setList] = useState<GenerationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [focusIdx, setFocusIdx] = useState(-1)
  const [rowLoading, setRowLoading] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>({ type: 'none' })

  useEffect(() => {
    const f = loadFilterState()
    setDatePreset(f.datePreset ?? 'custom')
    setDateFrom(f.dateFrom ?? '')
    setDateTo(f.dateTo ?? '')
    setCaseBucket(f.caseBucket ?? 'all')
  }, [])

  useEffect(() => {
    saveFilterState({ datePreset, dateFrom, dateTo, caseBucket })
  }, [datePreset, dateFrom, dateTo, caseBucket])

  const buildQuery = useCallback((): RecordsListQuery => {
    const recycle = view === 'recycle' ? '1' : undefined
    const statuses =
      statusSet.size > 0 ? [...statusSet].sort().join(',') : undefined
    let df = dateFrom || undefined
    let dt = dateTo || undefined
    if (datePreset !== 'custom') {
      const r = rangeFromPreset(datePreset)
      if (r) {
        df = toIsoDate(r.from)
        dt = toIsoDate(r.to)
      }
    }
    return {
      page,
      pageSize,
      keyword: debouncedKeyword || undefined,
      statuses,
      dateFrom: df,
      dateTo: dt,
      models: modelPick.length ? modelPick.join(',') : undefined,
      caseBucket: caseBucket === 'all' ? undefined : caseBucket,
      sources: sourcePick.length ? sourcePick.join(',') : undefined,
      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
      recycle,
    }
  }, [
    view,
    page,
    pageSize,
    debouncedKeyword,
    statusSet,
    dateFrom,
    dateTo,
    datePreset,
    modelPick,
    caseBucket,
    sourcePick,
    sort,
  ])

  const fetchSummary = useCallback(async () => {
    try {
      const s = await recordsApi.getSummary()
      setSummary(s)
    } catch {
      /* 汇总失败不阻断列表 */
    }
  }, [])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = buildQuery()
      const res = await recordsApi.getRecords(q)
      setList(res.list)
      setTotal(res.total)
      setSelected(new Set())
      setFocusIdx(res.list.length ? 0 : -1)
    } catch (e) {
      setError((e as Error).message || '加载失败')
      setList([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary, view])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  useEffect(() => {
    recordsApi
      .getMetaModels()
      .then(setModelOptions)
      .catch(() => {})
  }, [])

  const statusCounts = useMemo(() => {
    if (!summary) return null
    return {
      PENDING: summary.pending,
      PROCESSING: summary.processing,
      SUCCESS: summary.success,
      FAILED: summary.failed,
      ARCHIVED: summary.archived,
      CANCELLED: summary.cancelled,
    } as Record<GenerationStatus, number>
  }, [summary])

  const toggleStatus = (st: GenerationStatus) => {
    setStatusSet((prev) => {
      const n = new Set(prev)
      if (n.has(st)) n.delete(st)
      else n.add(st)
      return n
    })
    setPage(1)
  }

  const clearAllFilters = () => {
    setKeyword('')
    setStatusSet(new Set())
    setDatePreset('custom')
    setDateFrom('')
    setDateTo('')
    setCaseBucket('all')
    setModelPick([])
    setSourcePick([])
    setPage(1)
  }

  const onSortHeader = (field: 'createdAt' | 'caseCount') => {
    setSort((prev) => {
      const next: RecordsSortState =
        prev.sortBy === field
          ? { sortBy: field, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' }
          : { sortBy: field, sortOrder: 'desc' }
      saveRecordsSort(next)
      return next
    })
    setPage(1)
  }

  const sortIcon = (field: 'createdAt' | 'caseCount') => {
    if (sort.sortBy !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />
    return sort.sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5" />
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectAllPage = () => {
    if (selected.size === list.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(list.map((r) => r.id)))
  }

  const selectAllMatching = async () => {
    try {
      const { page: _p, pageSize: _ps, ...rest } = buildQuery()
      const res = await recordsApi.getMatchingIds(rest)
      setSelected(new Set(res.ids))
      toast.success(
        `已选中 ${res.ids.length} 条${res.capped ? '（最多500条）' : ''}`,
      )
    } catch {
      toast.error('获取列表失败')
    }
  }

  const runBatch = async (action: BatchRecordAction) => {
    const ids = [...selected]
    if (!ids.length) return
    try {
      await recordsApi.batch(ids, action)
      toast.success('批量操作已提交')
      void fetchList()
      void fetchSummary()
    } catch {
      toast.error('批量操作失败')
    }
  }

  const exportBatchJson = () => {
    const rows = list.filter((r) => selected.has(r.id))
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `generation-records-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('已导出 JSON')
  }

  const openReuse = async (r: GenerationRecord) => {
    let uploadedFile = null as GenerationRecord['file'] | null
    if (r.fileId) {
      try {
        uploadedFile = await filesApi.getFileById(r.fileId)
      } catch {
        toast.error('无法获取关联文件信息（请确认文件仍存在）')
      }
    }
    let modelConfigId: string | undefined
    try {
      const models = await settingsApi.listModelsAdmin()
      modelConfigId = models.find((m) => m.modelId === r.modelId)?.id
    } catch {
      /* 无管理员权限时跳过 */
    }
    const gp = r.generateParams as { temperature?: number; maxTokens?: number } | undefined
    useGenerateStore.setState({
      sourceType: r.fileId ? 'file' : 'text',
      customPrompt: r.prompt || '',
      selectedTemplateId: r.templateId ?? null,
      userNotes: r.notes ?? '',
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
    toast.success('已带入生成页（含参数快照）')
  }

  const copyShare = async (r: GenerationRecord) => {
    const url = `${window.location.origin}/records/${r.id}`
    const ok = await copyTextToClipboard(url)
    if (ok) toast.success('链接已复制')
    else toast.error('复制失败，请检查浏览器权限')
  }

  const exportOne = (r: GenerationRecord) => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `record-${r.id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleRowAction = async (
    r: GenerationRecord,
    action: 'archive' | 'restore' | 'delete' | 'hard' | 'patch_active',
  ) => {
    setRowLoading(r.id)
    try {
      if (action === 'archive') {
        await recordsApi.patchRecord(r.id, { status: 'ARCHIVED' })
        toast.success('已归档')
      } else if (action === 'restore') {
        await recordsApi.restoreRecord(r.id)
        toast.success('已恢复')
      } else if (action === 'delete') {
        await recordsApi.deleteRecord(r.id)
        toast.success('已移入回收站')
      } else if (action === 'hard') {
        await recordsApi.permanentDelete(r.id)
        toast.success('已彻底删除')
      } else if (action === 'patch_active') {
        const next: GenerationStatus = r.caseCount > 0 ? 'SUCCESS' : 'PENDING'
        await recordsApi.patchRecord(r.id, { status: next })
        toast.success('已取消归档')
      }
      void fetchList()
      void fetchSummary()
    } catch {
      toast.error('操作失败')
    } finally {
      setRowLoading(null)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!list.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx((i) => Math.min(list.length - 1, i < 0 ? 0 : i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx((i) => Math.max(0, i < 0 ? 0 : i - 1))
    } else if (e.key === 'Enter' && focusIdx >= 0) {
      navigate(`/records/${list[focusIdx].id}`)
    } else if (e.key === 'Delete' && focusIdx >= 0) {
      setConfirm({ type: 'soft_delete', ids: [list[focusIdx].id] })
    }
  }

  const applyPreset = (id: DatePresetId) => {
    setDatePreset(id)
    setPage(1)
  }

  const gridTemplate = useMemo(() => {
    const parts = [
      '36px',
      'minmax(200px,1fr)',
      cols.model ? 'minmax(88px,1fr)' : '',
      cols.cases ? '72px' : '',
      cols.source ? '100px' : '',
      cols.duration ? '72px' : '',
      cols.created ? '120px' : '',
      cols.operator ? '88px' : '',
      '120px',
    ].filter(Boolean)
    return parts.join(' ')
  }, [cols])

  const hasActiveFilters = useMemo(() => {
    return (
      !!debouncedKeyword ||
      statusSet.size > 0 ||
      datePreset !== 'custom' ||
      !!dateFrom ||
      !!dateTo ||
      caseBucket !== 'all' ||
      modelPick.length > 0 ||
      sourcePick.length > 0
    )
  }, [debouncedKeyword, statusSet, datePreset, dateFrom, dateTo, caseBucket, modelPick, sourcePick])

  const filterSummary = useMemo(() => {
    const parts: string[] = []
    if (debouncedKeyword) parts.push(`关键词「${debouncedKeyword}」`)
    if (statusSet.size) {
      parts.push([...statusSet].map((s) => statusLabels[s]).join('、'))
    }
    if (datePreset !== 'custom') {
      const labels: Record<string, string> = {
        today: '今天',
        '7d': '近7天',
        '30d': '近30天',
        thisMonth: '本月',
        lastMonth: '上月',
      }
      parts.push(labels[datePreset] ?? '自定义时间')
    } else if (dateFrom || dateTo) {
      parts.push(`日期 ${dateFrom || '…'} — ${dateTo || '…'}`)
    }
    if (modelPick.length) parts.push(`模型 ${modelPick.length} 项`)
    if (caseBucket !== 'all') parts.push('用例数筛选')
    if (sourcePick.length) parts.push('来源筛选')
    return parts.length ? `已应用：${parts.join(' · ')}` : ''
  }, [
    debouncedKeyword,
    statusSet,
    datePreset,
    dateFrom,
    dateTo,
    modelPick,
    caseBucket,
    sourcePick,
  ])

  const toggleCol = (k: RecordsColumnKey) => {
    setCols((prev) => {
      const n = { ...prev, [k]: !prev[k] }
      saveRecordsColumns(n)
      return n
    })
  }

  const confirmCount = confirm.type === 'none' ? 0 : confirm.ids.length

  const emptyVariant =
    view === 'recycle'
      ? 'recycle'
      : hasActiveFilters
        ? 'no-match'
        : 'empty'

  return (
    <div className={cn(rec.page, rec.container, 'space-y-6')}>
      <header className="records-fade-up space-y-3">
        <div>
          <h1 className={rec.headerTitle}>生成记录</h1>
          <p className={rec.headerSub}>
            查看与管理 AI 用例生成历史，支持筛选、排序、批量与回收站
          </p>
        </div>
        <RecordsSegmentedTabs
          view={view}
          onChange={(v) => {
            setView(v)
            setPage(1)
          }}
        />
      </header>

      <div className="records-fade-up-d1 sticky top-0 z-20 space-y-2">
        <div className={rec.filterPanel}>
          <div className="space-y-2.5">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="flex flex-1 items-center gap-2 min-w-0">
                <div className="relative flex-1 min-w-0 max-w-md">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索标题、需求原文、错误备注、用例集名称…"
                    value={keyword}
                    onChange={(e) => {
                      setKeyword(e.target.value)
                      setPage(1)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && void fetchList()}
                    className="h-8 pl-9"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={() => void fetchList()} title="刷新">
                  <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={clearAllFilters}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  一键重置
                </Button>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowColMenu((v) => !v)}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    列显隐
                  </Button>
                  {showColMenu && (
                    <div className="absolute right-0 z-40 mt-1 w-48 space-y-1 rounded-md border-0 bg-popover/95 p-2 text-sm shadow-xl ring-1 ring-inset ring-foreground/10 backdrop-blur-xl dark:ring-white/10">
                      {(Object.keys(cols) as RecordsColumnKey[]).map((k) => (
                        <label key={k} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cols[k]}
                            onChange={() => toggleCol(k)}
                          />
                          <span>
                            {k === 'source'
                              ? '来源'
                              : k === 'duration'
                                ? '耗时'
                                : k === 'operator'
                                  ? '操作人'
                                  : k === 'model'
                                    ? '模型'
                                    : k === 'cases'
                                      ? '用例数'
                                      : '创建时间'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                状态
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatusSet(new Set())
                  setPage(1)
                }}
                className={cn(
                  'rounded-full border-0 px-2.5 py-1 text-xs shadow-sm ring-1 ring-inset transition-colors',
                  statusSet.size === 0
                    ? 'bg-primary text-primary-foreground ring-primary/40'
                    : 'bg-secondary/55 ring-foreground/10 hover:bg-secondary dark:ring-white/10',
                )}
              >
                全部{summary ? `(${summary.total})` : ''}
              </button>
              {STATUS_ORDER.map((st) => {
                const c = statusCounts?.[st] ?? 0
                const on = statusSet.has(st)
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => toggleStatus(st)}
                    className={cn(
                      'rounded-full border-0 px-2.5 py-1 text-xs shadow-sm ring-1 ring-inset transition-colors',
                      on
                        ? 'bg-primary text-primary-foreground ring-primary/40'
                        : 'bg-secondary/45 ring-foreground/10 hover:bg-secondary/70 dark:ring-white/10',
                    )}
                  >
                    {statusLabels[st]}({c})
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col xl:flex-row xl:items-center flex-wrap gap-3 text-sm">
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-muted-foreground mr-1">时间</span>
                {(
                  [
                    ['today', '今天'],
                    ['7d', '近7天'],
                    ['30d', '近30天'],
                    ['thisMonth', '本月'],
                    ['lastMonth', '上月'],
                  ] as const
                ).map(([id, lab]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={datePreset === id ? 'secondary' : 'ghost'}
                    className="h-7 text-xs"
                    onClick={() => applyPreset(id)}
                  >
                    {lab}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={datePreset === 'custom' ? 'secondary' : 'ghost'}
                  className="h-7 text-xs"
                  onClick={() => {
                    setDatePreset('custom')
                    setPage(1)
                  }}
                >
                  自定义
                </Button>
                <Input
                  type="date"
                  className="h-8 w-[140px] text-xs"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setDatePreset('custom')
                    setPage(1)
                  }}
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="date"
                  className="h-8 w-[140px] text-xs"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setDatePreset('custom')
                    setPage(1)
                  }}
                />
              </div>

              <Separator orientation="vertical" className="hidden xl:block h-8" />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">模型</span>
                <select
                  multiple
                  size={1}
                  title={
                    modelPick.length
                      ? `已选 ${modelPick.length} 个模型：${modelPick.join('、')}`
                      : '按住 Ctrl / ⌘ 可多选模型'
                  }
                  className="h-8 w-[180px] max-w-[180px] shrink-0 rounded-md border-0 bg-background/55 px-2 py-0 text-xs leading-8 shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-md dark:ring-white/10"
                  value={modelPick}
                  onChange={(e) => {
                    const v = [...e.target.selectedOptions].map((o) => o.value)
                    setModelPick(v)
                    setPage(1)
                  }}
                >
                  {modelOptions.map((m) => (
                    <option key={m.modelId} value={m.modelName} title={m.modelName}>
                      {formatModelLabel(m.modelName)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">用例数</span>
                <select
                  className="h-8 rounded-md border-0 bg-background/55 px-2 text-xs shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-md dark:ring-white/10"
                  value={caseBucket}
                  onChange={(e) => {
                    setCaseBucket(e.target.value)
                    setPage(1)
                  }}
                >
                  <option value="all">全部</option>
                  <option value="zero">0 条</option>
                  <option value="small">1–10 条</option>
                  <option value="large">10 条以上</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">来源</span>
                {(
                  [
                    ['file', '需求文档'],
                    ['text', '手动输入'],
                    ['template', '模板复用'],
                  ] as const
                ).map(([val, lab]) => {
                  const on = sourcePick.includes(val)
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setSourcePick((p) =>
                          p.includes(val) ? p.filter((x) => x !== val) : [...p, val],
                        )
                        setPage(1)
                      }}
                      className={cn(
                        'rounded-md border-0 px-2 py-0.5 text-xs ring-1 ring-inset backdrop-blur-sm',
                        on ? 'bg-primary/15 ring-primary/35' : 'bg-secondary/30 ring-foreground/10 dark:ring-white/10',
                      )}
                    >
                      {lab}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        {filterSummary ? <p className={rec.filterSummary}>{filterSummary}</p> : null}
      </div>

      {selected.size > 0 && (
        <RecordsBatchBar
          count={selected.size}
          mode={view}
          onExport={view === 'list' ? exportBatchJson : undefined}
          onArchive={view === 'list' ? () => runBatch('ARCHIVE') : undefined}
          onDelete={
            view === 'list'
              ? () => setConfirm({ type: 'soft_delete', ids: [...selected] })
              : undefined
          }
          onRestore={view === 'recycle' ? () => runBatch('RESTORE') : undefined}
          onHardDelete={
            view === 'recycle'
              ? () => setConfirm({ type: 'hard_delete', ids: [...selected] })
              : undefined
          }
          onClear={() => setSelected(new Set())}
          onSelectAllMatching={view === 'list' ? () => void selectAllMatching() : undefined}
        />
      )}

      <section className={cn(rec.tablePanel, 'records-fade-up-d2')}>
        <div className={cn(rec.tablePanelInner, 'border-b border-workspace-panel-border/55 pb-3 dark:border-white/[0.06]')}>
          <div className="flex flex-row items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-workspace-text-primary">
            {loading ? '加载中…' : `共 ${total} 条`}
          </h2>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={list.length > 0 && selected.size === list.length}
              onChange={selectAllPage}
            />
            全选本页
          </label>
          </div>
        </div>
        <div className={cn(rec.tablePanelInner, 'min-w-0', loading && 'records-table-loading opacity-70')}>
          {error && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border-0 bg-destructive/10 p-4 ring-1 ring-inset ring-destructive/35 backdrop-blur-sm">
              <span className="text-sm">{error}</span>
              <Button size="sm" variant="outline" onClick={() => void fetchList()}>
                重试
              </Button>
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-md bg-muted/60 animate-pulse"
                />
              ))}
            </div>
          ) : list.length === 0 ? (
            <RecordsEmptyState
              variant={emptyVariant}
              onClearFilters={clearAllFilters}
              onGoList={() => { setView('list'); setPage(1) }}
              onGoGenerate={() => navigate('/generate')}
            />
          ) : (
            <div
              ref={listRef}
              tabIndex={0}
              role="grid"
              aria-label="生成记录列表"
              className="outline-none space-y-0 overflow-x-auto rounded-xl ring-1 ring-inset ring-foreground/10 dark:ring-white/10"
              onKeyDown={onKeyDown}
            >
              <div
                className={rec.tableHead + " min-w-[920px]"}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <span />
                <span>标题 / 摘要</span>
                {cols.model && <span>模型</span>}
                {cols.cases && (
                  <button
                    type="button"
                    className="text-left flex items-center gap-1 hover:text-foreground"
                    onClick={() => onSortHeader('caseCount')}
                  >
                    用例 {sortIcon('caseCount')}
                  </button>
                )}
                {cols.source && <span>来源</span>}
                {cols.duration && <span>耗时</span>}
                {cols.created && (
                  <button
                    type="button"
                    className="text-left flex items-center gap-1 hover:text-foreground"
                    onClick={() => onSortHeader('createdAt')}
                  >
                    创建时间 {sortIcon('createdAt')}
                  </button>
                )}
                {cols.operator && <span>操作人</span>}
                <span>操作</span>
              </div>

              {list.map((r, idx) => {
                const expanded = expandedId === r.id
                const focused = focusIdx === idx
                const inRecycle = view === 'recycle' || !!r.deletedAt
                return (
                  <div key={r.id} className="min-w-[1012px]">
                    <div
                      role="row"
                      className={cn(
                        rec.tableRow,
                        rec.tableRowHover,
                        selected.has(r.id) && rec.tableRowSelected,
                        expanded && 'bg-workspace-panel-muted/50',
                        focused && !selected.has(r.id) && 'bg-workspace-panel-muted/35',
                      )}
                      style={{ gridTemplateColumns: gridTemplate }}
                      onClick={() => {
                        setFocusIdx(idx)
                        setExpandedId((id) => (id === r.id ? null : r.id))
                      }}
                      onDoubleClick={() => navigate(`/records/${r.id}`)}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(r.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          <HighlightText text={r.title} query={debouncedKeyword} />
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {promptSummary(r.prompt || '', 30)}
                        </p>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] mt-1',
                            recordStatusBadge(r.status),
                          )}
                        >
                          {statusLabels[r.status]}
                        </Badge>
                      </div>
                      {cols.model && (
                        <span className="text-xs text-muted-foreground truncate" title={r.modelName}>
                          {r.modelName}
                        </span>
                      )}
                      {cols.cases && (
                        <span className="text-sm tabular-nums">{r.caseCount}</span>
                      )}
                      {cols.source && (
                        <span className="text-xs text-muted-foreground">{sourceLabel(r)}</span>
                      )}
                      {cols.duration && (
                        <span className="text-xs tabular-nums">{formatDuration(r.duration)}</span>
                      )}
                      {cols.created && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(r.createdAt, 'MM-dd HH:mm')}
                        </span>
                      )}
                      {cols.operator && (
                        <span className="text-xs text-muted-foreground truncate">
                          {r.creator?.username ?? '—'}
                        </span>
                      )}
                      <RecordsRowActions
                        record={r}
                        inRecycle={inRecycle}
                        loading={rowLoading === r.id}
                        onView={() => navigate(`/records/${r.id}`)}
                        onReuse={() => void openReuse(r)}
                        onExport={() => exportOne(r)}
                        onShare={() => void copyShare(r)}
                        onArchive={() => void handleRowAction(r, 'archive')}
                        onUnarchive={() => void handleRowAction(r, 'patch_active')}
                        onRestore={() => void handleRowAction(r, 'restore')}
                        onSoftDelete={() => setConfirm({ type: 'soft_delete', ids: [r.id] })}
                        onHardDelete={() => setConfirm({ type: 'hard_delete', ids: [r.id] })}
                      />
                    </div>
                    {expanded && (
                      <div className="space-y-2 bg-muted/25 px-4 py-3 text-xs shadow-[inset_0_1px_0_0_hsl(var(--border)_/_0.12)] backdrop-blur-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
                        <p className="text-muted-foreground font-medium">需求摘要</p>
                        <p className="text-foreground/90 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                          <HighlightText text={r.prompt || '（无）'} query={debouncedKeyword} />
                        </p>
                        <p className="text-muted-foreground">
                          用例数 {r.caseCount}
                          {r.suiteId ? ` · 套件 ${r.suiteId.slice(0, 8)}…` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && list.length > 0 && (
          <div className={rec.paginationFooter}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-workspace-text-muted">
              <span>第 {page} / {totalPages} 页</span>
              <span>·</span>
              <span>每页</span>
              <select className={cn(rec.control, rec.controlSm)} value={pageSize} onChange={(e) => { const n = +e.target.value; setPageSize(n); saveRecordsPageSize(n); setPage(1) }}>{[10,20,50,100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
              <span>条 · 共 {total} 条</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className={rec.iconBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="icon" className={rec.iconBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm.type !== 'none'}
        title={confirm.type === 'hard_delete' ? '永久删除记录？' : '删除生成记录？'}
        description={
          confirm.type === 'hard_delete'
            ? `将永久删除 ${confirmCount} 条记录，该操作不可恢复，请确认是否继续。`
            : `将 ${confirmCount} 条记录移入回收站，可在回收站中恢复或永久删除。`
        }
        confirmText={confirm.type === 'hard_delete' ? '永久删除' : '删除'}
        confirmVariant="destructive"
        onCancel={() => setConfirm({ type: 'none' })}
        onConfirm={async () => {
          const kind = confirm.type
          if (kind === 'none') return
          const ids = [...confirm.ids]
          setConfirm({ type: 'none' })
          try {
            if (kind === 'hard_delete') {
              await recordsApi.batch(ids, 'PERMANENT_DELETE')
              toast.success('已彻底删除')
            } else {
              await recordsApi.batch(ids, 'SOFT_DELETE')
              toast.success('已移入回收站')
            }
            void fetchList()
            void fetchSummary()
          } catch {
            toast.error('操作失败')
          }
        }}
      />
    </div>
  )
}
