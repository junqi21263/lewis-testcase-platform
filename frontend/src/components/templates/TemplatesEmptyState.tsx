import { Plus, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Variant = 'empty' | 'no-match'

const copy: Record<Variant, { title: string; description: string; icon: typeof Sparkles }> = {
  empty: {
    title: '暂无模板',
    description: '创建一个模板，让 AI 用例生成保持统一风格',
    icon: Sparkles,
  },
  'no-match': {
    title: '没有匹配的模板',
    description: '尝试调整搜索或分类筛选，或清空筛选后重新查看',
    icon: Search,
  },
}

export function TemplatesEmptyState(props: {
  variant: Variant
  onCreate?: () => void
  onClearFilters?: () => void
}) {
  const { variant, onCreate, onClearFilters } = props
  const c = copy[variant]
  const Icon = c.icon

  return (
    <div
      className="flex min-h-[280px] max-h-[340px] flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-toolbar-bg))]/60 px-6 py-12 text-center"
      role="status"
    >
      <div
        className="templates-spark-icon flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 via-workspace-panel/90 to-violet-400/15 ring-1 ring-[hsl(var(--templates-panel-border))] dark:from-cyan-400/12 dark:via-white/[0.04] dark:to-violet-500/12"
        aria-hidden
      >
        <Icon className="h-5 w-5 text-primary dark:text-cyan-300" strokeWidth={2} />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-[hsl(var(--templates-text-primary))]">{c.title}</p>
        <p className="mx-auto max-w-sm text-xs leading-relaxed text-[hsl(var(--templates-text-secondary))]">
          {c.description}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onCreate && (
          <Button type="button" size="sm" className="h-9 gap-1.5 rounded-xl px-4" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            新建模板
          </Button>
        )}
        {variant === 'no-match' && onClearFilters && (
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-xl" onClick={onClearFilters}>
            清空筛选
          </Button>
        )}
      </div>
    </div>
  )
}
