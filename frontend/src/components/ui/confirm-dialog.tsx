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
  /** confirm：约 480px；form：约 680px */
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

  const maxW =
    size === 'form'
      ? 'max-w-[min(calc(100vw-32px),680px)]'
      : 'max-w-[min(calc(100vw-32px),480px)]'

  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(next) => {
        if (!next) {
          if (closedByConfirmRef.current) {
            closedByConfirmRef.current = false
            return
          }
          props.onCancel()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-[140] motion-reduce:!animate-none',
            props.overlayClassName,
          )}
          style={{
            background: 'var(--ui-modal-overlay-bg)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            animation: 'ui-modal-overlay-in 0.2s ease-out both',
          }}
        />
        <Dialog.Content
          aria-modal
          role="dialog"
          className={cn(
            'fixed left-1/2 top-1/2 z-[141] w-full -translate-x-1/2 -translate-y-1/2 rounded-[22px] p-6 outline-none',
            'motion-reduce:!animate-none focus-visible:outline-none',
            maxW,
            props.contentClassName,
          )}
          style={{
            background: 'var(--ui-modal-bg)',
            border: '1px solid var(--ui-modal-border)',
            boxShadow: 'var(--ui-modal-shadow)',
            animation: 'ui-modal-content-in 0.22s ease-out both',
          }}
          onOpenAutoFocus={(e) => {
            if (destructive) {
              e.preventDefault()
              cancelRef.current?.focus()
            } else {
              e.preventDefault()
              confirmRef.current?.focus()
            }
          }}
          onCloseAutoFocus={(ev) => ev.preventDefault()}
        >
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
