import { History, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CaseVersionItem } from '@/types/reviews'
import { rev } from '@/utils/reviewsUi'

const sourceLabels: Record<string, string> = {
  generate: 'AI 生成',
  manual_edit: '人工编辑',
  restore: '版本恢复',
}

export function VersionHistoryPanel(props: {
  versions: CaseVersionItem[]
  currentVersion: number
  loading?: boolean
  onSelectDiff: (versionId: string) => void
  onRestore: (versionId: string, versionNumber: number) => void
}) {
  const { versions, currentVersion, loading, onSelectDiff, onRestore } = props

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <p className="text-sm text-[hsl(var(--review-text-muted))]">加载版本…</p>
      )}
      {!loading && versions.length === 0 && (
        <p className="text-sm text-[hsl(var(--review-text-muted))]">暂无版本记录</p>
      )}
      {versions.map((v) => (
        <div
          key={v.id}
          className="rounded-xl border border-[hsl(var(--review-border))] bg-[hsl(var(--review-input-bg))] p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--review-text-muted))]" />
                <span className="text-sm font-semibold text-[hsl(var(--review-text-primary))]">
                  v{v.versionNumber}
                  {v.versionNumber === currentVersion ? (
                    <span className="ml-1.5 text-[10px] font-medium text-primary">当前</span>
                  ) : null}
                </span>
              </div>
              <p className="mt-1 text-xs text-[hsl(var(--review-text-muted))]">
                {sourceLabels[v.sourceType] ?? v.sourceType} · {v.authorName}
              </p>
              {v.changeSummary ? (
                <p className="mt-1 text-xs text-[hsl(var(--review-text-secondary))]">
                  {v.changeSummary}
                </p>
              ) : null}
              <p className="mt-0.5 text-[10px] text-[hsl(var(--review-text-muted))]">
                {new Date(v.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSelectDiff(v.id)}>
              对比
            </Button>
            {v.versionNumber !== currentVersion ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={() => onRestore(v.id, v.versionNumber)}
              >
                <RotateCcw className="h-3 w-3" />
                恢复
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReviewSidePanel(props: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-20 flex justify-end" role="presentation">
      <button
        type="button"
        className={rev.sidePanelBackdrop}
        aria-label="关闭侧栏"
        onClick={props.onClose}
      />
      <aside className={rev.sidePanel}>
        <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--review-border))] px-4 py-3">
          <h3 className="text-sm font-semibold text-[hsl(var(--review-text-primary))]">{props.title}</h3>
          <Button size="sm" variant="ghost" onClick={props.onClose}>
            关闭
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto review-scrollbar p-4">{props.children}</div>
      </aside>
    </div>
  )
}
