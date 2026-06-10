/**
 * 将 Markdown 中的 ```mermaid 代码块渲染为 PNG（base64，无 data URL 前缀），供导出 PDF 嵌入。
 */

import { normalizeMermaidSource, renderMermaidSvg, svgToPngBlob } from '@/utils/mermaidRender'

function svgToPngBase64(svgMarkup: string): Promise<string> {
  return svgToPngBlob(svgMarkup).then(
    (blob) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result ?? '')
          resolve(dataUrl.replace(/^data:image\/png;base64,/, ''))
        }
        reader.onerror = () => reject(new Error('读取 PNG 失败'))
        reader.readAsDataURL(blob)
      }),
  )
}

/** 提取并规范化 Markdown 中的 Mermaid 代码块，供 PDF 导出和契约测试共用。 */
export function extractMermaidBlocksForPdf(markdown: string): string[] {
  const blocks: string[] = []
  const re = /```\s*mermaid[^\n]*\n?([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    const body = m[1]?.trim() ?? ''
    if (body) blocks.push(normalizeMermaidSource(body))
  }
  return blocks
}

/** 按文档中出现顺序返回每张 Mermaid 图的 PNG base64（不含前缀） */
export async function renderMermaidChartsToPngBase64(markdown: string): Promise<string[]> {
  const blocks = extractMermaidBlocksForPdf(markdown)
  if (blocks.length === 0) return []

  const out: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    try {
      const svg = await renderMermaidSvg(blocks[i]!, 'light', `pdf-mmd-${i}`)
      const png = await svgToPngBase64(svg)
      out.push(png)
    } catch {
      /* 单张失败跳过，避免整份 PDF 导出中断 */
    }
  }
  return out
}
