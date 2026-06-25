import { Copy, Download, Maximize2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { MermaidChartModal } from '@/components/analysis/MermaidChartModal'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/utils/cn'
import {
  downloadBlobFile,
  downloadTextFile,
  friendlyMermaidErrorMessage,
  isMermaidSourceLikelyComplete,
  normalizeMermaidSource,
  prepareMermaidSvgForDownload,
  renderMermaidSvg,
  svgToPngBlob,
} from '@/utils/mermaidRender'
import { sanitizeInlineSvg } from '@/utils/safeSvg'

export type SafeMermaidRendererProps = {
  /** 原始 Mermaid 源码（来自 markdown 代码块） */
  rawSource: string
  /** 报告流式生成中为 true：未完成语法不渲染 */
  isStreaming?: boolean
}

export function SafeMermaidRenderer({
  rawSource,
  isStreaming = false,
}: SafeMermaidRendererProps) {
  const reactId = useId().replace(/:/g, '')
  const theme = useThemeStore((s) => s.theme)
  const [svg, setSvg] = useState<string | null>(null)
  const [errDetail, setErrDetail] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [debouncedSource, setDebouncedSource] = useState(rawSource)
  const [isRendering, setIsRendering] = useState(false)
  const renderGen = useRef(0)

  const normalized = useMemo(
    () => normalizeMermaidSource(rawSource.trim()),
    [rawSource],
  )
  const safeSvg = useMemo(() => sanitizeInlineSvg(svg), [svg])

  useEffect(() => {
    const delay = isStreaming ? 900 : 200
    const t = window.setTimeout(() => setDebouncedSource(rawSource), delay)
    return () => window.clearTimeout(t)
  }, [rawSource, isStreaming])

  const canAttemptRender = useMemo(() => {
    if (!debouncedSource.trim()) return false
    if (isStreaming && !isMermaidSourceLikelyComplete(debouncedSource))
      return false
    return true
  }, [debouncedSource, isStreaming])

  useEffect(() => {
    if (!canAttemptRender) {
      setIsRendering(false)
      if (!isStreaming || !debouncedSource.trim()) {
        setSvg(null)
        setErrDetail(null)
      }
      return
    }

    const gen = ++renderGen.current
    let cancelled = false

    ;(async () => {
      setIsRendering(true)
      setErrDetail(null)
      try {
        const out = await renderMermaidSvg(
          debouncedSource,
          theme,
          `mmd-${reactId}`,
        )
        if (cancelled || gen !== renderGen.current) return
        setSvg(out)
        setErrDetail(null)
      } catch (e) {
        if (cancelled || gen !== renderGen.current) return
        setSvg(null)
        setErrDetail(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled && gen === renderGen.current) {
          setIsRendering(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canAttemptRender, debouncedSource, theme, reactId, isStreaming])

  const waiting = !svg && !errDetail && (!canAttemptRender || isRendering)

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(normalized)
      toast.success('已复制 Mermaid 源码')
    } catch {
      downloadTextFile(normalized, 'flowchart.mmd', 'text/plain')
      toast.success('已下载源码文件')
    }
  }

  const downloadPng = async () => {
    if (!svg) return
    try {
      const blob = await svgToPngBlob(svg)
      downloadBlobFile(blob, 'flowchart.png')
      toast.success('已下载 PNG')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败')
    }
  }

  const downloadSvg = () => {
    if (!svg) return
    downloadTextFile(prepareMermaidSvgForDownload(svg), 'flowchart.svg', 'image/svg+xml')
    toast.success('已下载 SVG')
  }

  if (errDetail) {
    const friendly = friendlyMermaidErrorMessage(errDetail)
    return (
      <div
        role="status"
        className="my-3 min-h-[140px] max-w-full overflow-hidden rounded-xl border border-[color:var(--ui-mermaid-error-border)] bg-[color:var(--ui-mermaid-error-bg)] px-4 py-4 sm:px-5"
      >
        <p className="text-sm font-semibold text-[color:var(--ui-mermaid-error-title)]">
          流程图暂时无法渲染
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--ui-mermaid-error-desc)]">
          {friendly}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-[color:var(--ui-report-text-primary)] hover:bg-[color:var(--ui-report-border)]/35"
            onClick={() => void copySource()}
          >
            <Copy className="h-3.5 w-3.5" />
            复制源码
          </button>
        </div>
        <details className="mt-3 group/mmd-src">
          <summary className="cursor-pointer list-none text-xs font-medium text-[color:var(--ui-report-text-muted)] marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-[color:var(--ui-report-border)]/30">
              查看原始 Mermaid 源码
            </span>
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-[color:var(--ui-mermaid-code-border)] bg-[color:var(--ui-mermaid-code-bg)] p-3 font-mono text-[11px] leading-relaxed text-[color:var(--ui-mermaid-code-text)] whitespace-pre-wrap break-words">
            {normalized}
          </pre>
        </details>
      </div>
    )
  }

  if (waiting) {
    return (
      <div className="my-3 flex min-h-[180px] max-w-full items-center justify-center overflow-hidden rounded-xl border border-[color:var(--ui-report-border)] bg-[color:var(--ui-report-surface)] px-4 py-8 text-center text-xs text-[color:var(--ui-report-text-muted)]">
        {isStreaming ? '流程图内容生成中，完成后自动渲染…' : '流程图渲染中…'}
      </div>
    )
  }

  return (
    <>
      <div className="my-3 max-w-full overflow-hidden rounded-xl border border-[color:var(--ui-report-border)] bg-[color:var(--ui-report-surface)] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--ui-report-border)] px-3 py-2">
          <span className="text-[11px] font-medium text-[color:var(--ui-report-text-muted)]">
            流程图
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-[color:var(--ui-report-text-primary)] hover:bg-[color:var(--ui-report-border)]/40"
              onClick={() => setModalOpen(true)}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              放大查看
            </button>
            <button
              type="button"
              data-testid="mermaid-download-png"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-[color:var(--ui-report-text-muted)] hover:bg-[color:var(--ui-report-border)]/40"
              onClick={() => void downloadPng()}
            >
              <Download className="h-3.5 w-3.5" />
              PNG
            </button>
            <button
              type="button"
              data-testid="mermaid-download-svg"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-[color:var(--ui-report-text-muted)] hover:bg-[color:var(--ui-report-border)]/40"
              onClick={downloadSvg}
            >
              <Download className="h-3.5 w-3.5" />
              SVG
            </button>
          </div>
        </div>
        <button
          type="button"
          data-testid="ai-analysis-mermaid-chart"
          className={cn(
            'group/mmd relative block w-full max-w-full cursor-zoom-in text-left',
            'min-h-[180px] max-h-[min(360px,45vh)] overflow-x-auto overflow-y-auto px-3 py-4',
          )}
          onClick={() => setModalOpen(true)}
          title="点击放大查看流程图"
        >
          <div
            className="mx-auto min-w-0 max-w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: safeSvg }}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/mmd:opacity-100">
            点击放大
          </span>
        </button>
      </div>
      <MermaidChartModal
        open={modalOpen}
        svg={safeSvg}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}
