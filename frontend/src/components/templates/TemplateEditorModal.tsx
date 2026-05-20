import * as Dialog from '@radix-ui/react-dialog'
import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TemplateCategory } from '@/types'
import { cn } from '@/utils/cn'
import { templateCategoryLabels, tpl } from '@/utils/templatesUi'

export type TemplateDraft = {
  name: string
  description: string
  category: TemplateCategory
  content: string
  isPublic: boolean
}

export function TemplateEditorModal(props: {
  open: boolean
  mode: 'create' | 'edit'
  draft: TemplateDraft
  saving: boolean
  onDraftChange: (patch: Partial<TemplateDraft>) => void
  onClose: () => void
  onSave: () => void
}) {
  const { open, mode, draft, saving, onDraftChange, onClose, onSave } = props
  const closeRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-confirm-dialog-overlay fixed inset-0 z-[140] motion-reduce:!animate-none" />
        <Dialog.Content
          aria-modal
          role="dialog"
          className="ui-confirm-dialog-layer fixed inset-0 z-[141] outline-none motion-reduce:!animate-none focus-visible:outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            closeRef.current?.focus()
          }}
          onCloseAutoFocus={(ev) => ev.preventDefault()}
          onEscapeKeyDown={onClose}
        >
          <div className="ui-template-form-panel pointer-events-auto">
            <header className="ui-template-form-panel__header flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--templates-panel-border))] px-6 py-4">
              <Dialog.Title
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--ui-modal-title)' }}
              >
                {mode === 'create' ? '新建模板' : '编辑模板'}
              </Dialog.Title>
              <button
                ref={closeRef}
                type="button"
                className={tpl.iconBtn}
                onClick={onClose}
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <Dialog.Description className="sr-only">
              {mode === 'create' ? '创建新的提示词模板' : '编辑提示词模板'}
            </Dialog.Description>

            <div className="ui-template-form-panel__body templates-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[hsl(var(--templates-text-primary))]">
                    名称
                  </label>
                  <Input
                    value={draft.name}
                    onChange={(e) => onDraftChange({ name: e.target.value })}
                    maxLength={100}
                    className={cn(tpl.control, 'h-11')}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[hsl(var(--templates-text-primary))]">
                    描述
                  </label>
                  <Input
                    value={draft.description}
                    onChange={(e) => onDraftChange({ description: e.target.value })}
                    placeholder="可选"
                    className={cn(tpl.control, 'h-11')}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[hsl(var(--templates-text-primary))]">
                    分类
                  </label>
                  <select
                    className={cn(tpl.control, 'h-11 w-full px-3')}
                    value={draft.category}
                    onChange={(e) =>
                      onDraftChange({ category: e.target.value as TemplateCategory })
                    }
                  >
                    {(Object.keys(templateCategoryLabels) as TemplateCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {templateCategoryLabels[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-[hsl(var(--templates-text-primary))]">
                      提示词内容
                    </label>
                    <span className="text-xs tabular-nums text-[hsl(var(--templates-text-muted))]">
                      {draft.content.length} 字
                    </span>
                  </div>
                  <textarea
                    className={cn(
                      tpl.control,
                      'ui-template-prompt-textarea min-h-[200px] max-h-[min(42vh,360px)] w-full resize-y px-3.5 py-3 font-mono text-sm leading-relaxed',
                    )}
                    value={draft.content}
                    onChange={(e) => onDraftChange({ content: e.target.value })}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[hsl(var(--templates-text-secondary))]">
                  <input
                    type="checkbox"
                    className="ui-template-checkbox h-4 w-4 shrink-0 rounded border-[hsl(var(--templates-input-border))] bg-[hsl(var(--templates-input-bg))] text-primary focus:ring-2 focus:ring-primary/30"
                    checked={draft.isPublic}
                    onChange={(e) => onDraftChange({ isPublic: e.target.checked })}
                  />
                  公开（团队可见）
                </label>
              </div>
            </div>

            <footer className="ui-template-form-panel__footer flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-toolbar-bg))]/50 px-6 py-4">
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={onClose}>
                取消
              </Button>
              <Button type="button" className="h-10 rounded-xl" onClick={onSave} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
