import { cn } from '@/utils/cn'

export function RecordsSegmentedTabs(props: {
  view: 'list' | 'recycle'
  onChange: (view: 'list' | 'recycle') => void
}) {
  const { view, onChange } = props
  return (
    <div
      className="inline-flex rounded-xl border border-workspace-panel-border/60 bg-workspace-panel-muted/60 p-1 dark:border-white/[0.08] dark:bg-white/[0.03]"
      role="tablist"
      aria-label="记录视图"
    >
      {(
        [
          ['list', '全部记录'],
          ['recycle', '回收站'],
        ] as const
      ).map(([id, label]) => {
        const active = view === id
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              'relative rounded-lg px-4 py-2 text-sm font-medium transition-[color,background-color,box-shadow] duration-200',
              active
                ? 'bg-workspace-panel text-workspace-text-primary shadow-sm ring-1 ring-workspace-panel-border/70 dark:bg-white/[0.08] dark:text-white dark:ring-white/12'
                : 'text-workspace-text-muted hover:text-workspace-text-primary dark:hover:text-workspace-text-secondary',
            )}
            onClick={() => onChange(id)}
          >
            {active && (
              <span
                className="pointer-events-none absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-primary/70 dark:bg-cyan-400/65"
                aria-hidden
              />
            )}
            {label}
          </button>
        )
      })}
    </div>
  )
}
