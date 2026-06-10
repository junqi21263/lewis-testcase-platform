import { describe, expect, it } from 'vitest'
import { normalizeMermaidSource } from './mermaidRender'

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
})
