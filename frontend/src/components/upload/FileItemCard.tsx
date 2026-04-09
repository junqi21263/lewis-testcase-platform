/**
 * FileItemCard —— 单个文件的上传进度卡片
 *
 * 展示：文件图标、名称、大小、状态徽标、进度条、操作按钮
 * 支持操作：暂停、继续、重试、取消/删除
 */

import { memo } from 'react'
import {
  FileText, FileSpreadsheet, FileImage, File, FileCode,
  Pause, Play, RotateCcw, X,
  CheckCircle2, AlertCircle, Loader2, Clock,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import type { UploadTask } from '@/types/upload'

/** 根据文件扩展名返回对应图标 */
function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const props = { className: cn('w-5 h-5', className) }

  if (['doc', 'docx', 'pdf', 'txt', 'md'].includes(ext)) return <FileText {...props} />
  if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet {...props} />
  if (['png', 'jpg', 'jpeg'].includes(ext)) return <FileImage {...props} />
  if (['json', 'yaml', 'yml'].includes(ext)) return <FileCode {...props} />
  return <File {...props} />
}

/** 格式化字节数为可读大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 状态标签配置 */
const STATUS_CONFIG: Record<
  UploadTask['status'],
  { label: string; icon: React.ReactNode; className: string }
> = {
  idle:      { label: '等待中',  icon: <Clock className="w-3 h-3" />,                    className: 'text-muted-foreground bg-muted' },
  uploading: { label: '上传中',  icon: <Loader2 className="w-3 h-3 animate-spin" />,     className: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
  paused:    { label: '已暂停',  icon: <Pause className="w-3 h-3" />,                    className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  parsing:   { label: 'AI解析中', icon: <Loader2 className="w-3 h-3 animate-spin" />,   className: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
  parsed:    { label: '解析完成', icon: <CheckCircle2 className="w-3 h-3" />,            className: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
  error:     { label: '失败',    icon: <AlertCircle className="w-3 h-3" />,              className: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
}

/** 进度条颜色 */
function progressBarClass(status: UploadTask['status']): string {
  const map: Partial<Record<UploadTask['status'], string>> = {
    uploading: 'bg-blue-500',
    parsing:   'bg-purple-500',
    parsed:    'bg-green-500',
    paused:    'bg-amber-500',
    error:     'bg-red-500',
  }
  return map[status] ?? 'bg-muted-foreground/30'
}

interface FileItemCardProps {
  task: UploadTask
  onPause:  (task: UploadTask) => void
  onResume: (task: UploadTask) => void
  onRetry:  (task: UploadTask) => void
  onCancel: (task: UploadTask) => void
  /** 点击「查看解析结果」 */
  onViewResult: (task: UploadTask) => void
}

const FileItemCard = memo(function FileItemCard({
  task, onPause, onResume, onRetry, onCancel, onViewResult,
}: FileItemCardProps) {
  const { file, status, progress, errorMessage, sensitiveMatches } = task
  const cfg = STATUS_CONFIG[status]
  const isActive = status === 'uploading' || status === 'parsing'
  const hasSensitive = sensitiveMatches.length > 0

  return (
    <div
      className={cn(
        'group flex items-start gap-3 p-3.5 rounded-lg border transition-all duration-200',
        'bg-card hover:shadow-sm',
        status === 'error'  && 'border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10',
        status === 'parsed' && 'border-green-200 dark:border-green-800/50',
        status === 'paused' && 'border-amber-200 dark:border-amber-800/50',
        !['error', 'parsed', 'paused'].includes(status) && 'border-border',
      )}
    >
      {/* 文件图标 */}
      <div className={cn(
        'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
        status === 'parsed' ? 'bg-green-100 dark:bg-green-950/40 text-green-600'
          : status === 'error' ? 'bg-red-100 dark:bg-red-950/40 text-red-500'
          : 'bg-muted text-muted-foreground',
      )}>
        <FileIcon name={file.name} />
      </div>

      {/* 主体内容 */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 文件名 + 大小 */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate max-w-[240px]" title={file.name}>
            {file.name}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{formatSize(file.size)}</span>

          {/* 状态徽标 */}
          <span className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0',
            cfg.className,
          )}>
            {cfg.icon}
            {cfg.label}
          </span>

          {/* 敏感信息徽标 */}
          {hasSensitive && status === 'parsed' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-orange-600 bg-orange-50 dark:bg-orange-950/30 flex-shrink-0">
              <ShieldAlert className="w-3 h-3" />
              {sensitiveMatches.length} 处敏感信息已脱敏
            </span>
          )}
        </div>

        {/* 进度条 */}
        {(isActive || status === 'paused') && (
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                progressBarClass(status),
                isActive && 'animate-pulse',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* 上传进度百分比 */}
        {status === 'uploading' && (
          <p className="text-xs text-muted-foreground">{progress}% 已上传</p>
        )}

        {/* 解析中提示 */}
        {status === 'parsing' && (
          <p className="text-xs text-purple-600 animate-pulse">
            正在解析文件内容，请稍候...
          </p>
        )}

        {/* 错误信息 */}
        {status === 'error' && errorMessage && (
          <p className="text-xs text-red-600">{errorMessage}</p>
        )}

        {/* 已解析：快速操作 */}
        {status === 'parsed' && (
          <button
            onClick={() => onViewResult(task)}
            className="text-xs text-primary hover:underline font-medium"
          >
            查看解析结果 →
          </button>
        )}
      </div>

      {/* 操作按钮组 */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        {status === 'uploading' && (
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
            title="暂停"
            onClick={(e) => { e.stopPropagation(); onPause(task) }}
          >
            <Pause className="w-3.5 h-3.5" />
          </Button>
        )}
        {status === 'paused' && (
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            title="继续上传"
            onClick={(e) => { e.stopPropagation(); onResume(task) }}
          >
            <Play className="w-3.5 h-3.5" />
          </Button>
        )}
        {status === 'error' && (
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            title="重试"
            onClick={(e) => { e.stopPropagation(); onRetry(task) }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={status === 'parsed' ? '删除' : '取消'}
          onClick={(e) => { e.stopPropagation(); onCancel(task) }}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
})

export default FileItemCard
