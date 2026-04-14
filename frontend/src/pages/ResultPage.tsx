import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { RefreshCw, Download, RotateCcw, Share2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { recordsApi } from '@/api/records'
import { testcasesApi } from '@/api/testcases'
import type { GenerationRecord, TestCase, ExportFormat, TestSuite } from '@/types'
import { formatDate, statusColorMap } from '@/utils/format'

const statusLabels: Record<string, string> = {
  PENDING: '等待中',
  PROCESSING: '生成中',
  SUCCESS: '成功',
  FAILED: '失败',
}

const exportFormats: Array<{ id: ExportFormat; label: string }> = [
  { id: 'EXCEL', label: 'Excel' },
  { id: 'JSON', label: 'JSON' },
  { id: 'MARKDOWN', label: 'Markdown' },
]

function groupBy<T>(list: T[], keyFn: (t: T) => string) {
  const map = new Map<string, T[]>()
  for (const item of list) {
    const k = keyFn(item) || '未分组'
    const arr = map.get(k)
    if (arr) arr.push(item)
    else map.set(k, [item])
  }
  return map
}

export default function ResultPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState<GenerationRecord | null>(null)
  const [suite, setSuite] = useState<TestSuite | null>(null)
  const [cases, setCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(false)

  const fetchAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await recordsApi.getRecordResult(id)
      setRecord(res.record)
      setSuite(res.suite)
      setCases(res.cases || [])
    } catch {
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [id])

  const stats = useMemo(() => {
    const total = cases.length
    const byPriority = groupBy(cases, (c) => c.priority)
    const byType = groupBy(cases, (c) => c.type)
    return {
      total,
      p0: byPriority.get('P0')?.length || 0,
      p1: byPriority.get('P1')?.length || 0,
      p2: byPriority.get('P2')?.length || 0,
      p3: byPriority.get('P3')?.length || 0,
      p4: byPriority.get('P4')?.length || 0,
      byType,
    }
  }, [cases])

  const priorityBarOption = useMemo(() => {
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 20, right: 12, top: 20, bottom: 20, containLabel: true },
      xAxis: { type: 'category', data: ['P0', 'P1', 'P2', 'P3', 'P4'] },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: [stats.p0, stats.p1, stats.p2, stats.p3, stats.p4],
        },
      ],
    }
  }, [stats])

  const typePieOption = useMemo(() => {
    const data = Array.from(stats.byType.entries()).map(([k, v]) => ({ name: k, value: v.length }))
    return {
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
          label: { color: '#9CA3AF' },
          data,
        },
      ],
    }
  }, [stats.byType])

  const canExport = !!suite?.id && record?.status === 'SUCCESS'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">查看结果</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {record ? (
              <>
                <span className="mr-2">记录：{record.title}</span>
                <span className="mr-2">·</span>
                <span>创建于 {formatDate(record.createdAt, 'MM-dd HH:mm')}</span>
              </>
            ) : (
              '加载中...'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={fetchAll} disabled={loading}>
            <RefreshCw className="w-4 h-4" /> 刷新
          </Button>

          <div className="flex items-center gap-1">
            {exportFormats.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={!canExport}
                onClick={() => {
                  if (!record?.suiteId) return
                  if (!suite?.id) return
                  const url = testcasesApi.exportSuiteUrl(suite.id, f.id)
                  window.open(url, '_blank', 'noopener,noreferrer')
                }}
              >
                <Download className="w-4 h-4" /> {f.label}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => navigate('/generate')}
          >
            <RotateCcw className="w-4 h-4" /> 重试生成
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              if (!id) return
              navigator.clipboard.writeText(window.location.href).then(
                () => toast.success('已复制分享链接'),
                () => toast.error('复制失败'),
              )
            }}
          >
            <Share2 className="w-4 h-4" /> 分享
          </Button>
        </div>
      </div>

      {/* 状态栏 */}
      {record && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={statusColorMap[record.status] || ''}>
                {statusLabels[record.status]}
              </Badge>
              <span className="text-sm text-muted-foreground">模型：{record.modelName}</span>
              <span className="text-sm text-muted-foreground">用例数：{record.caseCount}</span>
              {typeof record.duration === 'number' && (
                <span className="text-sm text-muted-foreground">耗时：{Math.round(record.duration / 1000)}s</span>
              )}
            </div>

            {record.status === 'FAILED' && (
              <div className="flex items-center gap-2">
                <div className="text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {record.errorMessage || '生成失败'}
                </div>
                <Button variant="outline" size="sm" onClick={fetchAll}>
                  一键诊断
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 统计卡 + 图表 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">统计概览</CardTitle>
            <CardDescription>用例数量与优先级分布</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">总用例数</span>
              <span className="font-medium">{stats.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">P0 / P1</span>
              <span className="font-medium">{stats.p0} / {stats.p1}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">P2 / P3 / P4</span>
              <span className="font-medium">{stats.p2} / {stats.p3} / {stats.p4}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">优先级分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={priorityBarOption} style={{ height: 220 }} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">类型分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ReactECharts option={typePieOption} style={{ height: 220 }} />
          </CardContent>
        </Card>
      </div>

      {/* 用例列表（简版：后续再加大纲导航/筛选/批量编辑） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">用例列表</CardTitle>
          <CardDescription>当前版本先提供可查看与基础编辑入口（后续补全大纲导航/批量 AI 优化）</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">加载中...</div>
          ) : cases.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">暂无用例</div>
          ) : (
            <div className="space-y-2">
              {cases.slice(0, 100).map((c) => (
                <div key={c.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{c.priority}</Badge>
                      <Badge variant="outline" className="text-xs">{c.type}</Badge>
                      <div className="font-medium text-sm truncate">{c.title}</div>
                    </div>
                    {c.precondition && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">前置：{c.precondition}</div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => toast('后续：跳转到可编辑详情/定位用例')}>
                    编辑
                  </Button>
                </div>
              ))}
              {cases.length > 100 && (
                <div className="text-xs text-muted-foreground pt-2">
                  仅展示前 100 条（后续会加虚拟滚动与筛选）
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

