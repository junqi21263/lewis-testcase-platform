import { Activity, Bot, Database, RefreshCw, ServerCog, Workflow } from 'lucide-react'
import type { AIModelAdmin, RuntimeHints } from '@/api/settings'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { buildSettingsOverview } from '@/utils/settingsModelPresets'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  runtime: RuntimeHints | null
  models: AIModelAdmin[]
  loading: boolean
  onRefresh: () => void
}

export function SettingsOverviewSection({ runtime, models, loading, onRefresh }: Props) {
  const overview = buildSettingsOverview(runtime, models)
  const items = [
    { label: '默认模型', value: overview.defaultModelName, icon: Bot },
    { label: '视觉解析模型', value: overview.visionModelName, icon: Activity },
    { label: 'Redis', value: overview.redisLabel, icon: Database },
    { label: '流式输出', value: overview.streamRecoveryLabel, icon: Workflow },
    { label: '解析 Worker', value: overview.workerLabel, icon: ServerCog },
    { label: '队列积压', value: `${overview.pendingQueueCount} 个任务`, icon: Activity },
  ]

  return (
    <SettingsCard
      id="section-overview"
      icon={ServerCog}
      title="设置控制台"
      description="快速判断模型、Redis、文件解析和流式恢复是否处于可用状态"
      actions={
        <Button variant="outline" className={set.btnSecondary} onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          刷新运行态
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className={set.infoItem}>
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[hsl(var(--settings-text-secondary))]" />
                <p className={set.infoLabel}>{item.label}</p>
              </div>
              <p className={cn(set.infoValue, 'font-sans text-sm')}>{item.value}</p>
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={set.infoItem}>
          <p className={set.infoLabel}>启用模型</p>
          <p className={cn(set.infoValue, 'font-sans')}>{overview.enabledModelCount} 个</p>
        </div>
        <div className={set.infoItem}>
          <p className={set.infoLabel}>最近测试失败</p>
          <p className={cn(set.infoValue, overview.failedModelCount > 0 ? 'text-[color:var(--settings-badge-danger-text)]' : 'font-sans')}>
            {overview.failedModelCount} 个
          </p>
        </div>
        <div className={set.infoItem}>
          <p className={set.infoLabel}>上传上限</p>
          <p className={cn(set.infoValue, 'font-sans')}>{overview.uploadLimitLabel}</p>
        </div>
      </div>
    </SettingsCard>
  )
}
