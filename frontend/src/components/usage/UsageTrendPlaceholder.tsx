import { LineChart } from 'lucide-react'
import { usage } from '@/utils/usageUi'

export function UsageTrendPlaceholder() {
  return (
    <section className={usage.panel}>
      <header className={usage.panelHeader}>
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-[hsl(var(--usage-metric-today-accent))]" />
          <div>
            <h2 className={usage.panelTitle}>调用趋势</h2>
            <p className={usage.panelSub}>按时间查看调用量变化</p>
          </div>
        </div>
      </header>
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <p className="text-sm font-medium text-[hsl(var(--usage-text-primary))]">暂无趋势数据</p>
        <p className="max-w-xs text-xs leading-relaxed text-[hsl(var(--usage-text-muted))]">
          累积更多调用后将在这里展示趋势
        </p>
      </div>
    </section>
  )
}
