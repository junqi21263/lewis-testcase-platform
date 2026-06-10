/**
 * 共享 Mermaid 初始化、源码规范化与渲染（页面预览 + PDF 导出共用）。
 */

export type MermaidThemeMode = 'light' | 'dark'

const DIAGRAM_HEAD =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|C4Context|block-beta)\b/i

const FLOWCHART_HEAD = /^(flowchart|graph)\s/i

let mermaidReady: Promise<typeof import('mermaid').default> | null = null
let lastTheme: MermaidThemeMode | null = null

const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV

function devLog(label: string, payload: Record<string, unknown>) {
  if (!DEV) return
  console.debug(`[mermaid] ${label}`, payload)
}

/** HTML / 半残实体 → 可读字符（避免 #quot; 直接进 Mermaid） */
export function decodeHtmlEntities(text: string): string {
  let s = text
  s = s.replace(/#quot;/gi, '"')
  s = s.replace(/&quot;/gi, '"')
  s = s.replace(/#39;/gi, "'")
  s = s.replace(/&#39;/g, "'")
  s = s.replace(/&apos;/gi, "'")
  s = s.replace(/&amp;/gi, '&')
  s = s.replace(/&lt;/gi, '<')
  s = s.replace(/&gt;/gi, '>')
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16)),
  )
  s = s.replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
  return s
}

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

/** AI 常把多条边写在同一行：`A[首页]    E --> F[...]` */
export function splitConcatenatedFlowchartLines(src: string): string {
  const head =
    src
      .split('\n')
      .find((l) => l.trim() && !l.trim().startsWith('%%'))
      ?.trim() ?? ''
  if (!FLOWCHART_HEAD.test(head)) return src

  return src.replace(
    /([\]\}"\)])\s+([A-Za-z_][\w-]*\s*(?:-->|---|-\.-|==>))/g,
    '$1\n$2',
  )
}

