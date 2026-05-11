/**
 * 将 Markdown 中的 ```mermaid 代码块渲染为 PNG（base64，无 data URL 前缀），供导出 PDF 嵌入。
 */

function svgToPngBase64(svgMarkup: string): Promise<string> {
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
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2)
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
      try {
        const dataUrl = canvas.toDataURL('image/png')
        const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
        resolve(b64)
      } catch (e) {
        reject(e instanceof Error ? e : new Error('导出 PNG 失败'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG 加载失败'))
    }
    img.src = url
  })
}

/** 按文档中出现顺序返回每张 Mermaid 图的 PNG base64（不含前缀） */
export async function renderMermaidChartsToPngBase64(markdown: string): Promise<string[]> {
  const blocks: string[] = []
  const re = /```mermaid\s*\n([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    const body = m[1]?.trim() ?? ''
    if (body) blocks.push(body)
  }
  if (blocks.length === 0) return []

  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'loose',
    themeVariables: {
      fontFamily: 'sans-serif',
      background: '#ffffff',
      primaryColor: '#ffffff',
      primaryTextColor: '#1e293e',
      primaryBorderColor: '#cbd5e1',
      lineColor: '#64748b',
      secondaryColor: '#f8fafc',
      tertiaryColor: '#f1f5f9',
    },
  })

  const out: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    const id = `pdf-mmd-${i}-${Date.now()}`
    const { svg } = await mermaid.render(id, blocks[i])
    const png = await svgToPngBase64(svg)
    out.push(png)
  }
  return out
}
