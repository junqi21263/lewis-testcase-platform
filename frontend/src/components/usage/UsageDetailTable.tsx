import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { UsageDetails } from '@/api/usage'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import { usage, usageCallTypeLabel, usageStatusBadge } from '@/utils/usageUi'

type DetailRow = UsageDetails['list'][number]

export function UsageDetailTable(props: {
  details: UsageDetails | null
  loading?: boolean
  page: number
  pageSize: number
  onPageChange: (p: number) => void
  search: string
  onSearchChange: (v: string) => void
  moduleFilter: string
  onModuleFilterChange: (v: string) => void
  statusFilter: '' | 'success' | 'failed'
  onStatusFilterChange: (v: '' | 'success' | 'failed') => void
}) {
  const {
    details,
    loading,
    page,
    pageSize,
    onPageChange,
    search,
    onSearchChange,
    moduleFilter,
    onModuleFilterChange,
    statusFilter,
    onStatusFilterChange,
  } = props

  const modules = useMemo(() => {
    const set = new Set<string>()
    details?.list.forEach((r) => set.add(r.moduleType))
    return Array.from(set).sort()
  }, [details?.list])

  const filtered = useMemo(() => {
    if (!details?.list) return []
    let list = details.list
    if (moduleFilter) list = list.filter((r) => r.moduleType === moduleFilter)
    if (statusFilter === 'success') list = list.filter((r) => r.success)
    if (statusFilter === 'failed') list = list.filter((r) => !r.success)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (r) =>
          r.moduleType.toLowerCase().includes(q) ||
          (r.modelName?.toLowerCase().includes(q) ?? false) ||
          (r.provider?.toLowerCase().includes(q) ?? false) ||
          r.fileKind.toLowerCase().includes(q),
      )
    }
    return list
  }, [details?.list, moduleFilter, statusFilter, search])

  const total = details?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <section className={cn(usage.panel, 'workspace-fade-up-d3 min-h-[min(480px,60vh)]')}>
      <header className={usage.panelHeader}>
        <div>
          <h2 className={usage.panelTitle}>调用明细</h2>
          <p className={usage.panelSub}>共 {total.toLocaleString()} 条记录</p>
        </div>
      </header>

      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--usage-table-border))] px-5 py-3">
        <div className="relative min-w-[min(100%,220px)] flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--usage-icon-muted)]" />
          <Input
            placeholder="搜索模块、模型…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn(usage.control, 'h-9 w-full pl-9')}
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => onModuleFilterChange(e.target.value)}
          className={cn(usage.control, 'h-9 px-2.5 text-xs')}
          aria-label="模块筛选"
        >
          <option value="">全部模块</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as '' | 'success' | 'failed')}
          className={cn(usage.control, 'h-9 px-2.5 text-xs')}
          aria-label="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
      </div>

      <div className={cn(usage.scrollBody, 'max-h-[min(520px,50vh)]', loading && 'opacity-60')}>
        {filtered.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <p className="text-sm font-medium text-[hsl(var(--usage-text-primary))]">暂无用量明细</p>
            <p className="text-xs text-[hsl(var(--usage-text-muted))]">调用产生后将显示在此列表</p>
          </div>
        ) : (
          <>
            <div className={usage.tableHead} role="row">
              <span>时间</span>
              <span>模块</span>
              <span>模型</span>
              <span className="text-right">Token</span>
              <span className="text-right">费用</span>
              <span>类型</span>
              <span>状态</span>
            </div>
            {filtered.map((row) => (
              <UsageDetailRow key={row.id} row={row} />
            ))}
          </>
        )}
      </div>

      {total > 0 && (
        <footer className={usage.tableFooter}>
          <p className="text-xs text-[hsl(var(--usage-text-muted))]">
            第 {page} / {totalPages} 页 · 每页 {pageSize} 条
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              disabled={page <= 1 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl"
              disabled={page >= totalPages || loading}
              onClick={() => onPageChange(page + 1)}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      )}
    </section>
  )
}

function UsageDetailRow({ row }: { row: DetailRow }) {
  const model = row.modelName || row.provider || '—'
  return (
    <div className={usage.tableRow} role="row">
      <span className="tabular-nums text-xs text-[hsl(var(--usage-text-secondary))]">
        {formatDate(row.createdAt, 'MM-dd HH:mm')}
      </span>
      <span className={usage.chip} title={row.moduleType}>
        {row.moduleType}
      </span>
      <span className="truncate text-xs text-[hsl(var(--usage-text-secondary))]" title={model}>
        {model}
      </span>
      <span className="text-right tabular-nums text-xs">{row.totalTokens.toLocaleString()}</span>
      <span className="text-right tabular-nums text-xs">
        ¥{Number(row.estimatedCostCny || 0).toFixed(4)}
      </span>
      <span className="text-xs text-[hsl(var(--usage-text-muted))]">
        {usageCallTypeLabel(row.cacheHit)}
      </span>
      <span className={usageStatusBadge(row.success)}>{row.success ? '成功' : '失败'}</span>
    </div>
  )
}
