/**
 * UploadStatsBar —— 顶部统计信息栏
 * 展示总数、上传中、已解析、失败数量，以及全部清空按钮
 */

import { Loader2, CheckCircle2, AlertCircle, Files, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import type { UploadStats } from '@/types/upload'

interface UploadStatsBarProps {
  stats: UploadStats
  onClearAll: () => void
  onClearDone: () => void
}

export default function UploadStatsBar({ stats, onClearAll, onClearDone }: UploadStatsBarProps) {
  const items = [
    {
      label: '全部',
      value: stats.total,
      icon: <Files className="w-4 h-4" />,
      className: 'text-foreground',
    },
    {
      label: '上传中',
      value: stats.uploading,
      icon: <Loader2 className={cn('w-4 h-4', stats.uploading > 0 && 'animate-spin')} />,
      className: 'text-blue-600',
    },
    {
      label: '已解析',
      value: stats.parsed,
      icon: <CheckCircle2 className="w-4 h-4" />,
      className: 'text-green-600',
    },
    {
      label: '失败',
      value: stats.error,
      icon: <AlertCircle className="w-4 h-4" />,
      className: 'text-red-500',
    },
  ]

  if (stats.total === 0) return null

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5 bg-muted/50 rounded-lg border border-border/50">
      {/* 统计数字 */}
      <div className="flex items-center gap-4 flex-wrap">
        {items.map((item) => (
          <div key={item.label} className={cn('flex items-center gap-1.5 text-sm', item.className)}>
            {item.icon}
            <span className="font-semibold">{item.value}</span>
            <span className="text-muted-foreground text-xs">{item.label}</span>
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        {stats.parsed > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={onClearDone}
          >
            清除已完成
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1"
          onClick={onClearAll}
        >
          <Trash2 className="w-3.5 h-3.5" />
          全部清除
        </Button>
      </div>
    </div>
  )
}
