/** 单次生成中「用户侧」消息（提示词 + 需求/文档）字符上限，降低上下文溢出与网关错误 */
export const MAX_GENERATION_USER_CHARS = 100_000

const SEPARATOR_OVERHEAD = 140

/**
 * 过长时对用户消息做「前段 + 后段」保留，避免只保留开头时丢失文末验收标准等。
 */
export function clampGenerationUserContent(
  raw: string,
  maxChars: number = MAX_GENERATION_USER_CHARS,
): { text: string; truncated: boolean; omittedChars: number; originalLength: number } {
  const s = raw ?? ''
  if (s.length <= maxChars) {
    return { text: s, truncated: false, omittedChars: 0, originalLength: s.length }
  }
  const budget = Math.max(4000, maxChars - SEPARATOR_OVERHEAD)
  const head = Math.ceil(budget * 0.65)
  const tail = budget - head
  const omitted = s.length - head - tail
  const sep = `\n\n…（已省略中间约 ${omitted} 字；原文过长请拆分需求、使用摘要，或分模块多次生成）…\n\n`
  return {
    text: s.slice(0, head) + sep + s.slice(s.length - tail),
    truncated: true,
    omittedChars: omitted,
    originalLength: s.length,
  }
}

/** 粗估 token 数（中英混合时偏保守，仅用于日志/提示） */
export function roughTokenEstimateFromChars(charCount: number): number {
  return Math.ceil(charCount / 2.5)
}

export function humanizeAiProviderError(rawMessage: string): string {
  const m = (rawMessage || '').toLowerCase()
  if (
    m.includes('context_length_exceeded') ||
    m.includes('maximum context length') ||
    m.includes('context window') ||
    m.includes('token limit') ||
    (m.includes('too many tokens') && m.includes('requested')) ||
    (m.includes('invalid_request_error') && m.includes('context'))
  ) {
    return '内容超出模型上下文长度限制。请缩短需求或文档、先摘要后再生成，或换更大上下文的模型。'
  }
  if (m.includes('request_too_large') || m.includes('413') || m.includes('payload too large')) {
    return '请求体过大被拒绝。请缩短附件或需求描述后重试。'
  }
  return rawMessage
}

export const OUTPUT_TRUNCATED_NOTICE =
  '模型输出已达到本次「最大 Token」上限，回复可能被截断，JSON 可能不完整。请调高「最大 Token」、缩短单次生成范围，或分批生成。'

export const INPUT_CLAMPED_NOTICE_PREFIX = '输入过长已自动压缩：'
