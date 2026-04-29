import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useThemeStore } from '@/store/themeStore'
import { fetchPublicRecordShare } from '@/api/records'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, generationRecordStatusClass } from '@/utils/format'
import type { GenerationStatus, PublicSharePayload } from '@/types'
import { RefreshCw } from 'lucide-react'

const statusLabels: Record<GenerationStatus, string> = {
  PENDING: '等待中',
  PROCESSING: '生成中',
  SUCCESS: '成功',
  FAILED: '失败',
  ARCHIVED: '已归档',
  CANCELLED: '已取消',
}

/**
 * 生成记录公开分享页（无需登录，依赖后端 /records/public/shares/:token）
 */
export default function RecordSharePublicPage() {
  const { token } = useParams<{ token: string }>()
  const theme = useThemeStore((s) => s.theme)
  const [data, setData] = useState<PublicSharePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  const load = () => {
    if (!token) {
      setError('链接无效')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void fetchPublicRecordShare(token)
      .then(setData)
      .catch((e: Error) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- token 变化时重载
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">加载中…</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive text-center max-w-md">{error ?? '无法展示该分享'}</p>
        <Button variant="outline" size="sm" onClick={() => load()} className="gap-1">
          <RefreshCw className="w-4 h-4" />
          重试
        </Button>
        <Button variant="link" asChild>
          <Link to="/login">去登录</Link>
        </Button>
      </div>
    )
  }

  const { record, cases } = data

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">分享：{record.title}</h1>
        <Badge variant="outline" className={generationRecordStatusClass[record.status]}>
          {statusLabels[record.status]}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDate(record.createdAt, 'yyyy-MM-dd HH:mm')} · 用例 {record.caseCount} 条 ·
        本页为只读分享视图
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">需求摘要</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground max-h-64 overflow-auto border rounded-md p-3 bg-muted/30">
            {record.demandContent || '—'}
          </pre>
        </CardContent>
      </Card>

      {record.promptTemplateSnapshot ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">提示词模板快照</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap font-mono max-h-48 overflow-auto border rounded-md p-3 bg-muted/30">
              {record.promptTemplateSnapshot}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">用例列表（{cases.length}）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-2 pr-2">标题</th>
                <th className="py-2 pr-2">优先级</th>
                <th className="py-2">预期结果</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="align-top shadow-[inset_0_-1px_0_0_hsl(var(--border)_/_0.1)] dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]">
                  <td className="py-2 pr-2 font-medium">{c.title}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{c.priority}</td>
                  <td className="py-2 text-muted-foreground line-clamp-4">{c.expectedResult}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        <Button variant="link" asChild className="h-auto p-0 text-xs">
          <Link to="/login">登录后使用完整功能</Link>
        </Button>
      </p>
    </div>
  )
}
