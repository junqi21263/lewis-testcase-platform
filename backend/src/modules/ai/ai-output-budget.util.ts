export const DEFAULT_OUTPUT_TOKENS = 32_768
export const MIN_OUTPUT_TOKENS = 256
export const MAX_OUTPUT_TOKENS = 128_000
export const DEFAULT_STREAM_CONTENT_MAX_CHARS = 2_000_000
export const MAX_STREAM_CONTENT_MAX_CHARS = 8_000_000
export const DEFAULT_CONTINUATION_ATTEMPTS = 3
export const MAX_CONTINUATION_ATTEMPTS = 5

export type PlainTextContinuationMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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

function headTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const each = Math.max(1, Math.floor((maxChars - 80) / 2))
  return `${text.slice(0, each)}\n\n...(内容过长，已仅保留首尾用于续写)...\n\n${text.slice(-each)}`
}

export function buildPlainTextContinuationMessages(args: {
  originalSystem: string
  originalUser: string
  partialText: string
  originalUserMaxChars?: number
  partialTailMaxChars?: number
}): PlainTextContinuationMessage[] {
  const originalUser = headTail(args.originalUser, args.originalUserMaxChars ?? 16_000)
  const partialTail = args.partialText.slice(-(args.partialTailMaxChars ?? 24_000))
  return [
    { role: 'system', content: args.originalSystem },
    {
      role: 'user',
      content:
        `原始任务内容如下（如内容过长，仅保留首尾用于续写定位）：\n${originalUser}\n\n` +
        '上一条回复因为达到 max_tokens 被截断。请严格从已输出内容的最后一句之后继续输出，不要重复已经输出的内容，不要重新开始。',
    },
    { role: 'assistant', content: partialTail },
    {
      role: 'user',
      content: '继续输出剩余内容。只输出续写正文，不要解释。',
    },
  ]
}
