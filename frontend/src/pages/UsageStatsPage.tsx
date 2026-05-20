import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usageApi, type UsageDetails, type UsageSummary } from '@/api/usage'
import { UsageDetailTable } from '@/components/usage/UsageDetailTable'
import { UsageModuleDistribution } from '@/components/usage/UsageModuleDistribution'
import { UsageSummaryCards } from '@/components/usage/UsageSummaryCards'
import { UsageTrendPlaceholder } from '@/components/usage/UsageTrendPlaceholder'
import toast from 'react-hot-toast'
import { usage } from '@/utils/usageUi'

const PAGE_SIZE = 30

export default function UsageStatsPage() {
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [details, setDetails] = useState<UsageDetails | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'success' | 'failed'>('')

  const loadData = useCallback(async (targetPage: number, showRefreshToast = false) => {
    setLoading(true)
    try {
      const [s, d] = await Promise.all([
        usageApi.getSummary(),
        usageApi.getDetails(targetPage, PAGE_SIZE),
      ])
      setSummary(s)
      setDetails(d)
      if (showRefreshToast) toast.success('数据已刷新')
    } catch {
      toast.error(showRefreshToast ? '刷新失败，请稍后重试' : '加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData(1)
  }, [loadData])

  const handlePageChange = async (next: number) => {
    setPage(next)
    setLoading(true)
    try {
      const d = await usageApi.getDetails(next, PAGE_SIZE)
      setDetails(d)
    } catch {
      toast.error('加载明细失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    setPage(1)
    void loadData(1, true)
  }

  const ratioRows = useMemo(() => summary?.moduleDistribution ?? [], [summary])

  const handleExport = () => {
    setExporting(true)
    try {
      window.open(usageApi.exportCsvUrl(), '_blank', 'noopener,noreferrer')
      toast.success('用量统计 CSV 已生成，请查看下载')
    } catch {
      toast.error('导出失败，请稍后重试')
    } finally {
      window.setTimeout(() => setExporting(false), 800)
    }
  }

  return (
    <div className={usage.page}>
      <div className={usage.container}>
        <header className={usage.header}>
          <div>
            <h1 className={usage.headerTitle}>用量统计</h1>
            <p className={usage.headerSub}>多模态调用次数、Token 与费用统计</p>
          </div>
          <div className={usage.headerActions}>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-xl"
              onClick={handleRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button
              type="button"
              className="h-10 gap-2 rounded-xl"
              disabled={exporting}
              onClick={handleExport}
            >
              <Download className="h-4 w-4" />
              {exporting ? '导出中…' : '导出 CSV'}
            </Button>
          </div>
        </header>

        <UsageSummaryCards summary={summary} loading={loading} />

        <div className={usage.analyticsGrid}>
          <UsageModuleDistribution rows={ratioRows} loading={loading} />
          <UsageTrendPlaceholder />
        </div>

        <UsageDetailTable
          details={details}
          loading={loading}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => void handlePageChange(p)}
          search={search}
          onSearchChange={setSearch}
          moduleFilter={moduleFilter}
          onModuleFilterChange={setModuleFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      </div>
    </div>
  )
}
