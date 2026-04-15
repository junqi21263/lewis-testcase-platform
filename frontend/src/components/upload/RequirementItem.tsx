/**
 * RequirementItem —— 单条需求点的展示 + 内联编辑
 *
 * 特性：
 * - 双击或点击编辑按钮进入编辑模式
 * - 保存时记录 edited=true，显示"已修改"徽标
 * - 支持撤销（恢复 originalContent）
 */

import { useState, useRef, useEffect, memo } from 'react'
import { Pencil, Check, X, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { RequirementPoint } from '@/types/upload'

interface RequirementItemProps {
  point: RequirementPoint
  index: number
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
  onToggleSelected?: (id: string, selected: boolean) => void
  onMoveUp?: (id: string) => void
  onMoveDown?: (id: string) => void
  disableMoveUp?: boolean
  disableMoveDown?: boolean
}

const RequirementItem = memo(function RequirementItem({
  point,
  index,
  onUpdate,
  onDelete,
  onToggleSelected,
  onMoveUp,
  onMoveDown,
  disableMoveUp,
  disableMoveDown,
}: RequirementItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(point.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 进入编辑模式时自动聚焦
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [editing])

  const handleSave = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== point.content) {
      onUpdate(point.id, trimmed)
    }
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft(point.content)
    setEditing(false)
  }

  const handleRevert = () => {
    onUpdate(point.id, point.originalContent)
    setDraft(point.originalContent)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') handleCancel()
    if (e.altKey && e.key === 'ArrowUp' && onMoveUp) {
      e.preventDefault()
      onMoveUp(point.id)
    }
    if (e.altKey && e.key === 'ArrowDown' && onMoveDown) {
      e.preventDefault()
      onMoveDown(point.id)
    }
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-colors',
        editing
          ? 'bg-primary/5 border border-primary/30'
          : 'hover:bg-muted/60 border border-transparent',
      )}
    >
      {onToggleSelected && (
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
          checked={point.selected}
          onChange={(e) => onToggleSelected(point.id, e.target.checked)}
          title="带入生成页时包含此项"
        />
      )}
      {/* 序号 */}
      <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded text-xs font-bold flex items-center justify-center bg-muted text-muted-foreground">
        {index + 1}
      </span>

      {/* 内容区 */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="w-full text-sm bg-transparent resize-none outline-none border-none p-0 leading-relaxed text-foreground"
          />
        ) : (
          <p
            className="text-sm text-foreground leading-relaxed break-words cursor-text"
            onDoubleClick={() => setEditing(true)}
            title="双击编辑"
          >
            {point.content}
          </p>
        )}

        {/* 已修改标签 */}
        {!editing && point.edited && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
              已修改
            </span>
            <button
              onClick={handleRevert}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              title="撤销修改"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              撤销
            </button>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className={cn(
        'flex items-center gap-0.5 flex-shrink-0 transition-opacity',
        editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}>
        {editing ? (
          <>
            <button
              onClick={handleSave}
              className="w-6 h-6 flex items-center justify-center rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors"
              title="保存 (Enter)"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleCancel}
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
              title="取消 (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            {onMoveUp && (
              <button
                type="button"
                disabled={disableMoveUp}
                onClick={() => onMoveUp(point.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                title="上移 (Alt+↑)"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
            )}
            {onMoveDown && (
              <button
                type="button"
                disabled={disableMoveDown}
                onClick={() => onMoveDown(point.id)}
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30"
                title="下移 (Alt+↓)"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="编辑"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={() => onDelete(point.id)}
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="删除此需求点"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
})

export default RequirementItem
