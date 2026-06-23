import { describe, expect, it } from 'vitest'
import { buildStreamInterruptedMessage } from './request'

describe('buildStreamInterruptedMessage', () => {
  it('uses the current stream endpoint in proxy timeout guidance', () => {
    const msg = buildStreamInterruptedMessage('/ai/analyze/stream')

    expect(msg).toContain('/api/ai/analyze/stream')
    expect(msg).not.toContain('/api/ai/generate/stream')
  })
})
