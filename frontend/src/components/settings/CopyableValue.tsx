import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  value: string
  className?: string
}

export function CopyableValue({ value, className }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('已复制')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error('复制失败')
    }
  }

  return (
    <div className={cn('group/copy relative min-w-0', className)}>
      <code className={set.infoValue}>{value}</code>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          set.iconBtn,
          'absolute right-0 top-0 opacity-0 transition-opacity group-hover/copy:opacity-100 focus-visible:opacity-100',
        )}
        aria-label="复制"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}
