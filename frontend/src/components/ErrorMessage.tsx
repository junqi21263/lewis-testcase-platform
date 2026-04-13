import { AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'

interface ErrorMessageProps {
  message: string
  title?: string
  className?: string
}

export function ErrorMessage({ message, title = '错误', className = '' }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative w-full rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive',
        className,
      )}
    >
      <div className="flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">{title}</div>
          <p className="text-sm opacity-90">{message}</p>
        </div>
      </div>
    </div>
  )
}
