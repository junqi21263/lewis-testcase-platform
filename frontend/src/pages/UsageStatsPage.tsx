import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { usageApi } from '@/api/usage'

export default function UsageStatsPage() {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof usageApi.getSummary>> | null>(null)
  const [details, setDetails] = useState<Awaited<ReturnType<typeof usageApi.getDetails>> | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [s, d] = await Promise.all([usageApi.getSummary(), usageApi.getDetails(1, 30)])
      setSummary(s)
      setDetails(d)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const ratioRows = useMemo(() => {
    if (!summary) return []
    return summary.moduleDistribution
  }, [summary])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">用量统计</h1>
          <p className="text-sm text-muted-foreground">多模态调用次数、Token 与费用统计</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button asChild>
            <a href={usageApi.exportCsvUrl()} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              导出CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">今日调用</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.today.calls ?? 0}</p>
            <p className="text-xs text-muted-foreground">Tokens: {summary?.today.tokens ?? 0}</p>
            <p className="text-xs text-muted-foreground">费用: ¥{(summary?.today.costCny ?? 0).toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">本月调用</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary?.month.calls ?? 0}</p>
            <p className="text-xs text-muted-foreground">Tokens: {summary?.month.tokens ?? 0}</p>
            <p className="text-xs text-muted-foreground">费用: ¥{(summary?.month.costCny ?? 0).toFixed(4)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              模块占比
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {ratioRows.map((r) => (
              <div key={r.moduleType} className="flex items-center justify-between">
                <span>{r.moduleType}</span>
                <span>{r.count}</span>
              </div>
            ))}
            {ratioRows.length === 0 && <div className="text-xs text-muted-foreground">暂无数据</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">调用明细</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {details?.list?.map((row) => (
            <div key={row.id} className="rounded-md border border-border/60 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{new Date(row.createdAt).toLocaleString('zh-CN')}</span>
                <span>
                  {row.moduleType} / {row.fileKind} / {row.modelName || row.provider || '-'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground">
                <span>Token: {row.totalTokens}</span>
                <span>费用: ¥{Number(row.estimatedCostCny || 0).toFixed(4)}</span>
                <span>{row.cacheHit ? '缓存命中' : '实时调用'}</span>
                <span>{row.success ? '成功' : '失败'}</span>
              </div>
            </div>
          ))}
          {!details?.list?.length && <div className="text-sm text-muted-foreground">暂无用量明细</div>}
        </CardContent>
      </Card>
    </div>
  )
}
