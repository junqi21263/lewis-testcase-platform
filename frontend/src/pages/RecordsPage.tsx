import { useEffect, useState } from 'react'
import { Search, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { recordsApi } from '@/api/records'
import { formatDate, statusColorMap } from '@/utils/format'
import type { GenerationRecord } from '@/types'
import toast from 'react-hot-toast'

const statusLabels: Record<string, string> = {
  PENDING: '等待中', PROCESSING: '生成中', SUCCESS: '成功', FAILED: '失败',
}

export default function RecordsPage() {
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const pageSize = 10

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const res = await recordsApi.getRecords({
        page, pageSize,
        keyword: keyword || undefined,
        status: statusFilter || undefined,
      })
      setRecords(res.list)
      setTotal(res.total)
    } catch {
      // 请求失败静默处理
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRecords() }, [page, statusFilter])

  const handleSearch = () => {
    setPage(1)
    fetchRecords()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该记录？')) return
    try {
      await recordsApi.deleteRecord(id)
      toast.success('删除成功')
      fetchRecords()
    } catch {
      toast.error('删除失败')
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">生成记录</h1>
        <p className="text-muted-foreground mt-1">查看所有 AI 用例生成历史</p>
      </div>

      {/* 筛选栏 */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Input
              placeholder="搜索记录标题..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="max-w-xs"
            />
            <Button variant="outline" size="icon" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {['', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
              >
                {s === '' ? '全部' : statusLabels[s]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 记录列表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">共 {total} 条记录</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">加载中...</div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">暂无记录</div>
          ) : (
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_100px_80px_120px_80px] gap-4 px-4 py-2 text-xs text-muted-foreground font-medium border-b">
                <span>标题</span>
                <span>模型</span>
                <span>用例数</span>
                <span>创建时间</span>
                <span>操作</span>
              </div>
              {records.map((record) => (
                <div key={record.id} className="grid grid-cols-[1fr_100px_80px_120px_80px] gap-4 items-center px-4 py-3 hover:bg-accent/50 transition-colors border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{record.title}</p>
                    <Badge
                      className={`text-xs mt-0.5 ${statusColorMap[record.status] || ''}`}
                      variant="outline"
                    >
                      {statusLabels[record.status]}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{record.modelName}</span>
                  <span className="text-sm">{record.caseCount}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(record.createdAt, 'MM-dd HH:mm')}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="w-7 h-7">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(record.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-2 border-t">
              <span className="text-sm text-muted-foreground">
                第 {page} / {totalPages} 页
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
