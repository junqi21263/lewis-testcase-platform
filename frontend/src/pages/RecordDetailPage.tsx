import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { recordsApi } from '@/api/records'
import { formatDate, generationRecordStatusClass } from '@/utils/format'
import type { GenerationRecord, GenerationStatus } from '@/types'
import toast from 'react-hot-toast'

const statusLabels: Record<GenerationStatus, string> = {
  PENDING: '等待中',
  PROCESSING: '生成中',
  SUCCESS: '成功',
  FAILED: '失败',
  ARCHIVED: '已归档',
  CANCELLED: '已取消',
}

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [record, setRecord] = useState<GenerationRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await recordsApi.getRecordById(id)
        if (!cancelled) setRecord(r)
      } catch {
        if (!cancelled) {
          toast.error('加载失败或无权限')
          navigate('/records', { replace: true })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (loading || !record) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        加载中…
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold truncate">{record.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(record.createdAt)} · {record.modelName} · 用例 {record.caseCount}
          </p>
        </div>
        <Badge
          variant="outline"
          className={generationRecordStatusClass[record.status] || ''}
        >
          {statusLabels[record.status]}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">需求 / 提示词原文</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-muted/40 rounded-lg p-4 border border-border max-h-[480px] overflow-y-auto">
            {record.prompt || '（无）'}
          </pre>
        </CardContent>
      </Card>

      {record.suite && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">关联用例集</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/dashboard"
              className="text-sm text-primary hover:underline"
            >
              {record.suite.name}
            </Link>
            <p className="text-xs text-muted-foreground mt-1">
              用例集详情入口请从工作台或后续「用例集」路由进入
            </p>
          </CardContent>
        </Card>
      )}

      {record.errorMessage && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-destructive">错误信息</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{record.errorMessage}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
