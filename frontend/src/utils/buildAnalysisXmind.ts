/**
 * 由 AI 需求分析报告 Markdown 生成 XMind 8 兼容 .xmind（ZIP：META-INF/manifest.xml + content.xml）。
 */
import JSZip from 'jszip'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface TopicNode {
  title: string
  children: TopicNode[]
}

/** 按 ## 标题切块，列表项作为子节点（支持单层 - 条目） */
export function markdownReportToTopicTree(markdown: string, rootTitle: string): TopicNode {
  const sections = markdown.split(/^##\s+/m).filter((chunk) => chunk.trim().length > 0)
  const children: TopicNode[] = []

  for (const chunk of sections) {
    const lines = chunk.split('\n')
    const titleLine = (lines[0] ?? '').trim().slice(0, 220)
    const body = lines.slice(1).join('\n')
    const bullets = body.match(/^\s*[-*+]\s+.+/gm) ?? []
    const sub: TopicNode[] = bullets.map((b) => ({
      title: b.replace(/^\s*[-*+]\s+/, '').trim().slice(0, 300),
      children: [],
    }))
    children.push({
      title: titleLine || '（未命名章节）',
      children: sub,
    })
  }

  return {
    title: rootTitle.slice(0, 200),
    children: children.length > 0 ? children : [{ title: '（未识别章节结构）', children: [] }],
  }
}

function topicToXml(node: TopicNode, id: string): string {
  if (node.children.length === 0) {
    return `<topic id="${id}"><title>${escapeXml(node.title)}</title></topic>`
  }
  const inner = node.children.map((c, i) => topicToXml(c, `${id}-s-${i}`)).join('')
  return `<topic id="${id}"><title>${escapeXml(node.title)}</title><children><topics type="attached">${inner}</topics></children></topic>`
}

function buildContentXmlFixed(root: TopicNode): string {
  const rootXml = topicToXml(root, 'root-topic')
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:fo="http://www.w3.org/1999/XSL/Format" version="2.0">
  <sheet id="sheet-1">
    ${rootXml}
  </sheet>
</xmap-content>`
}

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">
  <file-entry full-path="content.xml" media-type="text/xml"/>
</manifest>
`

/** 生成 .xmind Blob */
export async function buildAnalysisXmindBlob(markdown: string, rootTitle: string): Promise<Blob> {
  const tree = markdownReportToTopicTree(markdown, rootTitle)
  const content = buildContentXmlFixed(tree)
  const zip = new JSZip()
  zip.file('META-INF/manifest.xml', MANIFEST_XML)
  zip.file('content.xml', content)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
