import { Activity, CalendarDays, Coins, Zap } from 'lucide-react'
import type { UsageSummary } from '@/api/usage'
import { cn } from '@/utils/cn'
import { usage } from '@/utils/usageUi'

type CardDef = {
  key: string
  label: string
  accentClass: string
  icon: typeof Activity
  main: (s: UsageSummary) => string | number
  sub: (s: UsageSummary) => string[]
}

const cardDefs: CardDef[] = [
  {
    key: 'today',
    label: '今日调用',
    accentClass: 'text-[hsl(var(--usage-metric-today-accent))]',
    icon: Activity,
    main: (s) => s.today.calls,
    sub: (s) => [
      `Tokens: ${s.today.tokens.toLocaleString()}`,
      `费用: ¥${s.today.costCny.toFixed(4)}`,
    ],
  },
  {
    key: 'month',
    label: '本月调用',
    accentClass: 'text-[hsl(var(--usage-metric-month-accent))]',
    icon: CalendarDays,
    main: (s) => s.month.calls,
    sub: (s) => [
      `Tokens: ${s.month.tokens.toLocaleString()}`,
      `费用: ¥${s.month.costCny.toFixed(4)}`,
    ],
  },
  {
    key: 'tokens',
    label: 'Token 总量',
    accentClass: 'text-[hsl(var(--usage-metric-token-accent))]',
    icon: Zap,
    main: (s) => s.month.tokens.toLocaleString(),
    sub: () => ['本月累计 Token'],
  },
  {
    key: 'cost',
    label: '费用估算',
    accentClass: 'text-[hsl(var(--usage-metric-cost-accent))]',
    icon: Coins,
    main: (s) => `¥${s.month.costCny.toFixed(2)}`,
    sub: () => ['基于本月调用估算'],
  },
]

export function UsageSummaryCards(props: { summary: UsageSummary | null; loading?: boolean }) {
  const { summary, loading } = props

  return (
    <div className={usage.summaryGrid}>
      {cardDefs.map((c) => {
        const Icon = c.icon
        return (
          <article key={c.key} className={usage.metricCard}>
            <div
              className={cn(
                usage.metricIcon,
                'bg-[hsl(var(--usage-metric-bg))] ring-[hsl(var(--usage-metric-border))]',
                c.accentClass,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <p className={usage.metricLabel}>{c.label}</p>
            <p className={usage.metricValue}>
              {loading && !summary ? '—' : summary ? c.main(summary) : 0}
            </p>
            <div className={usage.metricSub}>
              {summary
                ? c.sub(summary).map((line) => <p key={line}>{line}</p>)
                : (
                  <>
                    <p>—</p>
                  </>
                )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
