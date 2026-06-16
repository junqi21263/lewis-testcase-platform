import {
  buildPlainTextContinuationMessages,
  resolveContinuationAttempts,
  resolveMaxTokens,
  resolveStreamContentMaxChars,
  shouldAttemptContinuation,
} from '../src/modules/ai/ai-output-budget.util'

describe('AI output budget', () => {
  it('uses a long-output default when caller does not request max tokens', () => {
    expect(resolveMaxTokens(undefined)).toBe(32768)
  })

  it('clamps requested tokens to the platform safety range', () => {
    expect(resolveMaxTokens(128)).toBe(256)
    expect(resolveMaxTokens(200000)).toBe(128000)
  })

  it('allows environment defaults and maximums to raise or cap the budget', () => {
    expect(resolveMaxTokens(undefined, { defaultTokens: 65536, maxTokens: 96000 })).toBe(65536)
    expect(resolveMaxTokens(128000, { maxTokens: 96000 })).toBe(96000)
  })

  it('keeps enough streamed content for long outputs by default', () => {
    expect(resolveStreamContentMaxChars(undefined)).toBe(2_000_000)
    expect(resolveStreamContentMaxChars('12000')).toBe(12_000)
    expect(resolveStreamContentMaxChars('99999999')).toBe(8_000_000)
  })

  it('guards continuation attempts', () => {
    expect(resolveContinuationAttempts(undefined)).toBe(3)
    expect(resolveContinuationAttempts('3')).toBe(3)
    expect(resolveContinuationAttempts('99')).toBe(5)
    expect(shouldAttemptContinuation('length', 0, 1)).toBe(true)
    expect(shouldAttemptContinuation('stop', 0, 1)).toBe(false)
    expect(shouldAttemptContinuation('length', 1, 1)).toBe(false)
  })

  it('builds continuation messages without resending full long input', () => {
    const originalUser = `需求开始\n${'A'.repeat(120_000)}\n需求结束`
    const partialText = `报告开始\n${'B'.repeat(90_000)}\n报告截断处`

    const messages = buildPlainTextContinuationMessages({
      originalSystem: 'system',
      originalUser,
      partialText,
    })

    const joined = messages.map((item) => item.content).join('\n')
    expect(joined.length).toBeLessThan(60_000)
    expect(joined).toContain('需求开始')
    expect(joined).toContain('需求结束')
    expect(joined).toContain('报告截断处')
    expect(joined).not.toContain('A'.repeat(60_000))
    expect(joined).not.toContain('B'.repeat(60_000))
  })
})
