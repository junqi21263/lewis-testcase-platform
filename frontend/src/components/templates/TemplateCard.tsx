import { useState, type MouseEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Gauge,
  Pencil,
  Trash2,
  Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PromptTemplate } from '@/types'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  PREVIEW_LINE_COUNT,
  templateCategoryBadgeClass,
  templateCategoryLabels,
  tpl,
  truncatePreviewLines,
} from '@/utils/templatesUi'

export function TemplateCard(props: {
  template: PromptTemplate
  compact?: boolean
  canEdit: boolean
  onCopy: (text: string) => void
  onGenerate: (tpl: PromptTemplate) => void
  onEdit: (tpl: PromptTemplate) => void
  onDelete: (id: string) => void
  onViewDetail?: (tpl: PromptTemplate) => void
  onEvaluate?: (tpl: PromptTemplate) => void
  evaluating?: boolean
}) {
  const { template: tplData, compact, canEdit, onCopy, onGenerate, onEdit, onDelete, onViewDetail } =
    props
  const [expanded, setExpanded] = useState(false)
  const { text: previewText, truncated } = truncatePreviewLines(tplData.content, PREVIEW_LINE_COUNT)
  const showFade = truncated && !expanded

  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <article
      className={compact ? tpl.cardCompact : tpl.card}
      onClick={() => onViewDetail?.(tplData)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onViewDetail) onViewDetail(tplData)
      }}
      role={onViewDetail ? 'button' : undefined}
      tabIndex={onViewDetail ? 0 : undefined}
    >
      <div className={cn('flex min-w-0 flex-col', compact && 'sm:flex-1')}>
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold leading-snug text-[hsl(var(--templates-text-primary))]">
              {tplData.name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={templateCategoryBadgeClass(tplData.category)}>
                {templateCategoryLabels[tplData.category]}
              </span>
            </div>
          </div>
        </header>

        {tplData.description ? (
          <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-[hsl(var(--templates-text-secondary))]">
            {tplData.description}
          </p>
        ) : (
          <p className="mb-3 text-sm text-[hsl(var(--templates-text-muted))]">暂无描述</p>
        )}

        <div className={tpl.preview} onClick={stop}>
          <pre
            className={cn(
              expanded ? tpl.previewExpanded : tpl.previewInner,
              'm-0 font-inherit',
            )}
          >
            {expanded ? tplData.content : previewText}
          </pre>
          {showFade && <div className={tpl.previewFade} aria-hidden />}
        </div>

        {(truncated || expanded) && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline dark:text-cyan-300/90"
            onClick={(e) => {
              stop(e)
              setExpanded((v) => !v)
            }}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                收起预览
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                展开预览
              </>
            )}
          </button>
        )}

        <footer className="mt-auto flex flex-col gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--templates-text-muted))]">
            <span>使用 {tplData.usageCount} 次</span>
            <span className="text-[hsl(var(--templates-panel-border))]">·</span>
            <span>v{tplData.version ?? 1}</span>
            <span className="text-[hsl(var(--templates-panel-border))]">·</span>
            <span>更新 {formatDate(tplData.updatedAt, 'MM-dd HH:mm')}</span>
            {tplData.creator?.username && (
              <>
                <span className="text-[hsl(var(--templates-panel-border))]">·</span>
                <span className="truncate">{tplData.creator.username}</span>
              </>
            )}
            {!tplData.isPublic && (
              <>
                <span className="text-[hsl(var(--templates-panel-border))]">·</span>
                <span>仅自己可见</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2" onClick={stop}>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 rounded-xl px-3 text-xs shadow-sm"
              onClick={() => onGenerate(tplData)}
            >
              <Wand2 className="h-4 w-4" />
              去生成
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-[hsl(var(--templates-input-border))] bg-transparent px-3 text-xs"
              onClick={() => onCopy(tplData.content)}
            >
              <Copy className="h-4 w-4" />
              复制全文
            </Button>
            {onViewDetail && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 rounded-xl px-2.5 text-xs text-[hsl(var(--templates-text-secondary))]"
                onClick={() => onViewDetail(tplData)}
              >
                <Eye className="h-4 w-4" />
                详情
              </Button>
            )}
            {props.onEvaluate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1 rounded-xl border-[hsl(var(--templates-input-border))] bg-transparent px-2.5 text-xs"
                disabled={props.evaluating}
                onClick={() => props.onEvaluate?.(tplData)}
              >
                <Gauge className="h-4 w-4" />
                {props.evaluating ? '评测中' : '评测'}
              </Button>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                className={cn(tpl.iconBtn, !canEdit && 'opacity-40')}
                disabled={!canEdit}
                title={canEdit ? '编辑' : '仅创建者或超级管理员可编辑'}
                onClick={() => canEdit && onEdit(tplData)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn(tpl.iconBtn, tpl.iconBtnDanger, !canEdit && 'opacity-40')}
                disabled={!canEdit}
                title={canEdit ? '删除' : '仅创建者或超级管理员可删除'}
                onClick={() => canEdit && onDelete(tplData.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </footer>
      </div>
    </article>
  )
}
