import type { VersionDiffField } from '@/types/reviews'
import { cn } from '@/utils/cn'

export function VersionDiffViewer({ fields, loading }: { fields: VersionDiffField[]; loading?: boolean }) {
  if (loading) {
    return <p className="text-sm text-[hsl(var(--review-text-muted))]">加载 diff…</p>
  }
  if (!fields.length) {
    return <p className="text-sm text-[hsl(var(--review-text-muted))]">暂无差异数据</p>
  }

  const changed = fields.filter((f) => f.changed)
  if (!changed.length) {
    return <p className="text-sm text-[hsl(var(--review-text-muted))]">与对比版本一致</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {changed.map((f) => (
        <div
          key={f.field}
          className="rounded-xl border border-[hsl(var(--review-border))] bg-[hsl(var(--review-input-bg))] p-3"
        >
          <div className="mb-2 text-xs font-semibold text-[hsl(var(--review-text-primary))]">
            {f.label}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--review-text-muted))]">
                变更前
              </div>
              <pre
                className={cn(
                  'max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-rose-500/5 px-2 py-1.5 text-xs text-[hsl(var(--review-text-secondary))]',
                )}
              >
                {f.before || '（空）'}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--review-text-muted))]">
                变更后
              </div>
              <pre
                className={cn(
                  'max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-emerald-500/8 px-2 py-1.5 text-xs text-[hsl(var(--review-text-secondary))]',
                )}
              >
                {f.after || '（空）'}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
