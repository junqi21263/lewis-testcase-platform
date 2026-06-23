import * as Dialog from '@radix-ui/react-dialog'
import { Download, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { cn } from '@/utils/cn'
import {
  downloadBlobFile,
  downloadTextFile,
  prepareMermaidSvgForDownload,
  svgToPngBlob,
} from '@/utils/mermaidRender'

type Props = {
  open: boolean
  svg: string | null
  title?: string
  onClose: () => void
}

export function MermaidChartModal({ open, svg, title = '流程图', onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const downloadSvg = () => {
    if (!svg) return
    downloadTextFile(prepareMermaidSvgForDownload(svg), `${title}.svg`, 'image/svg+xml')
    toast.success('已下载 SVG')
  }

  const downloadPng = async () => {
    if (!svg) return
    try {
      const blob = await svgToPngBlob(svg)
      downloadBlobFile(blob, `${title}.png`)
      toast.success('已下载 PNG')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-confirm-dialog-overlay fixed inset-0 z-[150] motion-reduce:!animate-none" />
        <Dialog.Content
          aria-modal
          role="dialog"
          className="ui-confirm-dialog-layer fixed inset-0 z-[151] outline-none motion-reduce:!animate-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            closeRef.current?.focus()
          }}
          onEscapeKeyDown={onClose}
        >
          <div
            className={cn(
              'pointer-events-auto mx-auto flex max-h-[calc(100dvh-48px)] w-full max-w-[min(96vw,1200px)] flex-col overflow-hidden rounded-[22px] border',
              'border-[color:var(--ui-report-border)] bg-[color:var(--ui-modal-bg)] shadow-[var(--ui-modal-shadow)]',
              'animate-[ui-template-modal-in_0.24s_ease-out_both]',
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--ui-report-border)] px-5 py-4">
              <Dialog.Title className="text-lg font-bold text-[color:var(--ui-modal-title)]">
                {title}
              </Dialog.Title>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--ui-report-border)] px-3 text-sm hover:bg-[color:var(--ui-report-surface)]"
                  onClick={() => void downloadPng()}
                  disabled={!svg}
                >
                  <Download className="h-4 w-4" />
                  PNG
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color:var(--ui-report-border)] px-3 text-sm hover:bg-[color:var(--ui-report-surface)]"
                  onClick={downloadSvg}
                  disabled={!svg}
                >
                  <Download className="h-4 w-4" />
                  SVG
                </button>
                <button
                  ref={closeRef}
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[color:var(--ui-report-surface)]"
                  onClick={onClose}
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-5 [scrollbar-gutter:stable]">
              {svg ? (
                <div
                  className="mx-auto max-w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ) : (
                <p className="py-12 text-center text-sm text-[color:var(--ui-report-text-muted)]">
                  暂无流程图
                </p>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
