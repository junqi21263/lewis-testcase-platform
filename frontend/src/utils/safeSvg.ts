const BLOCKED_TAGS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed'])
const SAFE_URL_RE = /^(#|data:image\/(?:png|jpeg|jpg|gif|webp);base64,|https?:\/\/|\/)/i

export function sanitizeInlineSvg(svg: string | null | undefined): string {
  const raw = String(svg ?? '').trim()
  if (!raw) return ''
  if (typeof DOMParser === 'undefined') {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\s(?:href|xlink:href)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '')
  }

  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const parserError = doc.querySelector('parsererror')
  const root = doc.documentElement
  if (parserError || root.tagName.toLowerCase() !== 'svg') return ''

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  const nodes: Element[] = [root]
  while (walker.nextNode()) nodes.push(walker.currentNode as Element)

  for (const node of nodes) {
    if (BLOCKED_TAGS.has(node.tagName.toLowerCase())) {
      node.remove()
      continue
    }
    for (const attr of Array.from(node.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim()
      if (name.startsWith('on')) {
        node.removeAttribute(attr.name)
        continue
      }
      if ((name === 'href' || name === 'xlink:href') && value && !SAFE_URL_RE.test(value)) {
        node.removeAttribute(attr.name)
      }
    }
  }

  return new XMLSerializer().serializeToString(root)
}
