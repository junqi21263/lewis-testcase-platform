import { FileText, ServerCog } from 'lucide-react'
import type { RuntimeHints } from '@/api/settings'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  runtime: RuntimeHints | null
}

export function FileParsingSettingsSection({ runtime }: Props) {
  return (
    <SettingsCard
      id="section-file-parsing"
      icon={FileText}
      title="文件解析 / OCR"
      description="PDF 文本层、OCR、多模态视觉 fallback、Redis 缓存与解析队列运行态"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={set.infoItem}>
          <p className={set.infoLabel}>PDF 视觉补充阈值</p>
          <p className={cn(set.infoValue, 'font-sans text-sm')}>
            {typeof runtime?.visionPdfMinTextChars === 'number'
              ? `文本少于 ${runtime.visionPdfMinTextChars} 字时尝试视觉补充`
              : '未暴露阈值'}
          </p>
        </div>
        <div className={set.infoItem}>
          <p className={set.infoLabel}>视觉解析策略</p>
          <p className={cn(set.infoValue, 'font-sans text-sm')}>
            {runtime?.visionPdfAlways ? '所有 PDF 都尝试视觉补充' : '仅低文本量 PDF 尝试视觉补充'}
          </p>
        </div>
        <div className={set.infoItem}>
          <p className={set.infoLabel}>解析 Worker</p>
          <p className={cn(set.infoValue, 'font-sans text-sm')}>
            {runtime?.workers?.fileParseEnabled ? '已启用' : '未启用'} · 并发{' '}
            {runtime?.workers?.fileParseMaxConcurrent ?? '-'} · 超时{' '}
            {runtime?.workers?.fileParseTimeoutMinutes ?? '-'} 分钟
          </p>
        </div>
        <div className={set.infoItem}>
          <p className={set.infoLabel}>模板缓存</p>
          <p className={cn(set.infoValue, 'font-sans text-sm')}>
            {runtime?.templateCache?.redisEnabled ? 'Redis 缓存开启' : 'Redis 缓存关闭'} · TTL{' '}
            {runtime?.templateCache?.ttlMs ?? '-'} ms
          </p>
        </div>
        <div className={cn(set.infoItem, 'sm:col-span-2')}>
          <p className={set.infoLabel}>解析队列</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(runtime?.queues ?? []).map((queue) => (
              <div
                key={queue.name}
                className="rounded-md border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))]/60 px-3 py-2"
              >
                <p className="truncate font-mono text-[11px] text-[hsl(var(--settings-text-muted))]">{queue.name}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-[hsl(var(--settings-text-primary))]">
                  {queue.pending}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className={set.hint}>
        这些值来自服务端环境变量和 Redis 运行态；调整并发、超时或上传大小需要修改 VPS 配置后重新部署。
      </p>
      <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--settings-card-border))]/70 bg-[hsl(var(--settings-info-bg))]/50 px-4 py-3 text-xs text-[hsl(var(--settings-text-secondary))]">
        <ServerCog className="h-4 w-4 shrink-0" />
        上传 PDF 解析慢时，优先查看队列积压、Worker 并发、视觉模型连通性和 Redis 状态。
      </div>
    </SettingsCard>
  )
}
