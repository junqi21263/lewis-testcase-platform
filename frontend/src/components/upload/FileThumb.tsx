import { useEffect, useState, memo } from 'react'
import { FileText, FileSpreadsheet, FileImage, File, FileCode } from 'lucide-react'
import { cn } from '@/utils/cn'

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function FallbackIcon({ name, className }: { name: string; className?: string }) {
  const ext = extOf(name)
  const props = { className: cn('w-6 h-6', className) }
  if (['doc', 'docx', 'pdf', 'txt', 'md'].includes(ext)) return <FileText {...props} />
  if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet {...props} />
  if (['png', 'jpg', 'jpeg'].includes(ext)) return <FileImage {...props} />
  if (['json', 'yaml', 'yml'].includes(ext)) return <FileCode {...props} />
  return <File {...props} />
}

interface FileThumbProps {
  file: File
  className?: string
}

/** 图片缩略图；PDF/Office 用色块 + 图标 */
export const FileThumb = memo(function FileThumb({ file, className }: FileThumbProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file.type.startsWith('image/')) {
      setObjectUrl(null)
      return
    }
    const u = URL.createObjectURL(file)
    setObjectUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const ext = extOf(file.name)
  const isPdf = file.type.includes('pdf') || ext === 'pdf'

  if (objectUrl) {
    return (
      <div className={cn('relative overflow-hidden rounded-lg border-0 bg-muted/70 shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-sm dark:ring-white/10', className)}>
        <img src={objectUrl} alt="" className="h-full w-full object-cover" />
      </div>
    )
  }

  if (isPdf) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400',
          className,
        )}
      >
        <FileText className="w-7 h-7" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-lg border-0 bg-muted/80 text-muted-foreground shadow-sm ring-1 ring-inset ring-foreground/10 backdrop-blur-sm dark:ring-white/10',
        className,
      )}
    >
      <FallbackIcon name={file.name} />
    </div>
  )
})
