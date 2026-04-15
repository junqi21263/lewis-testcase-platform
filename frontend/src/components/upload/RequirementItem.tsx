/**
 * RequirementItem —— 单条需求：勾选置灰、hover 操作、右键菜单、快捷键配合父级
 */

import { useState, useRef, useEffect, memo, useCallback } from 'react'
import { Pencil, Check, X, RotateCcw, ChevronUp, ChevronDown, Copy, Scissors, Clipboard, Combine, Trash2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { RequirementPoint } from '@/types/upload'

export interface RequirementContextHandlers {
  onCopy: () => void
  onCut: () => void
  onPasteAfter: () => void
  onMergeWithNext: () => void
  onDelete: () => void
  canPaste: boolean
  hasNext: boolean
}

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
  context?: RequirementContextHandlers
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
  context,
}: RequirementItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(point.content)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [editing])

  useEffect(() => {
    setDraft(point.content)
  }, [point.content])

  useEffect(() => {
    if (!menuPos) return
    const close = () => setMenuPos(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menuPos])

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

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!context) return
      e.preventDefault()
      setMenuPos({ x: e.clientX, y: e.clientY })
    },
    [context],
  )

  const selected = point.selected !== false

  return (
    <div
      ref={rowRef}
      onContextMenu={onContextMenu}
      className={cn(
        'group flex items-start gap-2.5 px-3 py-2.5 rounded-md transition-all duration-150',
        'border border-transparent',
        editing
          ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20'
          : 'hover:bg-muted/60 hover:border-border/80',
        !selected && 'opacity-55 grayscale-[0.35]',
      )}
    >
      {onToggleSelected && (
        <input
          type="checkbox"
          className="mt-1.5 h-4 w-4 rounded border-border accent-primary cursor-pointer transition-transform active:scale-95"
          checked={selected}
          onChange={(e) => onToggleSelected(point.id, e.target.checked)}
          title="带入生成页时包含此项"
        />
      )}
      <span
        className={cn(
          'flex-shrink-0 w-5 h-5 mt-0.5 rounded text-xs font-bold flex items-center justify-center',
          selected ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground/60',
        )}
      >
        {index + 1}
      </span>

      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            className="w-full text-sm bg-background/50 rounded-md border border-input px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-ring leading-relaxed text-foreground"
          />
        ) : (
          <p
            className={cn(
              'text-sm leading-relaxed break-words cursor-text transition-colors',
              selected ? 'text-foreground' : 'text-muted-foreground',
            )}
            onDoubleClick={() => setEditing(true)}
            title="双击编辑"
          >
            {point.content || <span className="italic text-muted-foreground">（空条目）</span>}
          </p>
        )}

        {!editing && point.edited && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded">
              已修改
            </span>
            <button
              type="button"
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

      <div
        className={cn(
          'flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150',
          editing ? 'opacity-100' : 'opacity-0 sm:opacity-0 sm:group-hover:opacity-100',
        )}
      >
        {editing ? (
          <>
            <button
              type="button"
              onClick={handleSave}
              className="w-7 h-7 flex items-center justify-center rounded-md text-green-600 hover:bg-green-500/10 transition-colors active:scale-95"
              title="保存 (Enter)"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors active:scale-95"
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
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 active:scale-95"
                title="上移 (Alt+↑)"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            )}
            {onMoveDown && (
              <button
                type="button"
                disabled={disableMoveDown}
                onClick={() => onMoveDown(point.id)}
                className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 active:scale-95"
                title="下移 (Alt+↓)"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95"
              title="编辑"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(point.id)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-95"
              title="删除"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {menuPos && context && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1 text-sm animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
            onClick={() => {
              context.onCopy()
              setMenuPos(null)
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            复制
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left"
            onClick={() => {
              context.onCut()
              setMenuPos(null)
            }}
          >
            <Scissors className="w-3.5 h-3.5" />
            剪切
          </button>
          <button
            type="button"
            disabled={!context.canPaste}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left disabled:opacity-40"
            onClick={() => {
              context.onPasteAfter()
              setMenuPos(null)
            }}
          >
            <Clipboard className="w-3.5 h-3.5" />
            在下方粘贴
          </button>
          <button
            type="button"
            disabled={!context.hasNext}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent text-left disabled:opacity-40"
            onClick={() => {
              context.onMergeWithNext()
              setMenuPos(null)
            }}
          >
            <Combine className="w-3.5 h-3.5" />
            与下一条合并
          </button>
          <div className="h-px bg-border my-1" />
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-destructive/10 text-destructive text-left"
            onClick={() => {
              context.onDelete()
              setMenuPos(null)
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      )}
    </div>
  )
})

export default RequirementItem
