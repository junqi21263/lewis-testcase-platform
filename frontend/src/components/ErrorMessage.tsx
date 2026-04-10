import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ExclamationTriangleIcon } from '@radix-ui/react-alert-dialog'

interface ErrorMessageProps {
  message: string
  title?: string
  className?: string
}

export function ErrorMessage({ message, title = '错误', className = '' }: ErrorMessageProps) {
  return (
    <Alert variant="destructive" className={className}>
      <ExclamationTriangleIcon className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}