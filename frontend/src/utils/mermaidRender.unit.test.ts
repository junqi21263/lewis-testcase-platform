import { describe, expect, it } from 'vitest'
import {
  buildMermaidInitConfig,
  isMermaidErrorSvg,
  normalizeMermaidSource,
  prepareMermaidSvgForDownload,
} from './mermaidRender'

describe('normalizeMermaidSource contract behavior', () => {
  it('preserves labeled flowchart arrows and subroutine nodes', () => {
    const normalized = normalizeMermaidSource(`
flowchart TD
  A[[用户提交订单]] --> B{库存是否充足?}
  B -- 是 --> C[创建支付单]
`)

    expect(normalized).toContain('A[[用户提交订单]]')
    expect(normalized).not.toContain('A["[用户提交订单"]]')
    expect(normalized).toContain('B -->|是| C')
    expect(normalized).not.toContain('B -- 是--> C')
  })

  it('quotes punctuation-heavy labels and reserved end labels', () => {
    const normalized = normalizeMermaidSource(`
flowchart TD
  A[提交(移动端, iOS)] --> B{是否成功?}
  B --> C[end]
`)

    expect(normalized).toContain('A["提交(移动端, iOS)"]')
    expect(normalized).toContain('B{"是否成功?"}')
    expect(normalized).toContain('C["end"]')
  })

  it('cleans AI list markers and ambiguous o/x edge targets', () => {
    const normalized = normalizeMermaidSource(`
flowchart TD
  1. A[开始] -->oNext[继续]
  - oNext --> xFail[失败]
  * xFail ---xRetry[重试]
`)

    expect(normalized).toContain('A[开始] --> oNext[继续]')
    expect(normalized).toContain('oNext --> xFail[失败]')
    expect(normalized).toContain('xFail --- xRetry[重试]')
    expect(normalized).not.toMatch(/^\s*(?:1\.|-|\*)\s/m)
  })

  it('does not treat normal Mermaid style definitions as error SVGs', () => {
    const normalSvg = `
<svg aria-roledescription="flowchart-v2" viewBox="0 0 108 174">
  <style>#chart .error-icon{fill:#552222;} #chart .error-text{fill:#552222;}</style>
  <g class="node"><text>开始</text></g>
</svg>`

    expect(isMermaidErrorSvg(normalSvg)).toBe(false)
    expect(
      isMermaidErrorSvg(
        '<svg aria-roledescription="error"><text>Syntax error in text</text></svg>',
      ),
    ).toBe(true)
  })

  it('prepares rendered SVG markup for reliable svg/png download', () => {
    const prepared = prepareMermaidSvgForDownload(
      '<svg viewBox="0 0 640 360"><g><text>流程</text></g></svg>',
    )

    expect(prepared).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(prepared).toContain('width="640"')
    expect(prepared).toContain('height="360"')
    expect(prepared).toContain('preserveAspectRatio="xMidYMid meet"')
  })

  it('disables htmlLabels so flowchart text stays inside pure svg nodes', () => {
    expect(buildMermaidInitConfig('dark').htmlLabels).toBe(false)
    expect(buildMermaidInitConfig('light').htmlLabels).toBe(false)
  })
})
