import { Button } from '@/components/ui/button'
import { rec } from '@/utils/recordsUi'
import { cn } from '@/utils/cn'

type BatchProps = {
  count: number
  mode: 'list' | 'recycle'
  onExport?: () => void
  onArchive?: () => void
  onDelete?: () => void
  onRestore?: () => void
  onHardDelete?: () => void
  onClear: () => void
  onSelectAllMatching?: () => void
}

export function RecordsTableToolbar(props: {
  total: number
  loading: boolean
  appliedChips: string[]
  listLength: number
  selectedCount: number
  allPageSelected: boolean
  onSelectAllPage: () => void
  batch: BatchProps
}) {
  const {
    total,
    loading,
    appliedChips,
    listLength,
    selectedCount,
    allPageSelected,
    onSelectAllPage,
    batch,
  } = props

  return (
    <div className={rec.tableToolbar} role="region" aria-label="表格工具栏">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className={rec.toolbarTitle}>{loading ? '加载中…' : `共 ${total} 条`}</p>
        {appliedChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[hsl(var(--records-text-muted))]">已应用</span>
            {appliedChips.map((chip) => (
              <span key={chip} className={rec.appliedChip} title={chip}>
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        {selectedCount > 0 && (
          <div className={rec.batchActions} role="status">
            <span className="mr-1 text-xs text-[hsl(var(--records-text-muted))]">
              已选 {selectedCount}
            </span>
            {batch.mode === 'list' ? (
              <>
                {batch.onExport && (
                  <Button type="button" size="sm" variant="outline" onClick={batch.onExport}>
                    批量导出
                  </Button>
                )}
                {batch.onArchive && (
                  <Button type="button" size="sm" variant="outline" onClick={batch.onArchive}>
                    批量归档
                  </Button>
                )}
                {batch.onDelete && (
                  <Button type="button" size="sm" variant="destructive" onClick={batch.onDelete}>
                    批量删除
                  </Button>
                )}
                {batch.onSelectAllMatching && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="hidden text-xs xl:inline-flex"
                    onClick={batch.onSelectAllMatching}
                  >
                    全选符合条件
                  </Button>
                )}
              </>
            ) : (
              <>
                {batch.onRestore && (
                  <Button type="button" size="sm" variant="outline" onClick={batch.onRestore}>
                    批量恢复
                  </Button>
                )}
                {batch.onHardDelete && (
                  <Button type="button" size="sm" variant="destructive" onClick={batch.onHardDelete}>
                    永久删除
                  </Button>
                )}
              </>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={batch.onClear}>
              取消选择
            </Button>
          </div>
        )}
        <label
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs text-[hsl(var(--records-text-secondary))]',
            'hover:bg-[hsl(var(--records-icon-button-hover-bg))]',
          )}
        >
          <input
            type="checkbox"
            className="rounded border-[hsl(var(--records-input-border))]"
            checked={listLength > 0 && allPageSelected}
            disabled={listLength === 0}
            onChange={onSelectAllPage}
          />
          全选本页
        </label>
      </div>
    </div>
  )
}
