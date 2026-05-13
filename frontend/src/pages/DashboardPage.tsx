import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
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
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { recordsApi } from '@/api/records'
import { testcasesApi } from '@/api/testcases'
import { healthApi, type HealthStatus } from '@/api/health'
import { formatDate, timeAgo } from '@/utils/format'
import type { GenerationRecord, TestSuite } from '@/types'
import { cn } from '@/utils/cn'

/** 工作台统一面板：全部由 workspace theme token 驱动 */
const dash = {
  panel:
    'rounded-[20px] border border-workspace-panel-border/70 bg-workspace-panel/86 shadow-[0_22px_56px_-40px_rgba(59,130,246,0.22)] backdrop-blur-xl dark:border-white/[0.09] dark:bg-workspace-panel/72 dark:shadow-[0_26px_64px_-40px_rgba(0,0,0,0.68)]',
  panelHeader:
    'flex items-start justify-between gap-3 border-b border-workspace-panel-border/60 px-5 py-4 dark:border-white/[0.06]',
  kicker: 'text-[10px] font-semibold uppercase tracking-[0.2em] text-workspace-text-muted',
  panelTitle: 'text-base font-semibold tracking-tight text-workspace-text-primary',
  panelLink:
    'group inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-medium text-primary transition-[color,background-color] hover:bg-primary/10',
  listBody: 'flex flex-col gap-1 p-3 pb-4',
  listRow:
    'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-[transform,opacity,background-color] duration-200 [-webkit-tap-highlight-color:transparent] hover:bg-workspace-panel-muted/90 hover:translate-x-0.5 dark:hover:bg-white/[0.045] motion-reduce:hover:translate-x-0',
  emptyWrap:
    'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-workspace-panel-border/75 bg-workspace-empty-state/95 px-5 py-10 text-center dark:border-white/[0.08] dark:bg-workspace-empty-state/80',
  emptyIcon:
    'flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/22 via-workspace-panel/80 to-violet-400/18 ring-1 ring-workspace-panel-border/60 dark:from-cyan-400/12 dark:via-white/5 dark:to-violet-500/15 dark:ring-white/10',
  emptyTitle: 'text-sm font-semibold text-workspace-text-primary',
  emptyHint: 'max-w-[260px] text-xs leading-relaxed text-workspace-text-secondary',
  emptyCta:
    'mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-[color,gap] hover:gap-1.5',
} as const

interface Stats {
  totalCases: number
  totalRecords: number
  totalSuites: number
  successRate: number
}

function MiniSparkline({ seed, className }: { seed: number; className?: string }) {
  const pts = useMemo(() => {
    return [0, 1, 2, 3, 4, 5].map((i) => {
      const y = 42 + (((seed >> (i * 3)) & 7) - 3.5) * 6
      return `${4 + i * 10},${Math.max(18, Math.min(54, y))}`
    })
  }, [seed])
  return (
    <svg
      viewBox="0 0 64 56"
      className={cn('h-10 w-[4.5rem] shrink-0 text-cyan-500/55 dark:text-cyan-300/45', className)}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  )
}

function SuccessRing({ rate }: { rate: number }) {
  const clamped = Math.max(0, Math.min(100, rate))
  const dash = `${(clamped / 100) * 100.53} 100.53`
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
        <circle cx="20" cy="20" r="16" fill="none" className="stroke-muted/35" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r="16"
          fill="none"
          className="stroke-emerald-400/90 dark:stroke-emerald-300/85"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </svg>
      <span className="pointer-events-none absolute text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-200">
        {Math.round(clamped)}
      </span>
    </div>
  )
}

function recordStatusLabel(status: string) {
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  if (status === 'PROCESSING') return '生成中'
  return '等待中'
}

function recordStatusPillClass(status: string) {
  if (status === 'SUCCESS')
    return 'bg-emerald-500/14 text-emerald-900 ring-1 ring-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-400/25'
  if (status === 'FAILED')
    return 'bg-rose-500/14 text-rose-900 ring-1 ring-rose-400/22 dark:text-rose-100 dark:ring-rose-400/28'
  if (status === 'PROCESSING')
    return 'bg-cyan-500/14 text-cyan-950 ring-1 ring-cyan-400/25 dark:text-cyan-50 dark:ring-cyan-400/30'
  return 'bg-amber-400/16 text-amber-950 ring-1 ring-amber-300/30 dark:text-amber-50 dark:ring-amber-300/25'
}

