import { Sparkles, UserPlus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Variant = 'no-teams' | 'no-members' | 'no-invites'

const copy: Record<
  Variant,
  { title: string; description: string; icon: typeof Users; cta?: string }
> = {
  'no-teams': {
    title: '还没有团队',
    description: '创建团队后即可邀请成员协作管理用例生成流程',
    icon: Users,
    cta: '创建团队',
  },
  'no-members': {
    title: '暂无成员',
    description: '邀请成员加入团队，一起管理测试用例与生成流程',
    icon: UserPlus,
    cta: '邀请成员',
  },
  'no-invites': {
    title: '暂无待处理邀请',
    description: '发出的邀请将显示在这里，便于跟踪与撤销',
    icon: Sparkles,
  },
}

export function TeamsEmptyState(props: {
  variant: Variant
  onAction?: () => void
  compact?: boolean
}) {
  const { variant, onAction, compact } = props
  const c = copy[variant]
  const Icon = c.icon

  return (
    <div
      className={
        compact
          ? 'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[hsl(var(--teams-panel-border))] bg-[hsl(var(--teams-empty-bg))]/60 px-4 py-10 text-center'
          : 'flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-[18px] border border-dashed border-[hsl(var(--teams-panel-border))] bg-[hsl(var(--teams-empty-bg))]/60 px-6 py-12 text-center'
      }
      role="status"
    >
      <div
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 via-workspace-panel/90 to-violet-400/15 ring-1 ring-[hsl(var(--teams-panel-border))]"
        aria-hidden
      >
        <Icon className="h-5 w-5 text-primary dark:text-cyan-300" strokeWidth={2} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[hsl(var(--teams-text-primary))]">{c.title}</p>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-[hsl(var(--teams-text-secondary))]">
          {c.description}
        </p>
      </div>
      {c.cta && onAction && (
        <Button type="button" size="sm" className="h-9 rounded-xl" onClick={onAction}>
          {c.cta}
        </Button>
      )}
    </div>
  )
}
