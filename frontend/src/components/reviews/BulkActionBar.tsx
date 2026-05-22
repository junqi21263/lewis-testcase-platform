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
    <div className={rev.bulkBar}>
      <span className="text-[hsl(var(--review-text-secondary))]">已选 {count} 条</span>
      <Button size="sm" variant="outline" className="h-8 gap-1" disabled={busy} onClick={onApprove}>
        <Check className="h-3.5 w-3.5" />
        批量通过
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        disabled={busy}
        onClick={onRequestChanges}
      >
        <MessageSquareWarning className="h-3.5 w-3.5" />
        批量待修改
      </Button>
      <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={onClear}>
        <X className="h-3.5 w-3.5" />
        取消
      </Button>
    </div>
  )
}
