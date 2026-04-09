/**
 * DropZone —— 拖拽 / 点击 上传区域
 *
 * 视觉状态：
 *   - 默认：虚线边框 + 引导文案
 *   - dragover：蓝色高亮边框 + 动态提示
 *   - disabled：灰色半透明
 */

import { useCallback, useRef, useState } from 'react'
import { Upload, FolderOpen, FileType } from 'lucide-react'
import { cn } from '@/utils/cn'

const ACCEPT_EXTENSIONS =
  '.doc,.docx,.pdf,.txt,.md,.xlsx,.json,.yaml,.yml,.png,.jpg,.jpeg'

const FORMAT_TAGS = [
  'DOC', 'DOCX', 'PDF', 'TXT', 'MD', 'XLSX', 'JSON', 'YAML', 'PNG', 'JPG',
]

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  /** 当前已添加的文件数量（用于提示） */
  fileCount?: number
}

export default function DropZone({ onFilesSelected, disabled, fileCount = 0 }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // 仅在离开容器本身时取消高亮（子元素触发的 leave 忽略）
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
      // 重置 input，以便同一文件可再次选择
      e.target.value = ''
    },
    [onFilesSelected],
  )

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="文件上传区域，点击或拖入文件"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && !disabled && fileInputRef.current?.click()}
      className={cn(
        // 基础样式
        'relative flex flex-col items-center justify-center gap-4',
        'min-h-[220px] w-full rounded-xl border-2 border-dashed',
        'transition-all duration-200 cursor-pointer select-none',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // 默认
        !isDragging && !disabled && 'border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5',
        // 拖拽高亮
        isDragging && 'border-primary bg-primary/10 scale-[1.01] shadow-md',
        // 禁用
        disabled && 'border-border/40 bg-muted/10 opacity-60 cursor-not-allowed',
      )}
    >
      {/* 隐藏的 file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_EXTENSIONS}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />

      {/* 图标区 */}
      <div className={cn(
        'flex items-center justify-center w-16 h-16 rounded-full transition-all duration-200',
        isDragging ? 'bg-primary/20 text-primary scale-110' : 'bg-muted text-muted-foreground',
      )}>
        {isDragging
          ? <FolderOpen className="w-8 h-8 animate-bounce" />
          : <Upload className="w-8 h-8" />
        }
      </div>

      {/* 文案区 */}
      <div className="text-center space-y-1 px-4">
        <p className="text-base font-semibold text-foreground">
          {isDragging ? '松开即可上传' : '拖拽文件到此处'}
        </p>
        <p className="text-sm text-muted-foreground">
          或{' '}
          <span className="text-primary font-medium hover:underline">点击选择文件</span>
          {' '}进行批量上传
        </p>
        {fileCount > 0 && (
          <p className="text-xs text-muted-foreground/70">
            已添加 {fileCount} 个文件
          </p>
        )}
      </div>

      {/* 支持格式标签云 */}
      <div className="flex flex-wrap justify-center gap-1.5 px-6 max-w-sm">
        {FORMAT_TAGS.map((fmt) => (
          <span
            key={fmt}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium',
              'bg-background border border-border text-muted-foreground',
              'transition-colors',
              isDragging && 'border-primary/30 text-primary/70',
            )}
          >
            <FileType className="w-2.5 h-2.5" />
            {fmt}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground/60 pb-1">
        单文件最大 100 MB · 大文件自动分片上传
      </p>
    </div>
  )
}
