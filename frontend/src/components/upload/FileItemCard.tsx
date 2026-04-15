/**
 * FileItemCard —— 上传队列卡片：缩略图、分阶段解析提示、进度条动画、hover 操作区
 */

import { memo, useEffect, useState } from 'react'
import {
  Pause,
  Play,
  RotateCcw,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ShieldAlert,
  Eye,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import type { UploadTask } from '@/types/upload'
import { FileThumb } from './FileThumb'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STATUS_CONFIG: Record<
  UploadTask['status'],
  { label: string; icon: React.ReactNode; className: string }
> = {
  idle: { label: '等待中', icon: <Clock className="w-3 h-3" />, className: 'text-muted-foreground bg-muted' },
  uploading: {
    label: '上传中',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    className: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30',
  },
  paused: {
    label: '已暂停',
    icon: <Pause className="w-3 h-3" />,
    className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30',
  },
  parsing: {
    label: '解析中',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    className: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30',
  },
  parsed: {
    label: '已解析',
    icon: <CheckCircle2 className="w-3 h-3" />,
    className: 'text-green-600 bg-green-50 dark:bg-green-950/30',
  },
  error: {
    label: '失败',
    icon: <AlertCircle className="w-3 h-3" />,
    className: 'text-red-600 bg-red-50 dark:bg-red-950/30',
  },
}

function progressBarClass(status: UploadTask['status']): string {
  const map: Partial<Record<UploadTask['status'], string>> = {
    uploading: 'bg-blue-500',
    parsing: 'bg-purple-500',
    parsed: 'bg-green-500',
    paused: 'bg-amber-500',
    error: 'bg-red-500',
  }
  return map[status] ?? 'bg-muted-foreground/30'
}

const PARSING_HINTS = [
  '正在识别文档内容…',
  '正在结构化需求…',
  '正在脱敏与校验…',
]

function useParsingHint(active: boolean): string {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = window.setInterval(() => setI((n) => (n + 1) % PARSING_HINTS.length), 2400)
    return () => clearInterval(t)
  }, [active])
  useEffect(() => {
    if (!active) setI(0)
  }, [active])
  return active ? PARSING_HINTS[i] ?? PARSING_HINTS[0] : ''
}

interface FileItemCardProps {
  task: UploadTask
  onPause: (task: UploadTask) => void
  onResume: (task: UploadTask) => void
  onRetry: (task: UploadTask) => void
  onCancel: (task: UploadTask) => void
  onViewResult: (task: UploadTask) => void
}

const FileItemCard = memo(function FileItemCard({
  task,
  onPause,
  onResume,
  onRetry,
  onCancel,
  onViewResult,
}: FileItemCardProps) {
  const { file, status, progress, errorMessage, sensitiveMatches } = task
  const cfg = STATUS_CONFIG[status]
  const isActive = status === 'uploading' || status === 'parsing'
  const hasSensitive = sensitiveMatches.length > 0
  const parseHint = useParsingHint(status === 'parsing')

  return (
    <div
      className={cn(
        'group relative flex flex-col sm:flex-row sm:items-start gap-3 p-3 sm:p-3.5 rounded-xl border transition-all duration-200 min-w-0',
        'bg-card hover:shadow-md hover:border-primary/15',
        status === 'error' && 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10',
        status === 'parsed' && 'border-green-200 dark:border-green-800/40',
        status === 'paused' && 'border-amber-200 dark:border-amber-800/50',
        !['error', 'parsed', 'paused'].includes(status) && 'border-border',
      )}
    >
      <div className="flex gap-3 min-w-0 flex-1">
        <FileThumb file={file} className="h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0" />

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-foreground truncate max-w-[min(100%,280px)]" title={file.name}>
              {file.name}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{formatSize(file.size)}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0 transition-colors',
                cfg.className,
              )}
            >
              {cfg.icon}
              {cfg.label}
            </span>
            {hasSensitive && status === 'parsed' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-orange-600 bg-orange-50 dark:bg-orange-950/30 flex-shrink-0">
                <ShieldAlert className="w-3 h-3" />
                已脱敏 {sensitiveMatches.length} 处
              </span>
            )}
          </div>

          {(isActive || status === 'paused') && (
            <div className="w-full bg-secondary/80 rounded-full h-2 overflow-hidden ring-1 ring-border/40">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300 ease-out relative overflow-hidden',
                  progressBarClass(status),
                  isActive && 'motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:bg-gradient-to-r motion-safe:after:from-transparent motion-safe:after:via-white/25 motion-safe:after:to-transparent motion-safe:after:animate-[shimmer_1.2s_ease-in-out_infinite]',
                )}
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
          )}

          {status === 'uploading' && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              已上传 <span className="tabular-nums font-medium text-foreground">{progress}%</span>
            </p>
          )}

          {status === 'parsing' && (
            <p className="text-xs text-purple-600 dark:text-purple-400 flex items-center gap-1.5 min-h-[1.25rem]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
              </span>
              <span className="transition-opacity duration-300">{parseHint}</span>
            </p>
          )}

          {status === 'error' && errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed break-words">{errorMessage}</p>
          )}

          {status === 'parsed' && (
            <button
              type="button"
              onClick={() => onViewResult(task)}
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1 transition-colors"
            >
              <Eye className="w-3 h-3" />
              查看解析结果
            </button>
          )}
        </div>
      </div>

      <div
        className={cn(
          'flex sm:flex-col items-center justify-end gap-1 flex-shrink-0',
          'opacity-100 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto',
          'transition-opacity duration-150',
        )}
      >
        {status === 'uploading' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
            title="暂停"
            onClick={(e) => {
              e.stopPropagation()
              onPause(task)
            }}
          >
            <Pause className="w-4 h-4" />
          </Button>
        )}
        {status === 'paused' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
            title="继续"
            onClick={(e) => {
              e.stopPropagation()
              onResume(task)
            }}
          >
            <Play className="w-4 h-4" />
          </Button>
        )}
        {status === 'error' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
            title="重试"
            onClick={(e) => {
              e.stopPropagation()
              onRetry(task)
            }}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={status === 'parsed' ? '移除' : '取消'}
          onClick={(e) => {
            e.stopPropagation()
            onCancel(task)
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
})

export default FileItemCard
