/**
 * DropZone —— 拖拽上传：hover 高亮、进行中叠加进度与格式标签动效
 */

import { useCallback, useRef, useState } from 'react'
import { Upload, FolderOpen, FileType, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'

const ACCEPT_EXTENSIONS =
  '.doc,.docx,.pdf,.txt,.md,.xlsx,.json,.yaml,.yml,.png,.jpg,.jpeg'

const FORMAT_TAGS = [
  'DOC', 'DOCX', 'PDF', 'TXT', 'MD', 'XLSX', 'JSON', 'YAML', 'PNG', 'JPG',
]

export interface DropZoneActiveTransfer {
  fileName: string
  progress: number
  phase: 'uploading' | 'parsing'
}

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  fileCount?: number
  /** 当前队列正在传输的文件（用于上传区叠加提示） */
  activeTransfer?: DropZoneActiveTransfer | null
}

export default function DropZone({
  onFilesSelected,
  disabled,
  fileCount = 0,
  activeTransfer = null,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!disabled) setIsDragging(true)
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (disabled) return
      const files = Array.from(e.dataTransfer.files)
      if (files.length) onFilesSelected(files)
    },
    [disabled, onFilesSelected],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      if (files.length) onFilesSelected(files)
      e.target.value = ''
    },
    [onFilesSelected],
  )

  const busy = !!activeTransfer && !disabled

  return (
    <div className="relative w-full min-w-0">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="文件上传区域，点击或拖入文件"
        aria-busy={busy}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && fileInputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-4',
          'min-h-[220px] w-full rounded-xl border-2 border-dashed',
          'transition-all duration-200 cursor-pointer select-none',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !isDragging &&
            !disabled &&
            'border-border bg-muted/30 hover:border-primary/60 hover:bg-primary/[0.07] active:scale-[0.995]',
          isDragging &&
            'border-primary shadow-lg shadow-primary/10 bg-primary/[0.12] scale-[1.01] ring-2 ring-primary/20',
          disabled && 'border-border/40 bg-muted/10 opacity-60 cursor-not-allowed',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_EXTENSIONS}
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        <div
          className={cn(
            'flex items-center justify-center w-16 h-16 rounded-full transition-all duration-200',
            isDragging ? 'bg-primary/25 text-primary scale-110' : 'bg-muted text-muted-foreground',
            busy && 'text-primary bg-primary/15',
          )}
        >
          {busy ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : isDragging ? (
            <FolderOpen className="w-8 h-8 animate-bounce" />
          ) : (
            <Upload className="w-8 h-8" />
          )}
        </div>

        <div className="text-center space-y-1 px-4">
          <p className="text-base font-semibold text-foreground">
            {isDragging ? '松开即可上传' : busy ? '正在处理文件…' : '拖拽文件到此处'}
          </p>
          <p className="text-sm text-muted-foreground">
            或{' '}
            <span className="text-primary font-medium underline-offset-4 hover:underline">点击选择文件</span>
            {' '}进行批量上传
          </p>
          {busy && activeTransfer && (
            <p className="text-xs text-primary/90 font-medium truncate max-w-[90vw] sm:max-w-md mx-auto">
              {activeTransfer.phase === 'uploading' ? '上传' : '解析'} · {activeTransfer.fileName}
            </p>
          )}
          {busy && activeTransfer && activeTransfer.phase === 'uploading' && (
            <div className="w-56 max-w-[85vw] mx-auto h-1.5 rounded-full bg-secondary overflow-hidden mt-2">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 relative overflow-hidden motion-safe:after:absolute motion-safe:after:inset-0 motion-safe:after:bg-gradient-to-r motion-safe:after:from-transparent motion-safe:after:via-white/30 motion-safe:after:to-transparent motion-safe:after:animate-[dzshimmer_1s_linear_infinite]"
                style={{ width: `${Math.min(100, activeTransfer.progress)}%` }}
              />
            </div>
          )}
          {fileCount > 0 && !busy && (
            <p className="text-xs text-muted-foreground/80">已添加 {fileCount} 个文件</p>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-1.5 px-4 sm:px-6 max-w-lg">
          {FORMAT_TAGS.map((fmt) => (
            <span
              key={fmt}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium',
                'border transition-all duration-200',
                isDragging
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'bg-background/80 border-border text-muted-foreground',
                busy && 'border-primary/30 text-primary/80',
              )}
            >
              <FileType className="w-2.5 h-2.5" />
              {fmt}
            </span>
          ))}
        </div>

        <p className="text-xs text-muted-foreground/70 pb-1">单文件最大 10 MB · 与当前服务端上传限制一致</p>
      </div>

      {busy && activeTransfer?.phase === 'parsing' && (
        <p className="mt-2 text-center text-xs text-purple-600 dark:text-purple-400 flex items-center justify-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          队列正在解析，请稍候。您仍可继续拖入新文件加入队列。
        </p>
      )}

      <style>{`
        @keyframes dzshimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
