/**
 * 将接口 / 解析错误中的超长 data URL、巨型 base64 等压缩为可读摘要，避免终端与面板被「一屏 base64」撑爆。
 * 不改变业务含义，仅用于展示与日志文案。
 */

const DATA_BASE64_RE = /data:[^\s;,]+;base64,([A-Za-z0-9+/=_-]+)/gi

const MIN_BASE64_REPLACE = 96

function approxBinaryKbFromBase64Len(len: number): number {
  if (len <= 0) return 0
  return Math.max(1, Math.round((len * 3) / 4 / 1024))
}

function stripLargeDataUrls(text: string): string {
  return text.replace(DATA_BASE64_RE, (full, b64: string) => {
    if (!b64 || b64.length < MIN_BASE64_REPLACE) return full
    const kb = approxBinaryKbFromBase64Len(b64.length)
    return `[内嵌 data/base64 已省略 · 约 ${kb} KB]`
  })
}

/** 若尾部为 `HTTP 400: {...json}`，解析并只保留前文 + `message`（便于阅读） */
function compressHttpJsonTail(text: string): string {
  const trimmed = text.trimEnd()
  const re = /^(.*)(HTTP\s+\d{3}\s*[:：]\s*)(\{[\s\S]+\})\s*$/i
  const m = re.exec(trimmed)
  if (!m) return text
  const head = (m[1] ?? '').trimEnd()
  const jsonStr = m[3]
  try {
    const o = JSON.parse(jsonStr) as { message?: string }
    if (o?.message && typeof o.message === 'string') {
      const msg = stripLargeDataUrls(o.message.trim())
      if (msg) return head ? `${head} — ${msg}` : msg
    }
  } catch {
    return text
  }
  return text
}

/**
 * @param maxLength 展示用最大字符数（截断前会先去掉巨型 data URL）
 */
export function sanitizeErrorForDisplay(raw: string | null | undefined, maxLength = 2000): string {
  if (raw == null) return ''
  let s = String(raw)
  if (!s.trim()) return ''

  s = stripLargeDataUrls(s)
  s = compressHttpJsonTail(s)
  s = stripLargeDataUrls(s)

  s = s.replace(/\n{4,}/g, '\n\n\n')

  if (s.length > maxLength) {
    const total = s.length
    s = `${s.slice(0, maxLength)}…（展示已截断，原文约 ${total} 字符）`
  }

  return s.trim()
}

/** 仅当 parseError 过长时压缩，避免轮询把巨型字符串长期留在 React state */
export function maybeShrinkParseErrorField<T extends { parseError?: string | null }>(f: T): T {
  const pe = f.parseError
  if (pe == null || pe === '' || pe.length < 400) return f
  return { ...f, parseError: sanitizeErrorForDisplay(pe) }
}
