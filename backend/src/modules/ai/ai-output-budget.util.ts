export const DEFAULT_OUTPUT_TOKENS = 32_768
export const MIN_OUTPUT_TOKENS = 256
export const MAX_OUTPUT_TOKENS = 128_000
export const DEFAULT_STREAM_CONTENT_MAX_CHARS = 2_000_000
export const MAX_STREAM_CONTENT_MAX_CHARS = 8_000_000
export const DEFAULT_CONTINUATION_ATTEMPTS = 1
export const MAX_CONTINUATION_ATTEMPTS = 5

function finiteInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return null
  return Math.floor(n)
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max)
}

export function resolveMaxTokens(
  requested?: number | null,
  opts?: {
    defaultTokens?: number | null
    maxTokens?: number | null
    minTokens?: number | null
  },
): number {
  const minTokens = clampInt(finiteInt(opts?.minTokens) ?? MIN_OUTPUT_TOKENS, 1, MAX_OUTPUT_TOKENS)
  const maxTokens = clampInt(finiteInt(opts?.maxTokens) ?? MAX_OUTPUT_TOKENS, minTokens, MAX_OUTPUT_TOKENS)
  const defaultTokens = clampInt(finiteInt(opts?.defaultTokens) ?? DEFAULT_OUTPUT_TOKENS, minTokens, maxTokens)
  const requestedTokens = finiteInt(requested)
  if (requestedTokens == null) return defaultTokens
  return clampInt(requestedTokens, minTokens, maxTokens)
}

export function resolveStreamContentMaxChars(raw?: string | number | null): number {
  const parsed = finiteInt(raw)
  if (parsed == null) return DEFAULT_STREAM_CONTENT_MAX_CHARS
  return clampInt(parsed, 10_000, MAX_STREAM_CONTENT_MAX_CHARS)
}

export function resolveContinuationAttempts(raw?: string | number | null): number {
  const parsed = finiteInt(raw)
  if (parsed == null) return DEFAULT_CONTINUATION_ATTEMPTS
  return clampInt(parsed, 0, MAX_CONTINUATION_ATTEMPTS)
}

export function shouldAttemptContinuation(
  finishReason: string | null | undefined,
  attemptsUsed: number,
  maxAttempts: number,
): boolean {
  return finishReason === 'length' && attemptsUsed < maxAttempts
}
