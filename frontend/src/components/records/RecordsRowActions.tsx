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
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      className={rec.iconBtn}
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
    return (
      <Loader2 className="mx-auto h-4 w-4 animate-spin text-[color:var(--records-icon-muted)]" />
    )
  }

  const iconClass = 'h-4 w-4'

  return (
    <div
      className="flex w-[150px] shrink-0 items-center justify-end gap-2"
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
            className="absolute right-0 top-full z-50 mt-1 min-w-[9.5rem] rounded-xl border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-panel-bg))] py-1 text-xs shadow-[var(--records-panel-shadow)] backdrop-blur-xl"
            role="menu"
          >
            {!inRecycle && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--records-text-secondary))] hover:bg-[hsl(var(--records-table-row-hover-bg))]"
                  onClick={() => {
                    setMenuOpen(false)
                    onReuse()
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 text-[color:var(--records-icon-muted)]" /> 编辑（带入生成页）
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--records-text-secondary))] hover:bg-[hsl(var(--records-table-row-hover-bg))]"
                  onClick={() => {
                    setMenuOpen(false)
                    onShare()
                  }}
                >
                  <Share2 className="h-3.5 w-3.5 text-[color:var(--records-icon-muted)]" /> 分享链接
                </button>
                {r.status !== 'ARCHIVED' ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--records-text-secondary))] hover:bg-[hsl(var(--records-table-row-hover-bg))]"
                    onClick={() => {
                      setMenuOpen(false)
                      onArchive()
                    }}
                  >
                    <Archive className="h-3.5 w-3.5 text-[color:var(--records-icon-muted)]" /> 归档
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--records-text-secondary))] hover:bg-[hsl(var(--records-table-row-hover-bg))]"
                    onClick={() => {
                      setMenuOpen(false)
                      onUnarchive()
                    }}
                  >
                    <ArchiveRestore className="h-3.5 w-3.5 text-[color:var(--records-icon-muted)]" /> 取消归档
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[rgba(244,63,94,0.12)] hover:text-[color:var(--records-icon-danger)]',
                  )}
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[hsl(var(--records-text-secondary))] hover:bg-[hsl(var(--records-table-row-hover-bg))]"
                  onClick={() => {
                    setMenuOpen(false)
                    onRestore()
                  }}
                >
                  <ArchiveRestore className="h-3.5 w-3.5 text-[color:var(--records-icon-muted)]" /> 恢复
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[rgba(244,63,94,0.12)] hover:text-[color:var(--records-icon-danger)]',
                  )}
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
