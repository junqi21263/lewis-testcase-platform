/**
 * 共享 Mermaid 初始化、源码规范化与渲染（页面预览 + PDF 导出共用）。
 */

export type MermaidThemeMode = 'light' | 'dark'

const DIAGRAM_HEAD =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|C4Context|block-beta)\b/i

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let lastTheme: MermaidThemeMode | null = null

export function stripInvalidErDiagramEnumSyntax(src: string): string {
  let out = src.replace(/\benum\s+\w+\s*\[[^\]]*\]/gi, (full) => {
    const t = full.trim()
    return `%% ${t} — 已跳过（请改用实体字段或 Mermaid 支持的写法）`
  })
  out = out.replace(/^\s*enum\s+\w+\s*\[\s*\r?\n[\s\S]*?\r?\n\s*\]\s*/gim, (block) =>
    `%% 已跳过无效 enum 块\n${block
      .split(/\r?\n/)
      .map((l) => `%% ${l}`)
      .join('\n')}`,
  )
  return out
}

/** 规范化 AI 生成的 Mermaid 文本，降低 Syntax error 概率 */
export function normalizeMermaidSource(raw: string): string {
  let s = raw
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()

  const lines = s.split('\n')
  const firstIdx = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'))
  if (firstIdx >= 0 && !DIAGRAM_HEAD.test(lines[firstIdx]!.trim())) {
    s = `flowchart TD\n${s}`
  }

  return stripInvalidErDiagramEnumSyntax(s)
}

/** 流式输出过程中：语法未闭合时不应调用 mermaid.render */
export function isMermaidSourceLikelyComplete(src: string): boolean {
  const s = src.trim()
  if (s.length < 12) return false
  if (!DIAGRAM_HEAD.test(s.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%'))?.trim() ?? '')) {
    if (!/^(flowchart|graph)\s/i.test(s) && !s.includes('-->') && !s.includes('---')) {
      return false
    }
  }

  let round = 0
  let square = 0
  let curl = 0
  for (const ch of s) {
    if (ch === '(') round++
    if (ch === ')') round--
    if (ch === '[') square++
    if (ch === ']') square--
    if (ch === '{') curl++
    if (ch === '}') curl--
  }
  if (round !== 0 || square !== 0 || curl !== 0) return false

  const last = s.split('\n').filter((l) => l.trim()).pop() ?? ''
  if (/(-->|---|-\.-|==>)\s*$/.test(last)) return false
  if (/\[\s*$/.test(last) || /\{\s*$/.test(last) || /\(\s*$/.test(last)) return false

  return true
}

export function isMermaidErrorSvg(svg: string): boolean {
  return (
    /Syntax error in text/i.test(svg) ||
    /aria-roledescription=["']error["']/i.test(svg) ||
    /class=["'][^"']*error[^"']*["']/i.test(svg)
  )
}

async function loadMermaid(theme: MermaidThemeMode) {
  if (mermaidReady && lastTheme === theme) return mermaidReady
  lastTheme = theme
  mermaidReady = (async () => {
    const mermaid = (await import('mermaid')).default
    const dark = theme === 'dark'
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'base',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      themeVariables: dark
        ? {
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
          }
        : {
            fontFamily: 'sans-serif',
            background: '#ffffff',
            primaryColor: '#ffffff',
            primaryTextColor: '#1e293b',
            primaryBorderColor: '#cbd5e1',
            lineColor: '#64748b',
            secondaryColor: '#f8fafc',
            tertiaryColor: '#f1f5f9',
          },
    })
    return mermaid
  })()
  return mermaidReady
}

export async function renderMermaidSvg(
  raw: string,
  theme: MermaidThemeMode,
  idPrefix: string,
): Promise<string> {
  const trimmed = normalizeMermaidSource(raw)
  const mermaid = await loadMermaid(theme)

  const tryRender = async (src: string) => {
    const id = `${idPrefix}-${Math.random().toString(36).slice(2, 9)}`
    const { svg } = await mermaid.render(id, src)
    if (isMermaidErrorSvg(svg)) {
      throw new Error('Mermaid 返回了错误图示（Syntax error in text）')
    }
    return svg
  }

  try {
    return await tryRender(trimmed)
  } catch (first) {
    const patched = stripInvalidErDiagramEnumSyntax(trimmed)
    if (patched !== trimmed) {
      return await tryRender(patched)
    }
    throw first
  }
}

export function svgToPngBlob(svgMarkup: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (!w || !h) {
        const vb = /viewBox\s*=\s*["']\s*([\d.\s-]+)\s*["']/i.exec(svgMarkup)
        if (vb?.[1]) {
          const parts = vb[1].trim().split(/\s+/).map(Number)
          if (parts.length >= 4 && parts[2]! > 0 && parts[3]! > 0) {
            w = parts[2]
            h = parts[3]
          }
        }
      }
      if (!w || !h) {
        w = 800
        h = 480
      }
      const canvas = document.createElement('canvas')
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.ceil(w * dpr)
      canvas.height = Math.ceil(h * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas 不可用'))
        return
      }
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('导出 PNG 失败'))),
        'image/png',
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG 加载失败'))
    }
    img.src = url
  })
}

export function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
