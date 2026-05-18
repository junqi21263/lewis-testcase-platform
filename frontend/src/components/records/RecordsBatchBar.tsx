import { Button } from '@/components/ui/button'
import { rec } from '@/utils/recordsUi'

export function RecordsBatchBar(props: {
  count: number
  mode: 'list' | 'recycle'
  onExport?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onRestore?: () => void
  onHardDelete?: () => void
  onClear: () => void
  onSelectAllMatching?: () => void
}) {
  const {
    count,
    mode,
    onExport,
    onArchive,
    onDelete,
    onRestore,
    onHardDelete,
    onClear,
    onSelectAllMatching,
  } = props

  if (count < 1) return null

  return (
    <div className={rec.batchBar} role="status">
      <span className="font-medium text-workspace-text-secondary">
        已选择 <span className="text-workspace-text-primary">{count}</span> 条
      </span>
      {mode === 'list' ? (
        <>
          {onExport && (
            <Button type="button" size="sm" variant="outline" onClick={onExport}>
              批量导出
            </Button>
          )}
          {onArchive && (
            <Button type="button" size="sm" variant="outline" onClick={onArchive}>
              批量归档
            </Button>
          )}
          {onDelete && (
            <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
              批量删除
            </Button>
          )}
          {onSelectAllMatching && (
            <Button type="button" size="sm" variant="ghost" className="text-xs" onClick={onSelectAllMatching}>
              全选符合条件（≤500）
            </Button>
          )}
        </>
      ) : (
        <>
          {onRestore && (
            <Button type="button" size="sm" variant="outline" onClick={onRestore}>
              批量恢复
            </Button>
          )}
          {onHardDelete && (
            <Button type="button" size="sm" variant="destructive" onClick={onHardDelete}>
              批量永久删除
            </Button>
          )}
        </>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        取消选择
      </Button>
    </div>
  )
}
