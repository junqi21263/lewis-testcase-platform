import { Sparkles, Trash2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Variant = 'recycle' | 'empty' | 'no-match'

const copy: Record<
  Variant,
  { title: string; description: string; icon: typeof Sparkles }
> = {
  recycle: {
    title: '回收站为空',
    description: '删除的生成记录会暂存在这里，需要时可恢复或永久删除。',
    icon: Trash2,
  },
  empty: {
    title: '暂无生成记录',
    description: '完成一次 AI 用例生成后，记录会自动出现在这里。',
    icon: Sparkles,
  },
  'no-match': {
    title: '暂无匹配记录',
    description: '尝试调整筛选条件，或清空筛选后重新查看。',
    icon: Search,
  },
}

export function RecordsEmptyState(props: {
  variant: Variant
  onClearFilters?: () => void
  onGoList?: () => void
  onGoGenerate?: () => void
}) {
  const { variant, onClearFilters, onGoList, onGoGenerate } = props
  const c = copy[variant]
  const Icon = c.icon

  return (
    <div
      className="flex min-h-[260px] max-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-workspace-panel-border/75 bg-workspace-empty-state/90 px-6 py-10 text-center dark:border-white/[0.08] dark:bg-workspace-empty-state/75"
      role="status"
    >
      <div
        className="records-spark-icon flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 via-workspace-panel/90 to-violet-400/15 ring-1 ring-workspace-panel-border/60 dark:from-cyan-400/12 dark:via-white/[0.04] dark:to-violet-500/12 dark:ring-white/10"
        aria-hidden
      >
        <Icon className="h-5 w-5 text-primary dark:text-cyan-300" strokeWidth={2} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-workspace-text-primary">{c.title}</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-workspace-text-secondary">
          {c.description}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {variant === 'no-match' && onClearFilters && (
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            清空筛选
          </Button>
        )}
        {variant === 'recycle' && onGoList && (
          <Button type="button" variant="default" size="sm" onClick={onGoList}>
            返回全部记录
          </Button>
        )}
        {variant === 'empty' && onGoGenerate && (
          <Button type="button" variant="default" size="sm" onClick={onGoGenerate}>
            去生成用例
          </Button>
        )}
      </div>
    </div>
  )
}
