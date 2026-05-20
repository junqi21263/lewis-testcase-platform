import * as Dialog from '@radix-ui/react-dialog'
import * as React from 'react'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'default' | 'destructive'
  size?: 'confirm' | 'form'
  overlayClassName?: string
  contentClassName?: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  const closedByConfirmRef = React.useRef(false)
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const confirmRef = React.useRef<HTMLButtonElement>(null)
  const destructive = props.confirmVariant === 'destructive'
  const size = props.size ?? 'confirm'
  const panelSizeClass = size === 'form' ? 'ui-confirm-dialog-panel--form' : 'ui-confirm-dialog-panel--confirm'

  return (
    <Dialog.Root open={props.open} onOpenChange={(next) => {
        if (!next) {
          if (closedByConfirmRef.current) { closedByConfirmRef.current = false; return }
          props.onCancel()
        }
      }}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn('ui-confirm-dialog-overlay fixed inset-0 z-[140] motion-reduce:!animate-none', props.overlayClassName)} />
        <Dialog.Content aria-modal role="dialog" className={cn('ui-confirm-dialog-layer fixed inset-0 z-[141] outline-none motion-reduce:!animate-none focus-visible:outline-none')} onOpenAutoFocus={(e) => { if (destructive) { e.preventDefault(); cancelRef.current?.focus() } else { e.preventDefault(); confirmRef.current?.focus() } }} onCloseAutoFocus={(ev) => ev.preventDefault()}>
          <div className={cn('ui-confirm-dialog-panel', panelSizeClass, props.contentClassName)}>
            <div className="flex gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background: destructive ? 'var(--ui-modal-danger-icon-bg)' : 'var(--ui-modal-icon-bg)',
                  color: destructive ? 'var(--ui-modal-danger-icon-color)' : 'var(--ui-modal-icon-color)',
                }}
                aria-hidden
              >
                {destructive ? (
                  <AlertTriangle className="h-5 w-5" strokeWidth={2} />
                ) : (
                  <Sparkles className="h-5 w-5" strokeWidth={2} />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <Dialog.Title
                  className="text-lg font-bold leading-snug tracking-tight"
                  style={{ color: 'var(--ui-modal-title)' }}
                >
                  {props.title}
                </Dialog.Title>
                {props.description ? (
                  <Dialog.Description
                    id="confirm-dialog-desc"
                    className="text-[0.9375rem] leading-[1.6]"
                    style={{ color: 'var(--ui-modal-description)' }}
                  >
                    {props.description}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">
                    请确认是否继续该操作。
                  </Dialog.Description>
                )}
                <div className="flex flex-wrap justify-end gap-3 pt-1">
                  <Button ref={cancelRef} type="button" variant="outline" onClick={() => props.onCancel()}>
                    {props.cancelText ?? '取消'}
                  </Button>
                  <Button
                    ref={confirmRef}
                    type="button"
                    variant={props.confirmVariant ?? 'default'}
                    onClick={() => {
                      closedByConfirmRef.current = true
                      void props.onConfirm()
                    }}
                  >
                    {props.confirmText ?? '确认'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
