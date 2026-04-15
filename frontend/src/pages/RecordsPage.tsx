import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Archive,
  ArchiveRestore,
  Download,
  Share2,
  Copy,
  Pencil,
  Loader2,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings2,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { recordsApi, type RecordsListQuery, type RecordsSummary } from '@/api/records'
import { formatDate, generationRecordStatusClass } from '@/utils/format'
import type { GenerationRecord, GenerationStatus } from '@/types'
import { useGenerateStore } from '@/store/generateStore'
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
  if (r.sourceType === 'file' || r.fileId) return '文档解析带入'
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
    toast.success('已重置筛选')
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

  const openReuse = (r: GenerationRecord) => {
    useGenerateStore.setState({
      sourceType: 'text',
      customPrompt: r.prompt || '',
      selectedTemplateId: r.templateId ?? null,
      uploadedFile: null,
      inputText: '',
      currentStep: 'prompt',
    })
    navigate('/generate')
    toast.success('已带入生成页')
  }

  const copyShare = async (r: GenerationRecord) => {
    const url = `${window.location.origin}/records/${r.id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('链接已复制')
    } catch {
      toast.error('复制失败')
    }
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
    if (id !== 'custom') toast.success('已应用时间范围')
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
      '160px',
    ].filter(Boolean)
    return parts.join(' ')
  }, [cols])

  const toggleCol = (k: RecordsColumnKey) => {
    setCols((prev) => {
      const n = { ...prev, [k]: !prev[k] }
      saveRecordsColumns(n)
      return n
    })
  }

  return (
    <div className="space-y-4 min-w-0 max-w-[1400px] mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-bold">生成记录</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          查看与管理 AI 用例生成历史 · 支持筛选、排序、批量与回收站
        </p>
      </div>

      {/* 主 Tab + 顶部固定筛选 */}
      <div className="sticky top-0 z-30 -mx-2 px-2 py-2 bg-background/95 backdrop-blur border-b border-border/80 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={view === 'list' ? 'default' : 'outline'}
            onClick={() => {
              setView('list')
              setPage(1)
            }}
          >
            全部记录
          </Button>
          <Button
            size="sm"
            variant={view === 'recycle' ? 'default' : 'outline'}
            onClick={() => {
              setView('recycle')
              setPage(1)
            }}
          >
            回收站
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-4 space-y-3">
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
                    className="pl-9"
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
                    <div className="absolute right-0 mt-1 z-40 w-48 rounded-md border bg-popover p-2 text-sm shadow-md space-y-1">
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
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  statusSet.size === 0
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-secondary/60 border-border hover:bg-secondary',
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
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      on
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/40 border-border hover:bg-secondary/70',
                    )}
                  >
                    {statusLabels[st]}({c})
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col xl:flex-row flex-wrap gap-3 text-sm">
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
                  className="bg-background border rounded-md text-xs min-h-[32px] max-w-[220px] px-1"
                  value={modelPick}
                  onChange={(e) => {
                    const v = [...e.target.selectedOptions].map((o) => o.value)
                    setModelPick(v)
                    setPage(1)
                  }}
                >
                  {modelOptions.map((m) => (
                    <option key={m.modelId} value={m.modelName}>
                      {m.modelName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">用例数</span>
                <select
                  className="bg-background border rounded-md h-8 text-xs px-2"
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
                    ['file', '文档解析'],
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
                        'px-2 py-0.5 rounded-md text-xs border',
                        on ? 'bg-primary/15 border-primary' : 'border-border',
                      )}
                    >
                      {lab}
                    </button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {selected.size > 0 && view === 'list' && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/40 text-sm sticky top-[1px] z-20">
          <span className="text-muted-foreground">已选 {selected.size} 条</span>
          <Button size="sm" variant="destructive" onClick={() => runBatch('SOFT_DELETE')}>
            批量删除
          </Button>
          <Button size="sm" variant="outline" onClick={() => runBatch('ARCHIVE')}>
            批量归档
          </Button>
          <Button size="sm" variant="outline" onClick={exportBatchJson}>
            批量导出
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast('批量打标签功能即将开放', { icon: 'ℹ️' })}
          >
            批量打标签
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            清除选择
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void selectAllMatching()}>
            全选符合条件（≤500）
          </Button>
        </div>
      )}

      {view === 'recycle' && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-muted/40 text-sm">
          <span className="text-muted-foreground">已选 {selected.size} 条</span>
          <Button size="sm" variant="outline" onClick={() => runBatch('RESTORE')}>
            批量恢复
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              setConfirm({ type: 'hard_delete', ids: [...selected] })
            }
          >
            批量彻底删除
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">
            {loading ? '加载中…' : `共 ${total} 条`}
          </CardTitle>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={list.length > 0 && selected.size === list.length}
              onChange={selectAllPage}
            />
            全选本页
          </label>
        </CardHeader>
        <CardContent className="min-w-0">
          {error && (
            <div className="mb-4 p-4 rounded-lg border border-destructive/50 bg-destructive/10 flex flex-wrap items-center justify-between gap-2">
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
            <div className="py-16 text-center space-y-4">
              <p className="text-muted-foreground">
                {view === 'recycle' ? '回收站为空' : '暂无记录或没有符合筛选的结果'}
              </p>
              {view === 'list' && (
                <Button onClick={() => navigate('/generate')}>去生成用例</Button>
              )}
            </div>
          ) : (
            <div
              ref={listRef}
              tabIndex={0}
              role="grid"
              aria-label="生成记录列表"
              className="outline-none space-y-0 rounded-md border overflow-x-auto"
              onKeyDown={onKeyDown}
            >
              <div
                className="grid gap-2 px-3 py-2 text-xs text-muted-foreground font-medium border-b bg-muted/30 min-w-[900px]"
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
                  <div key={r.id} className="min-w-[900px]">
                    <div
                      role="row"
                      className={cn(
                        'grid gap-2 px-3 py-2 items-center border-b last:border-0 cursor-pointer transition-colors',
                        expanded ? 'bg-accent/40' : 'hover:bg-accent/30',
                        focused && 'ring-1 ring-ring ring-inset',
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
                            generationRecordStatusClass[r.status],
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
                      <div
                        className="flex items-center gap-0.5 flex-wrap justify-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rowLoading === r.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="查看详情"
                              onClick={() => navigate(`/records/${r.id}`)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {!inRecycle && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="一键复用"
                                  onClick={() => openReuse(r)}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="快速导出"
                                  onClick={() => exportOne(r)}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="编辑（带入生成页）"
                                  onClick={() => openReuse(r)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="分享链接"
                                  onClick={() => void copyShare(r)}
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </Button>
                                {r.status !== 'ARCHIVED' ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="归档"
                                    onClick={() => void handleRowAction(r, 'archive')}
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="恢复状态"
                                    onClick={() => void handleRowAction(r, 'patch_active')}
                                  >
                                    <ArchiveRestore className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                            {inRecycle ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="恢复"
                                  onClick={() => void handleRowAction(r, 'restore')}
                                >
                                  <ArchiveRestore className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  title="彻底删除"
                                  onClick={() => setConfirm({ type: 'hard_delete', ids: [r.id] })}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="删除"
                                onClick={() => setConfirm({ type: 'soft_delete', ids: [r.id] })}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <div className="px-4 py-3 bg-muted/20 border-b text-xs space-y-2">
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

          {!loading && list.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 mt-2 border-t">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  第 {page} / {totalPages} 页 · 每页
                </span>
                <select
                  className="bg-background border rounded h-8 text-xs px-2"
                  value={pageSize}
                  onChange={(e) => {
                    const n = +e.target.value
                    setPageSize(n)
                    saveRecordsPageSize(n)
                    setPage(1)
                  }}
                >
                  {[10, 20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>条</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {confirm.type !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-card border rounded-lg shadow-lg max-w-md w-full p-5 space-y-4">
            <h3 className="font-semibold text-lg">
              {confirm.type === 'hard_delete' ? '彻底删除确认' : '移入回收站确认'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {confirm.type === 'hard_delete'
                ? `将永久删除 ${confirm.ids.length} 条记录，无法恢复。`
                : `将 ${confirm.ids.length} 条记录移入回收站，可在回收站恢复。`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm({ type: 'none' })}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  const ids = [...confirm.ids]
                  const kind = confirm.type
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
              >
                确认
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
