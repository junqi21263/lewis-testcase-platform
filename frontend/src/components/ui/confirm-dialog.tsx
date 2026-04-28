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
      <div className="bg-card border rounded-lg shadow-lg max-w-md w-full p-5 space-y-4">
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

