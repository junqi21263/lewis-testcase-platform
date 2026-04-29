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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55">
      <div className="w-full max-w-md space-y-4 rounded-lg bg-[color:var(--glass-bg)] p-5 shadow-[0_30px_80px_-48px_rgba(0,0,0,0.75)] ring-1 ring-inset ring-[color:var(--glass-border)] backdrop-blur-[var(--glass-blur)]">
        <h3 className="font-semibold text-[17px] leading-6 tracking-tight">{props.title}</h3>
        {props.description ? (
          <div className="text-[13px] leading-5 text-muted-foreground">{props.description}</div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={props.onCancel} className="min-w-20">
            {props.cancelText ?? '取消'}
          </Button>
          <Button
            variant={props.confirmVariant ?? 'default'}
            onClick={() => void props.onConfirm()}
            className="min-w-20"
          >
            {props.confirmText ?? '确认'}
          </Button>
        </div>
      </div>
    </div>
  )
}

