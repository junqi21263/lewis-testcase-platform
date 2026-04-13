import { CheckCircle } from 'lucide-react'

interface SuccessMessageProps {
  message: string
  className?: string
}

export function SuccessMessage({ message, className = '' }: SuccessMessageProps) {
  return (
    <div className={`bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-md ${className}`}>
      <div className="flex items-center">
        <CheckCircle className="h-5 w-5 mr-2 shrink-0" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  )
}
