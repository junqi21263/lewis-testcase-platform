// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderMermaidSvg } from './mermaidRender'
import { sanitizeInlineSvg } from './safeSvg'

describe('renderMermaidSvg', () => {
  it('keeps flowchart labels after svg sanitization', async () => {
    if (
      typeof SVGElement !== 'undefined' &&
      !('getComputedTextLength' in SVGElement.prototype)
    ) {
      Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
        configurable: true,
        value() {
          return 120
        },
      })
    }
    if (typeof SVGElement !== 'undefined' && !('getBBox' in SVGElement.prototype)) {
      Object.defineProperty(SVGElement.prototype, 'getBBox', {
        configurable: true,
        value() {
          return { x: 0, y: 0, width: 120, height: 24 }
        },
      })
    }

    const svg = await renderMermaidSvg(
      `
      flowchart TD
        A[提交(移动端, iOS)] --> B{是否成功?}
        B -->|否| C[失败(网络异常)]
      `,
      'dark',
      'unit-mmd',
    )

    const sanitized = sanitizeInlineSvg(svg)
    const doc = new DOMParser().parseFromString(sanitized, 'image/svg+xml')
    const svgText = doc.documentElement.textContent ?? ''

    expect(sanitized).toContain('<text')
    expect(svgText).toContain('提交(移动端, iOS)')
    expect(svgText).toContain('是否成功?')
    expect(svgText).toContain('失败(网络异常)')
    expect(sanitized).not.toContain('foreignObject')
  })
})
