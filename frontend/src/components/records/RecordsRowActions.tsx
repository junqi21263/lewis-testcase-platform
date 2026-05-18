import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react'
import type { GenerationRecord } from '@/types'
import { rec } from '@/utils/recordsUi'
import { cn } from '@/utils/cn'

function IconAction(props: {
  title: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      className={cn(rec.iconBtn, props.danger && rec.iconBtnDanger)}
      onClick={(e) => {
        e.stopPropagation()
        props.onClick()
      }}
    >
      {props.children}
    </button>
  )
}

export function RecordsRowActions(props: {
  record: GenerationRecord
  inRecycle: boolean
  loading: boolean
  onView: () => void
  onReuse: () => void
  onExport: () => void
  onShare: () => void
  onArchive: () => void
  onUnarchive: () => void
  onRestore: () => void
  onSoftDelete: () => void
  onHardDelete: () => void
}) {
  const {
    record: r,
    inRecycle,
    loading,
    onView,
    onReuse,
    onExport,
    onShare,
    onArchive,
    onUnarchive,
    onRestore,
    onSoftDelete,
    onHardDelete,
  } = props

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  if (loading) {
    return <Loader2 className="mx-auto h-4 w-4 animate-spin text-workspace-text-muted" />
  }

  const iconClass = 'h-4 w-4'

  return (
    <div
      className="flex w-[120px] shrink-0 items-center justify-end gap-0.5 opacity-80 transition-opacity duration-200 group-hover/row:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <IconAction title="查看详情" onClick={onView}>
        <Eye className={iconClass} />
      </IconAction>
      {!inRecycle && (
        <>
          <IconAction title="一键复用" onClick={onReuse}>
            <Copy className={iconClass} />
          </IconAction>
          <IconAction title="导出 JSON" onClick={onExport}>
            <Download className={iconClass} />
          </IconAction>
        </>
      )}
      <div className="relative" ref={menuRef}>
        <IconAction title="更多操作" onClick={() => setMenuOpen((v) => !v)}>
          <MoreHorizontal className={iconClass} />
        </IconAction>
        {menuOpen && (
          <div
            className="absolute right-0 top-full z-50 mt-1 min-w-[9.5rem] rounded-xl border border-workspace-panel-border/70 bg-workspace-panel/98 py-1 text-xs shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-workspace-panel/95"
            role="menu"
          >
            {!inRecycle && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-workspace-panel-muted/80"
                  onClick={() => {
                    setMenuOpen(false)
                    onReuse()
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> 编辑（带入生成页）
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-workspace-panel-muted/80"
                  onClick={() => {
                    setMenuOpen(false)
                    onShare()
                  }}
                >
                  <Share2 className="h-3.5 w-3.5" /> 分享链接
                </button>
                {r.status !== 'ARCHIVED' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-workspace-panel-muted/80"
                    onClick={() => {
                      setMenuOpen(false)
                      onArchive()
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" /> 归档
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-workspace-panel-muted/80"
                    onClick={() => {
                      setMenuOpen(false)
                      onUnarchive()
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> 取消归档
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setMenuOpen(false)
                    onSoftDelete()
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </>
            )}
            {inRecycle && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-workspace-panel-muted/80"
                  onClick={() => {
                    setMenuOpen(false)
                    onRestore()
                  }}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" /> 恢复
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setMenuOpen(false)
                    onHardDelete()
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 永久删除
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
