import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'

/**
 * AI 常生成 `enum status [A, B]` 一类语法；当前 Mermaid erDiagram 解析器会报 Parse error。
 * 将整段匹配注释掉后重试渲染，尽量保留其余实体关系图。
 */
function stripInvalidErDiagramEnumSyntax(src: string): string {
  let out = src.replace(/\benum\s+\w+\s*\[[^\]]*\]/gi, (full) => {
    const t = full.trim()
    return `%% ${t} — 已跳过（请改用实体字段或 Mermaid 支持的写法）`
  })
  /* 多行：enum X [ 换行后再写枚举项，直到独立一行的 ] */
  out = out.replace(/^\s*enum\s+\w+\s*\[\s*\r?\n[\s\S]*?\r?\n\s*\]\s*/gim, (block) =>
    `%% 已跳过无效 enum 块\n${block
      .split(/\r?\n/)
      .map((l) => `%% ${l}`)
      .join('\n')}`,
  )
  return out
}

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
        const tryRender = async (src: string) => {
          const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 9)}`
          return mermaid.render(id, src)
        }

        try {
          const { svg: out } = await tryRender(trimmed)
          if (!cancelled) setSvg(out)
        } catch (first) {
          const patched = stripInvalidErDiagramEnumSyntax(trimmed)
          if (patched !== trimmed) {
            try {
              const { svg: out } = await tryRender(patched)
              if (!cancelled) setSvg(out)
              return
            } catch {
              /* 仍失败则回落到首错信息 */
            }
          }
          if (!cancelled) setErr(first instanceof Error ? first.message : String(first))
        }
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
      <div
        role="alert"
        className="my-2 max-w-full overflow-hidden rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-200 shadow-sm"
      >
        <p className="mb-2 font-semibold text-red-100">Mermaid 渲染失败</p>
        <pre className="max-w-full whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-red-200/95 [overflow-wrap:anywhere]">
          {err}
        </pre>
        <p className="mt-2 border-t border-red-500/25 pt-2 text-[11px] leading-snug text-red-300/90">
          若图表含 <code className="rounded bg-red-900/60 px-1">enum 名称 [ … ]</code> 等写法，当前引擎可能不支持；可改为实体属性描述或简化关系图后重试。
        </p>
      </div>
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
