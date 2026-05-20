import * as Dialog from '@radix-ui/react-dialog'
import * as React from 'react'
import { Copy, Pencil, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PromptTemplate } from '@/types'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import { templateCategoryBadgeClass, templateCategoryLabels, tpl } from '@/utils/templatesUi'

export function TemplateDetailModal(props: {
  template: PromptTemplate | null
  canEdit: boolean
  onClose: () => void
  onCopy: (text: string) => void
  onGenerate: (tpl: PromptTemplate) => void
  onEdit: (tpl: PromptTemplate) => void
}) {
  const { template, canEdit, onClose, onCopy, onGenerate, onEdit } = props
  const open = !!template

  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!template) return null

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-confirm-dialog-overlay fixed inset-0 z-[130] motion-reduce:!animate-none" />
        <Dialog.Content
          aria-modal
          role="dialog"
          className="ui-confirm-dialog-layer fixed inset-0 z-[131] outline-none motion-reduce:!animate-none"
          onCloseAutoFocus={(ev) => ev.preventDefault()}
        >
          <div className="ui-template-form-panel ui-template-detail-panel pointer-events-auto">
            <header className="ui-template-form-panel__header flex shrink-0 flex-col gap-3 border-b border-[hsl(var(--templates-panel-border))] px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <Dialog.Title
                  className="text-lg font-bold tracking-tight"
                  style={{ color: 'var(--ui-modal-title)' }}
                >
                  {template.name}
                </Dialog.Title>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={templateCategoryBadgeClass(template.category)}>
                    {templateCategoryLabels[template.category]}
                  </span>
                  <span className="text-xs text-[hsl(var(--templates-text-muted))]">
                    使用 {template.usageCount} 次 · 更新{' '}
                    {formatDate(template.updatedAt, 'yyyy-MM-dd HH:mm')}
                  </span>
                </div>
                {template.description && (
                  <p className="mt-2 text-sm text-[hsl(var(--templates-text-secondary))]">
                    {template.description}
                  </p>
                )}
              </div>
              <button type="button" className={tpl.iconBtn} onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>

            <Dialog.Description className="sr-only">模板详情与完整提示词</Dialog.Description>

            <div className="ui-template-form-panel__body templates-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <pre
                className={cn(
                  tpl.preview,
                  'm-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] p-4 text-[0.8125rem] leading-relaxed',
                )}
              >
                {template.content}
              </pre>
            </div>

            <footer className="ui-template-form-panel__footer flex shrink-0 flex-wrap justify-end gap-2 border-t border-[hsl(var(--templates-panel-border))] px-6 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5 rounded-xl"
                onClick={() => onCopy(template.content)}
              >
                <Copy className="h-4 w-4" />
                复制全文
              </Button>
              <Button
                type="button"
                className="h-10 gap-1.5 rounded-xl"
                onClick={() => onGenerate(template)}
              >
                <Wand2 className="h-4 w-4" />
                去生成
              </Button>
              {canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 gap-1.5 rounded-xl"
                  onClick={() => onEdit(template)}
                >
                  <Pencil className="h-4 w-4" />
                  编辑
                </Button>
              )}
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
