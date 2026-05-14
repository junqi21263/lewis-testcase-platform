import { Button } from '@/components/ui/button'
import { ReactNode } from 'react'
import { cn } from '@/utils/cn'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'default' | 'destructive'
  overlayClassName?: string
  contentClassName?: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  if (!props.open) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,23,42,0.42)] backdrop-blur-[3px] dark:bg-slate-950/60 dark:backdrop-blur-md',
        props.overlayClassName,
      )}
    >
      <div
        className={cn(
          'w-full max-w-md space-y-4 rounded-xl bg-white/96 p-5 text-slate-900 shadow-2xl ring-1 ring-inset ring-slate-900/8 backdrop-blur-xl dark:bg-card/95 dark:text-foreground dark:ring-white/10',
          props.contentClassName,
        )}
      >
        <h3 className="font-semibold text-lg">{props.title}</h3>
        {props.description ? (
          <div className="text-sm text-muted-foreground">{props.description}</div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={props.onCancel}>
            {props.cancelText ?? '取消'}
          </Button>
          <Button
            variant={props.confirmVariant ?? 'default'}
            onClick={() => void props.onConfirm()}
          >
            {props.confirmText ?? '确认'}
          </Button>
        </div>
      </div>
    </div>
  )
}

