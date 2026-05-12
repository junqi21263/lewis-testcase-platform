import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'

/**
 * 报告中的 Mermaid 流程图：深色主题、可缩放查看（与 AI 需求分析终端风格一致）。
 */
export function MermaidBlock({ chart }: { chart: string }) {
  const reactId = useId().replace(/:/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [scale, setScale] = useState(1)

  const trimmed = useMemo(() => chart.trim(), [chart])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setSvg(null)
      setErr(null)
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          themeVariables: {
            primaryColor: '#6366f1',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#4f46e5',
            lineColor: '#64748b',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0f172a',
            background: '#111125',
            mainBkg: '#1a1a2e',
            nodeBorder: '#475569',
            clusterBkg: '#1e293b',
            titleColor: '#f1f5f9',
            edgeLabelBackground: '#1e293b',
          },
        })
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 9)}`
        const { svg: out } = await mermaid.render(id, trimmed)
        if (!cancelled) setSvg(out)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [trimmed, reactId])

  if (err) {
    return (
      <pre className="my-2 overflow-x-auto rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
        Mermaid 渲染失败：{err}
      </pre>
    )
  }

  if (!svg) {
    return (
      <div className="my-2 rounded-lg border border-white/10 bg-[#111125]/80 px-3 py-6 text-center text-xs text-gray-500">
        流程图渲染中…
      </div>
    )
  }

  return (
    <div className="my-2 max-w-full overflow-hidden rounded-lg border border-white/10 bg-[#0d1117]/90 shadow-inner">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#1a1a2e]/80 px-2 py-1.5">
        <span className="text-[11px] text-gray-500">流程图 · 可缩放查看</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200"
            aria-label="缩小"
            onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.1) * 10) / 10))}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3rem] text-center font-mono text-[11px] text-gray-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200"
            aria-label="放大"
            onClick={() => setScale((s) => Math.min(2.5, Math.round((s + 0.1) * 10) / 10))}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200"
            aria-label="重置缩放"
            onClick={() => setScale(1)}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[min(480px,55vh)] overflow-auto px-2 py-3">
        <div
          className="inline-block min-w-min origin-top-left transition-transform duration-150"
          style={{ transform: `scale(${scale})` }}
          // SVG 来自受控 Mermaid 输出；已在服务端/前端由同一 lib 生成
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  )
}
