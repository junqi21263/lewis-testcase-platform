import { Check, MessageSquareWarning, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { rev } from '@/utils/reviewsUi'

export function BulkActionBar(props: {
  count: number
  onClear: () => void
  onApprove: () => void
  onRequestChanges: () => void
  busy?: boolean
}) {
  const { count, onClear, onApprove, onRequestChanges, busy } = props
  if (count <= 0) return null

  return (
    <div className={rev.bulkBar} data-testid="review-bulk-bar">
      <div className={rev.bulkBarMeta}>
        <span className="text-sm font-medium text-[hsl(var(--review-text-primary))]">
          已选 <span className="text-primary">{count}</span> 条
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={rev.btnGhost + ' h-8'}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
          取消选择
        </Button>
      </div>
      <div className={rev.bulkBarActions}>
        <Button
          type="button"
          size="sm"
          className={rev.btnPrimary}
          disabled={busy}
          onClick={onApprove}
        >
          <Check className="h-3.5 w-3.5" />
          批量通过
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={rev.btnSecondary}
          disabled={busy}
          onClick={onRequestChanges}
        >
          <MessageSquareWarning className="h-3.5 w-3.5" />
          批量待修改
        </Button>
      </div>
    </div>
  )
}
