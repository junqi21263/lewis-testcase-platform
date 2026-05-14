/**
 * 写入 parseError / 返回给前端前，去掉混元等接口回显中的巨型 data URL，避免 DB 与日志被 base64 撑爆。
 */

const DATA_BASE64_RE = /data:[^\s;,]+;base64,([A-Za-z0-9+/=_-]+)/gi

const MIN_BASE64_REPLACE = 96

function approxKbFromBase64Len(len: number): number {
  if (len <= 0) return 0
  return Math.max(1, Math.round((len * 3) / 4 / 1024))
}

function stripLargeDataUrls(text: string): string {
  return text.replace(DATA_BASE64_RE, (full, b64: string) => {
    if (!b64 || b64.length < MIN_BASE64_REPLACE) return full
    return `[data/base64 已省略 · 约 ${approxKbFromBase64Len(b64.length)} KB]`
  })
}

/** 若尾部为 `HTTP 4xx: {json}`，尽量只保留前文 + JSON 内 `message`（message 内再 strip data URL） */
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
 * 供 parseError、异常摘要、日志等使用；不改变业务分支，仅缩短与脱敏展示串。
 */
export function sanitizeErrorMessageForClient(raw: string, maxLen = 2000): string {
  if (raw == null || raw === '') return raw
  let s = stripLargeDataUrls(String(raw))
  s = compressHttpJsonTail(s)
  s = stripLargeDataUrls(s)
  s = s.replace(/\n{4,}/g, '\n\n\n')
  if (s.length > maxLen) {
    s = `${s.slice(0, maxLen)}…（已截断，原文约 ${String(raw).length} 字符）`
  }
  return s.trim()
}
