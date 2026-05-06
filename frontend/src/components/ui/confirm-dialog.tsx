import { Button } from '@/components/ui/button'
import { ReactNode } from 'react'

export function ConfirmDialog(props: {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  confirmVariant?: 'default' | 'destructive'
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}) {
  if (!props.open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-card/95 p-5 shadow-2xl ring-1 ring-inset ring-foreground/10 backdrop-blur-xl dark:ring-white/10">
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

