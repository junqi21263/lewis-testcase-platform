import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Wand2,
  FileText,
  CheckSquare,
  TrendingUp,
  ArrowRight,
  Clock,
  FileUp,
  BookTemplate,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/authStore'
import { recordsApi } from '@/api/records'
import { testcasesApi } from '@/api/testcases'
import { healthApi, type HealthStatus } from '@/api/health'
import { formatDate, statusColorMap, timeAgo } from '@/utils/format'
import type { GenerationRecord, TestSuite } from '@/types'

interface Stats {
  totalCases: number
  totalRecords: number
  totalSuites: number
  successRate: number
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [recentRecords, setRecentRecords] = useState<GenerationRecord[]>([])
  const [recentSuites, setRecentSuites] = useState<TestSuite[]>([])
  const [stats, setStats] = useState<Stats>({ totalCases: 0, totalRecords: 0, totalSuites: 0, successRate: 0 })
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<HealthStatus | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [recordsRes, suitesRes, recordsSummary, tcSummary, h] = await Promise.all([
          recordsApi.getRecords({ page: 1, pageSize: 5 }),
          testcasesApi.getSuites({ page: 1, pageSize: 4 }),
          recordsApi.getSummary(),
          testcasesApi.getSummary(),
          healthApi.getHealth().catch(() => null),
        ])
        setRecentRecords(recordsRes.list)
        setRecentSuites(suitesRes.list)
        setStats({
          totalRecords: recordsSummary.total,
          totalSuites: tcSummary.totalSuites,
          totalCases: tcSummary.totalCases,
          successRate: recordsSummary.successRate,
        })
        setHealth(h)
      } catch {
        // 请求失败静默处理，显示空数据
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const statCards = [
    { title: '总生成记录', value: stats.totalRecords, icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30' },
    { title: '用例集数量', value: stats.totalSuites, icon: CheckSquare, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950/30' },
    { title: '累计生成用例', value: stats.totalCases, icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950/30' },
    { title: '成功率', value: `${stats.successRate}%`, icon: TrendingUp, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30' },
  ]

  const quickActions = [
    { title: '解析文档', desc: '上传并解析需求文档', icon: FileUp, to: '/upload' },
    { title: '生成用例', desc: '配置参数并流式生成', icon: Wand2, to: '/generate' },
    { title: '模板管理', desc: '维护提示词模板库', icon: BookTemplate, to: '/templates' },
    { title: '系统设置', desc: '模型配置与个人设置', icon: Settings, to: '/settings' },
  ]

  return (
    <div className="space-y-6">
      {/* 欢迎区 */}
      <div className="flex flex-col gap-3 rounded-xl border-0 bg-background/50 px-4 py-3 shadow-md ring-1 ring-inset ring-white/15 backdrop-blur-md dark:bg-background/40 dark:ring-white/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold drop-shadow-sm [text-shadow:0_1px_2px_hsl(var(--background)/0.45)]">
            欢迎回来，{user?.username}
          </h1>
          <p className="mt-1 text-muted-foreground">今天也是提升测试效率的好日子</p>
        </div>
        <Button onClick={() => navigate('/generate')} className="shrink-0 gap-2">
          <Wand2 className="w-4 h-4" />
          立即生成用例
        </Button>
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((a) => (
          <Card
            key={a.title}
            className="hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate(a.to)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-muted/60 backdrop-blur-sm">
                  <a.icon className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold mt-1">{loading ? '-' : card.value}</p>
                </div>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-white/12 backdrop-blur-sm dark:ring-white/8 ${card.bg}`}
                >
                  <card.icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 运行状态（可观测性：解析队列/worker 是否启用） */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">运行状态</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={async () => setHealth(await healthApi.getHealth().catch(() => null))}
          >
            刷新 <ArrowRight className="w-3 h-3 rotate-180" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          {health ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  后端：OK
                </Badge>
                <Badge variant={health.workerEnabled ? 'secondary' : 'destructive'} className="text-xs">
                  解析 Worker：{health.workerEnabled ? '已启用' : '已关闭'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <span>待处理：{health.pending}</span>
                <span>解析中：{health.parsing}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">暂无法获取运行状态（请稍后重试）</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近生成记录 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">最近生成记录</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/records')} className="gap-1 text-xs">
              查看全部 <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-center text-muted-foreground py-8 text-sm">加载中...</div>
            ) : recentRecords.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">暂无记录，去生成第一个用例吧</div>
            ) : (
              recentRecords.map((record) => (
                <div
                  key={record.id}
                  className="-mx-2 flex cursor-pointer items-center justify-between rounded-md px-2 py-2 shadow-[inset_0_-1px_0_0_hsl(var(--border)_/_0.1)] last:shadow-none hover:bg-accent/30 dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
                  onClick={() => navigate('/records')}
                  title="查看生成记录"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{record.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(record.createdAt)}（{formatDate(record.createdAt, 'MM-dd HH:mm')}）
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className="text-xs text-muted-foreground">{record.caseCount} 条</span>
                    <Badge className={`text-xs ${statusColorMap[record.status] || ''}`} variant="outline">
                      {record.status === 'SUCCESS' ? '成功' : record.status === 'FAILED' ? '失败' : record.status === 'PROCESSING' ? '生成中' : '等待中'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 最近用例集 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">最近用例集</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/generate')} className="gap-1 text-xs">
              去生成 <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-center text-muted-foreground py-8 text-sm">加载中...</div>
            ) : recentSuites.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">暂无用例集</div>
            ) : (
              recentSuites.map((suite) => (
                <div
                  key={suite.id}
                  className="-mx-2 flex cursor-pointer items-center justify-between rounded-md px-2 py-2 shadow-[inset_0_-1px_0_0_hsl(var(--border)_/_0.1)] last:shadow-none hover:bg-accent/30 dark:shadow-[inset_0_-1px_0_0_rgba(255,255,255,0.04)]"
                  onClick={() => navigate('/records')}
                  title="查看生成记录"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{suite.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{suite.projectName || '无项目'}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge variant="secondary" className="text-xs">
                      {suite.caseCount} 条用例
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
