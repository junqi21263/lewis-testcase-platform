import { describe, expect, it } from 'vitest'
import { sanitizeInlineSvg } from './safeSvg'

describe('sanitizeInlineSvg', () => {
  it('removes script tags, foreignObject and event handlers', () => {
    const svg = sanitizeInlineSvg(`
      <svg viewBox="0 0 100 40" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><div onclick="alert(2)">bad</div></foreignObject>
        <text onclick="alert(3)">ABCD</text>
      </svg>
    `)

    expect(svg).toContain('<svg')
    expect(svg).toContain('ABCD')
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('foreignObject')
    expect(svg).not.toContain('onload')
    expect(svg).not.toContain('onclick')
  })

  it('removes javascript urls while preserving safe svg attributes', () => {
    const svg = sanitizeInlineSvg(`
      <svg viewBox="0 0 100 40">
        <a href="javascript:alert(1)"><text fill="#333">CAP</text></a>
      </svg>
    `)

    expect(svg).toContain('viewBox')
    expect(svg).toContain('fill="#333"')
    expect(svg).not.toContain('javascript:')
  })
})