function dropTrailingIncompleteFlowLine(src: string): string {
  const lines = src.split('\n')
  while (lines.length > 0) {
    const last = lines[lines.length - 1]!.trim()
    if (!last) {
      lines.pop()
      continue
    }
    let square = 0
    let inQuote = false
    for (let i = 0; i < last.length; i++) {
      const ch = last[i]!
      if (ch === '"' && last[i - 1] !== '\\') inQuote = !inQuote
      if (!inQuote) {
        if (ch === '[') square++
        if (ch === ']') square--
      }
    }
    if (square > 0 || inQuote || /(-->|---|-\.-|==>)\s*$/.test(last)) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join('\n')
}

function stripMarkdownFences(raw: string): string {
  const m = raw.match(/^```(?:mermaid)?\s*\n?([\s\S]*?)```\s*$/i)
  return m?.[1] != null ? m[1] : raw
}

function normalizeArrows(s: string): string {
  return s
    .replace(/[→⇒➔➜⟹]/g, '-->')
    .replace(/[－—–]/g, '-')
    .replace(/\s*--\s*>/g, '-->')
    .replace(/\s*==\s*>/g, '==>')
    .replace(/->>/g, '-->')
    .replace(/<<-/g, '<--')
}

function cleanLabelInner(raw: string): string {
  let t = decodeHtmlEntities(raw).trim()
  t = t.replace(/^[`]+|[`]+$/g, '')
  t = t.replace(/^["""''「」『』]+|["""''「」『』]+$/g, '')
  t = t.replace(/\s+/g, ' ')
  t = t.replace(/\\/g, '\\\\')
  return t
}

/** 方括号节点 label 安全化（不再写入 #quot;） */
function formatBracketLabel(inner: string): string {
  const t = cleanLabelInner(inner)
  if (!t) return '""'
  const needsQuotes = /["'[\]#;|]/.test(t) || /[,:?()]/.test(t) || /\s/.test(t)
  if (!needsQuotes) return t
  const safe = t.replace(/"/g, "'")
  return `"${safe}"`
}

/** 花括号决策节点 */
function formatBraceLabel(inner: string): string {
  const t = cleanLabelInner(inner)
  if (!t) return '""'
  if (/["'[\]#;|]/.test(t)) return `"${t.replace(/"/g, "'")}"`
  return t
}

/** 圆角 / 圆形节点 ( ) */
function formatParenLabel(inner: string): string {
  const t = cleanLabelInner(inner)
  if (!t) return '""'
  if (/[()"[\]#;|]/.test(t)) return `"${t.replace(/"/g, "'")}"`
  return t
}

/** 逐行清洗 flowchart 节点定义 */
function sanitizeFlowchartNodeLabels(src: string): string {
  const headLine =
    src
      .split('\n')
      .find((l) => l.trim() && !l.trim().startsWith('%%'))
      ?.trim() ?? ''
  if (!FLOWCHART_HEAD.test(headLine)) return src

  return src
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('%%')) return line

      let out = line

      out = out.replace(
        /(\b[A-Za-z_][\w-]*)\s*\[\s*((?:[^\[\]"']|"[^"]*")*?)\s*\]/g,
        (_m, id: string, label: string) => `${id}[${formatBracketLabel(label)}]`,
      )
      out = out.replace(
        /(\b[A-Za-z_][\w-]*)\s*\{\s*((?:[^{}"']|"[^"]*")*?)\s*\}/g,
        (_m, id: string, label: string) => `${id}{${formatBraceLabel(label)}}`,
      )
      out = out.replace(
        /(\b[A-Za-z_][\w-]*)\s*\(\s*((?:[^()"']|"[^"]*")*?)\s*\)/g,
        (_m, id: string, label: string) => `${id}(${formatParenLabel(label)})`,
      )
      out = out.replace(
        /(\b[A-Za-z_][\w-]*)\s*\[\[\s*((?:[^\[\]"']|"[^"]*")*?)\s*\]\]/g,
        (_m, id: string, label: string) => `${id}[[${formatBracketLabel(label)}]]`,
      )

      return out
    })
    .join('\n')
}

function removeStrayBackticks(src: string): string {
  return src.replace(/```/g, '').replace(/`([^`\n]+)`/g, '$1')
}

/** 规范化 AI 生成的 Mermaid 文本，降低 Syntax error 概率 */
export function normalizeMermaidSource(raw: string): string {
  let s = stripMarkdownFences(raw)
  s = decodeHtmlEntities(s)
  s = s
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[：]/g, ':')
    .replace(/[；]/g, ';')
  s = normalizeArrows(s)
  s = removeStrayBackticks(s)
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!s || /^%%\s*$/m.test(s)) return 'flowchart TD\n  A[暂无流程图]'

  const lines = s.split('\n')
  const firstIdx = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'))
  if (firstIdx >= 0 && !DIAGRAM_HEAD.test(lines[firstIdx]!.trim())) {
    s = `flowchart TD\n${s}`
  }

  s = splitConcatenatedFlowchartLines(s)
  s = sanitizeFlowchartNodeLabels(s)
  s = dropTrailingIncompleteFlowLine(s)
  s = stripInvalidErDiagramEnumSyntax(s)

  devLog('normalize', {
    rawPreview: raw.slice(0, 240),
    normalizedPreview: s.slice(0, 240),
  })

  return s
}

/** 流式输出过程中：语法未闭合时不应调用 mermaid.render */
export function isMermaidSourceLikelyComplete(src: string): boolean {
  const s = normalizeMermaidSource(src).trim()
  if (s.length < 12) return false
  if (!DIAGRAM_HEAD.test(s.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%'))?.trim() ?? '')) {
    if (!FLOWCHART_HEAD.test(s) && !s.includes('-->') && !s.includes('---')) {
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
    /error-text/i.test(svg) ||
    /error-icon/i.test(svg) ||
    /aria-roledescription=["']error["']/i.test(svg) ||
    /class=["'][^"']*error[^"']*["']/i.test(svg) ||
    /viewBox=["']0 0 2412 512["']/i.test(svg)
  )
}

/** 用户可见的简短错误说明（不暴露堆栈） */
export function friendlyMermaidErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/Syntax error/i.test(raw) || /错误图示/i.test(raw)) {
    return '流程图语法暂时无法解析，可展开查看原始定义。'
  }
  if (/parse/i.test(raw)) return '流程图结构不完整或含非法符号，请查看原始源码。'
  return '流程图暂时无法渲染，已保留原始定义供查看。'
}

async function loadMermaid(theme: MermaidThemeMode) {
  if (mermaidReady && lastTheme === theme) return mermaidReady
  lastTheme = theme
  mermaidReady = (async () => {
    const mermaid = (await import('mermaid')).default
    const dark = theme === 'dark'
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
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
    try {
      await mermaid.parse(src)
    } catch (parseErr) {
      throw parseErr instanceof Error ? parseErr : new Error(String(parseErr))
    }
    const { svg } = await mermaid.render(id, src)
    if (isMermaidErrorSvg(svg)) {
      throw new Error('Mermaid 返回了错误图示（Syntax error in text）')
    }
    return svg
  }

  const split = splitConcatenatedFlowchartLines(trimmed)
  const attempts = [
    trimmed,
    split,
    stripInvalidErDiagramEnumSyntax(trimmed),
    stripInvalidErDiagramEnumSyntax(split),
    sanitizeFlowchartNodeLabels(trimmed),
    sanitizeFlowchartNodeLabels(split),
  ]
  const unique = [...new Set(attempts.map((a) => a.trim()).filter(Boolean))]

  let lastErr: unknown
  for (const src of unique) {
    try {
      const svg = await tryRender(src)
      devLog('render ok', { idPrefix, attemptLen: src.length })
      return svg
    } catch (e) {
      lastErr = e
      devLog('render attempt failed', {
        idPrefix,
        message: e instanceof Error ? e.message : String(e),
        srcPreview: src.slice(0, 180),
      })
    }
  }

  devLog('render failed', {
    idPrefix,
    message: lastErr instanceof Error ? lastErr.message : String(lastErr),
  })
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
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
