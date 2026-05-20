import { BarChart3 } from 'lucide-react'
import type { UsageSummary } from '@/api/usage'
import { cn } from '@/utils/cn'
import { usage } from '@/utils/usageUi'

export function UsageModuleDistribution(props: {
  rows: UsageSummary['moduleDistribution']
  loading?: boolean
}) {
  const { rows, loading } = props
  const total = rows.reduce((s, r) => s + r.count, 0)
  const max = Math.max(...rows.map((r) => r.count), 1)

  return (
    <section className={usage.panel}>
      <header className={usage.panelHeader}>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[hsl(var(--usage-metric-month-accent))]" />
          <div>
            <h2 className={usage.panelTitle}>模块占比</h2>
            <p className={usage.panelSub}>总调用 {total.toLocaleString()} 次</p>
          </div>
        </div>
      </header>
      <div
        className={cn(
          'usage-scrollbar max-h-[320px] space-y-4 overflow-y-auto px-5 py-5',
          loading && 'opacity-60',
        )}
      >
        {rows.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[hsl(var(--usage-panel-border))] bg-[hsl(var(--usage-empty-bg))]/50 px-4 py-10 text-center">
            <p className="text-sm font-medium text-[hsl(var(--usage-text-primary))]">暂无模块调用数据</p>
            <p className="text-xs text-[hsl(var(--usage-text-muted))]">完成调用后将按模块统计占比</p>
          </div>
        ) : (
          rows.map((r) => {
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0
            const width = `${Math.max(4, (r.count / max) * 100)}%`
            return (
              <div key={r.moduleType} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span
                    className="min-w-0 truncate font-medium text-[hsl(var(--usage-text-primary))]"
                    title={r.moduleType}
                  >
                    {r.moduleType}
                  </span>
                  <span className="shrink-0 tabular-nums text-xs text-[hsl(var(--usage-text-muted))]">
                    {r.count.toLocaleString()} · {pct}%
                  </span>
                </div>
                <div className={usage.barTrack} aria-hidden>
                  <div className={usage.barFill} style={{ width }} />
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
