import { Download, Maximize2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { MermaidChartModal } from '@/components/analysis/MermaidChartModal'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/utils/cn'
import {
  downloadTextFile,
  isMermaidSourceLikelyComplete,
  normalizeMermaidSource,
  renderMermaidSvg,
  svgToPngBlob,
} from '@/utils/mermaidRender'

type Props = {
  chart: string
  /** 报告流式生成中为 true：未完成语法不渲染，避免 Syntax error 炸弹图 */
  isStreaming?: boolean
}

export function MermaidBlock({ chart, isStreaming = false }: Props) {
  const reactId = useId().replace(/:/g, '')
  const theme = useThemeStore((s) => s.theme)
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [debouncedChart, setDebouncedChart] = useState(chart)
  const renderGen = useRef(0)

  const trimmed = useMemo(() => chart.trim(), [chart])
  const normalized = useMemo(() => normalizeMermaidSource(trimmed), [trimmed])

  useEffect(() => {
    const delay = isStreaming ? 900 : 200
    const t = window.setTimeout(() => setDebouncedChart(chart), delay)
    return () => window.clearTimeout(t)
  }, [chart, isStreaming])

  const canAttemptRender = useMemo(() => {
    if (!debouncedChart.trim()) return false
    if (isStreaming && !isMermaidSourceLikelyComplete(debouncedChart)) return false
    return true
  }, [debouncedChart, isStreaming])

  useEffect(() => {
    if (!canAttemptRender) {
      setSvg(null)
      setErr(null)
      return
    }

    const gen = ++renderGen.current
    let cancelled = false

    ;(async () => {
      setSvg(null)
      setErr(null)
      try {
        const out = await renderMermaidSvg(debouncedChart, theme, `mmd-${reactId}`)
        if (cancelled || gen !== renderGen.current) return
        setSvg(out)
      } catch (e) {
        if (cancelled || gen !== renderGen.current) return
        setErr(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [canAttemptRender, debouncedChart, theme, reactId])

  const waiting =
    !canAttemptRender ||
    (canAttemptRender && !svg && !err)

  const downloadPng = async () => {
    if (!svg) return
    try {
      const blob = await svgToPngBlob(svg)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'flowchart.png'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已下载 PNG')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败')
    }
  }

  const downloadSvg = () => {
    if (!svg) return
    downloadTextFile(svg, 'flowchart.svg', 'image/svg+xml')
    toast.success('已下载 SVG')
  }

  if (err) {
    return (
      <div
        role="alert"
        className="my-3 max-w-full overflow-hidden rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-200"
      >
        <p className="mb-2 font-semibold text-red-100">流程图无法渲染</p>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px]">
          {err}
        </pre>
        <details className="mt-2 border-t border-red-500/25 pt-2">
          <summary className="cursor-pointer text-[11px] text-red-300/90">查看原始 Mermaid 源码</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[10px] text-red-100/90">
            {normalized}
          </pre>
        </details>
      </div>
    )
  }

  if (waiting) {
    return (
      <div className="my-3 rounded-xl border border-[color:var(--ui-report-border)] bg-[color:var(--ui-report-surface)] px-3 py-8 text-center text-xs text-[color:var(--ui-report-text-muted)]">
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
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-[color:var(--ui-report-text-muted)] hover:bg-[color:var(--ui-report-border)]/40"
              onClick={() => void downloadPng()}
            >
              <Download className="h-3.5 w-3.5" />
              PNG
            </button>
            <button
              type="button"
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
          className={cn(
            'group/mmd relative block w-full cursor-zoom-in text-left',
            'max-h-[min(360px,45vh)] overflow-auto px-3 py-4',
          )}
          onClick={() => setModalOpen(true)}
          title="点击放大查看流程图"
        >
          <div
            className="mx-auto max-w-full [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg! }}
          />
          <span className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover/mmd:opacity-100">
            点击放大
          </span>
        </button>
      </div>
      <MermaidChartModal
        open={modalOpen}
        svg={svg}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}