function DashListEmpty({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string
  hint: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className={cn(dash.emptyWrap, 'mx-3 my-2')}>
      <div className={dash.emptyIcon} aria-hidden>
        <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-200" strokeWidth={1.85} />
      </div>
      <p className={dash.emptyTitle}>{title}</p>
      <p className={dash.emptyHint}>{hint}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className={cn(dash.emptyCta, 'group')}>
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  )
}

function DashRecentPanel({
  kicker,
  title,
  actionLabel,
  onAction,
  children,
}: {
  kicker: string
  title: string
  actionLabel: string
  onAction: () => void
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col overflow-hidden', dash.panel)}>
      <div className={dash.panelHeader}>
        <div className="min-w-0 space-y-1">
          <p className={dash.kicker}>{kicker}</p>
          <h2 className={dash.panelTitle}>{title}</h2>
        </div>
        <button type="button" onClick={onAction} className={cn(dash.panelLink, 'shrink-0')}>
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5 opacity-80 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </button>
      </div>
      {children}
    </div>
  )
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

  const statCards = useMemo(
    () =>
      [
        {
          title: '总生成记录',
          value: stats.totalRecords,
          icon: FileText,
          sparkSeed: stats.totalRecords + 11,
          accent: 'from-sky-400/90 to-cyan-500/80',
        },
        {
          title: '用例集数量',
          value: stats.totalSuites,
          icon: CheckSquare,
          sparkSeed: stats.totalSuites + 101,
          accent: 'from-violet-400/90 to-indigo-500/80',
        },
        {
          title: '累计生成用例',
          value: stats.totalCases,
          icon: TrendingUp,
          sparkSeed: stats.totalCases + 503,
          accent: 'from-emerald-400/85 to-teal-500/75',
        },
        {
          title: '成功率',
          value: `${stats.successRate}%`,
          numericRate: stats.successRate,
          icon: TrendingUp,
          sparkSeed: stats.successRate + 907,
          accent: 'from-amber-300/90 to-orange-400/80',
          isRate: true as const,
        },
      ] as const,
    [stats],
  )

  const quickActions = [
    {
      title: '解析文档',
      desc: '上传并解析需求文档',
      icon: FileUp,
      to: '/upload',
      accent: 'cyan' as const,
    },
    {
      title: '生成用例',
      desc: '配置参数并流式生成',
      icon: Wand2,
      to: '/generate',
      accent: 'violet' as const,
    },
    {
      title: '模板管理',
      desc: '维护提示词模板库',
      icon: BookTemplate,
      to: '/templates',
      accent: 'mint' as const,
    },
    {
      title: '系统设置',
      desc: '模型配置与个人设置',
      icon: Settings,
      to: '/settings',
      accent: 'amber' as const,
    },
  ]

  const accentTileMap = {
    cyan: 'from-cyan-400/25 via-cyan-500/10 to-transparent border-cyan-400/25 shadow-[0_20px_50px_-34px_rgba(34,211,238,0.55)]',
    violet:
      'from-violet-400/25 via-indigo-500/10 to-transparent border-violet-400/25 shadow-[0_20px_50px_-34px_rgba(167,139,250,0.55)]',
    mint: 'from-emerald-400/22 via-teal-500/10 to-transparent border-emerald-400/25 shadow-[0_20px_50px_-34px_rgba(52,211,153,0.5)]',
    amber:
      'from-amber-300/28 via-amber-500/10 to-transparent border-amber-300/30 shadow-[0_20px_50px_-34px_rgba(251,191,36,0.45)]',
  }

  const accentIconMap = {
    cyan: 'bg-cyan-500/15 text-cyan-700 ring-cyan-400/25 dark:text-cyan-100 dark:ring-cyan-400/20',
    violet: 'bg-violet-500/15 text-violet-700 ring-violet-400/25 dark:text-violet-100 dark:ring-violet-400/20',
    mint: 'bg-emerald-500/15 text-emerald-800 ring-emerald-400/25 dark:text-emerald-100 dark:ring-emerald-400/20',
    amber: 'bg-amber-400/18 text-amber-900 ring-amber-300/35 dark:text-amber-100 dark:ring-amber-300/25',
  }

  const queueTotal = health ? Math.max(1, health.pending + health.parsing) : 1
  const queueBusyPct = health ? Math.min(100, Math.round((health.parsing / queueTotal) * 100)) : 0

  return (
    <div className="space-y-7 md:space-y-8">
      {/* Hero */}
      <section
        className={cn(
          'dash-enter dash-enter-delay-1 relative overflow-hidden rounded-[22px] border',
          'border-workspace-panel-border/75 bg-gradient-to-br from-workspace-panel/92 via-workspace-page to-workspace-panel-muted/70',
          'p-6 shadow-[0_28px_70px_-44px_rgba(56,189,248,0.35)] backdrop-blur-xl',
          'dark:border-white/[0.09] dark:from-slate-950/75 dark:via-[#0d1528]/80 dark:to-[#121c33]/85',
          'dark:shadow-[0_32px_80px_-40px_rgba(0,0,0,0.72)]',
        )}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/18 blur-3xl dark:bg-cyan-500/12" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-52 w-52 rounded-full bg-violet-400/16 blur-3xl dark:bg-violet-500/10" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                'bg-gradient-to-br from-cyan-400/30 via-white/80 to-violet-400/25 ring-1 ring-white/50',
                'dark:from-cyan-400/20 dark:via-white/10 dark:to-violet-500/20 dark:ring-white/15',
              )}
              aria-hidden
            >
              <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-200" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-workspace-text-muted">
                Friendly AI workspace
              </p>
              <h1 className="text-balance text-2xl font-semibold tracking-tight text-workspace-text-primary sm:text-[1.65rem]">
                欢迎回来，{user?.username ?? '用户'}
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-workspace-text-secondary">
                今天也让 AI 帮你少写一点重复用例。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={() => navigate('/generate')}
              className={cn(
                'dash-primary-cta group relative h-[52px] overflow-hidden rounded-2xl border-0 px-6 text-[15px] font-semibold text-white shadow-lg',
                'bg-gradient-to-r from-violet-600 via-cyan-500 to-teal-500',
                'transition-[transform,box-shadow,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                'hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-18px_rgba(99,102,241,0.55)]',
                'active:translate-y-px active:brightness-[0.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0',
              )}
            >
              <span className="relative z-[1] inline-flex items-center gap-2">
                <Wand2 className="h-4 w-4" strokeWidth={2} />
                立即生成用例
              </span>
            </Button>
          </div>
        </div>
      </section>

      {/* Action tiles */}
      <section className="dash-enter dash-enter-delay-2 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => {
          const TileIcon = action.icon
          return (
            <button
              key={action.title}
              type="button"
              onClick={() => navigate(action.to)}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-[20px] border border-workspace-panel-border/65 bg-workspace-action-tile/90 p-5 text-left',
                'shadow-[0_18px_44px_-36px_rgba(59,130,246,0.2)] backdrop-blur-xl transition-[transform,box-shadow,opacity] duration-300',
                'hover:-translate-y-1 hover:shadow-[0_28px_60px_-32px_rgba(56,189,248,0.35)]',
                'dark:border-white/[0.08] dark:bg-workspace-action-tile/75 dark:shadow-[0_24px_60px_-36px_rgba(0,0,0,0.65)] dark:hover:shadow-[0_32px_70px_-28px_rgba(99,102,241,0.25)]',
                'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                accentTileMap[action.accent],
              )}
            >
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                  'bg-[radial-gradient(ellipse_at_90%_0%,rgba(56,189,248,0.22),transparent_55%)]',
                  'dark:bg-[radial-gradient(ellipse_at_90%_0%,rgba(167,139,250,0.18),transparent_55%)]',
                  'motion-reduce:opacity-0',
                )}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[15px] font-semibold tracking-tight text-workspace-text-primary">{action.title}</p>
                  <p className="text-xs leading-relaxed text-workspace-text-secondary">{action.desc}</p>
                </div>
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 backdrop-blur-sm transition-transform duration-300',
                    'group-hover:-rotate-6 group-hover:translate-x-0.5 motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:translate-x-0',
                    accentIconMap[action.accent],
                  )}
                >
                  <TileIcon className="h-5 w-5" strokeWidth={1.75} />
                </div>
              </div>
              <div className="relative mt-5 flex items-center justify-between text-xs font-medium text-cyan-700/80 dark:text-cyan-200/80">
                <span className="opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:opacity-100">
                  Go
                </span>
                <ArrowRight className="h-4 w-4 translate-x-0 opacity-60 transition-transform duration-300 group-hover:translate-x-1 group-hover:opacity-100 motion-reduce:group-hover:translate-x-0" />
              </div>
            </button>
          )
        })}
      </section>

      {/* Metrics */}
      <section className="dash-enter dash-enter-delay-3 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon
          const isRate = 'isRate' in card && card.isRate === true
          return (
            <div
              key={card.title}
              className={cn('relative overflow-hidden p-5', dash.panel, 'transition-shadow duration-300 hover:shadow-[0_26px_60px_-36px_rgba(99,102,241,0.18)] dark:hover:shadow-[0_28px_64px_-38px_rgba(99,102,241,0.12)]')}
            >
              <div
                className={cn(
                  'pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-55 blur-2xl',
                  card.accent,
                )}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {card.title}
                  </p>
                  <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50 sm:text-[2.1rem]">
                    {loading ? '—' : card.value}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-500">实时汇总</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {isRate && 'numericRate' in card ? (
                    <SuccessRing rate={card.numericRate} />
                  ) : (
                    <MiniSparkline seed={card.sparkSeed} />
                  )}
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ring-1 ring-white/25',
                      card.accent,
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* System health */}
      <section className={cn('dash-enter dash-enter-delay-4 p-5', dash.panel)}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-900 dark:text-emerald-100">
              后端 OK
            </span>
            {health ? (
              <>
                <span
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium',
                    health.workerEnabled
                      ? 'border-cyan-400/35 bg-cyan-500/12 text-cyan-900 dark:text-cyan-100'
                      : 'border-rose-400/35 bg-rose-500/12 text-rose-900 dark:text-rose-100',
                  )}
                >
                  解析 Worker：{health.workerEnabled ? '已启用' : '已关闭'}
                </span>
                <span className="rounded-full border border-violet-400/30 bg-violet-500/12 px-3 py-1 text-xs font-medium text-violet-900 dark:text-violet-100">
                  队列正常
                </span>
              </>
            ) : null}
          </div>

          <div className="flex min-w-[200px] flex-1 flex-col gap-2 lg:max-w-md">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>待处理 {health?.pending ?? '—'}</span>
              <span>解析中 {health?.parsing ?? '—'}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800/90">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-teal-400 transition-[width] duration-500 ease-out"
                style={{ width: `${health ? Math.max(6, queueBusyPct) : 6}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-full border border-slate-200/70 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <Sparkles className="h-3.5 w-3.5 text-violet-500 dark:text-violet-300" strokeWidth={2} />
              <span>小助手已就绪</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 rounded-xl text-slate-600 hover:bg-slate-100/90 dark:text-slate-300 dark:hover:bg-white/10"
              onClick={async () => setHealth(await healthApi.getHealth().catch(() => null))}
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              刷新
            </Button>
          </div>
        </div>
        {!health && !loading ? (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">暂无法获取运行状态（请稍后重试）</p>
        ) : null}
      </section>

      {/* Lists — 与上方同一 dash.panel token；modern list + 软空状态 */}
      <div className="dash-enter dash-enter-delay-5 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
        <DashRecentPanel
          kicker="Activity"
          title="最近生成记录"
          actionLabel="查看全部"
          onAction={() => navigate('/records')}
        >
          <div className={dash.listBody}>
            {loading ? (
              <div className="rounded-xl px-3 py-10 text-center text-sm text-slate-500 animate-pulse dark:text-slate-400">
                加载中…
              </div>
            ) : recentRecords.length === 0 ? (
              <DashListEmpty
                title="还没有生成记录"
                hint="从第一份需求开始，让 AI 帮你起草可评审的用例。"
                actionLabel="去生成"
                onAction={() => navigate('/generate')}
              />
            ) : (
              recentRecords.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => navigate('/records')}
                  title="查看生成记录"
                  className={dash.listRow}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
                      {record.title}
                    </p>
                    <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                      <Clock className="h-3 w-3 shrink-0 opacity-80" strokeWidth={2} />
                      <span className="truncate">
                        {timeAgo(record.createdAt)} · {formatDate(record.createdAt, 'MM-dd HH:mm')}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{record.caseCount} 条</span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-none',
                        recordStatusPillClass(record.status),
                      )}
                    >
                      {recordStatusLabel(record.status)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </DashRecentPanel>

        <DashRecentPanel
          kicker="Library"
          title="最近用例集"
          actionLabel="去生成"
          onAction={() => navigate('/generate')}
        >
          <div className={dash.listBody}>
            {loading ? (
              <div className="rounded-xl px-3 py-10 text-center text-sm text-slate-500 animate-pulse dark:text-slate-400">
                加载中…
              </div>
            ) : recentSuites.length === 0 ? (
              <DashListEmpty
                title="暂无用例集"
                hint="完成一次用例生成后，最近的用例集会显示在这里。"
                actionLabel="去生成"
                onAction={() => navigate('/generate')}
              />
            ) : (
              recentSuites.map((suite) => (
                <button
                  key={suite.id}
                  type="button"
                  onClick={() => navigate('/records')}
                  title="查看生成记录"
                  className={dash.listRow}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{suite.name}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{suite.projectName || '无项目'}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-500/20 dark:text-emerald-100 dark:ring-emerald-400/25">
                    {suite.caseCount} 条用例
                  </span>
                </button>
              ))
            )}
          </div>
        </DashRecentPanel>
      </div>
    </div>
  )
}
