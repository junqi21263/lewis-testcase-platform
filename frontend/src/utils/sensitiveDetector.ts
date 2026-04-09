import type { SensitiveMatch } from '@/types/upload'

/**
 * 敏感信息检测规则表
 * 每条规则包含：检测正则、类型名称、脱敏函数
 */
interface DetectRule {
  type: SensitiveMatch['type']
  pattern: RegExp
  mask: (raw: string) => string
}

const RULES: DetectRule[] = [
  {
    type: '手机号',
    // 国内 11 位手机号，可能含 +86 前缀
    pattern: /(?:\+?86[-\s]?)?1[3-9]\d{9}/g,
    mask: (raw) => raw.slice(0, 3) + '****' + raw.slice(-4),
  },
  {
    type: '身份证',
    // 18 位身份证（最后一位可为 X）
    pattern: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]/g,
    mask: (raw) => raw.slice(0, 6) + '********' + raw.slice(-4),
  },
  {
    type: '银行卡',
    // 16-19 位纯数字，每 4 位可有空格/连字符分隔
    pattern: /\b(?:\d[-\s]?){15,18}\d\b/g,
    mask: (raw) => {
      const digits = raw.replace(/[-\s]/g, '')
      return digits.slice(0, 4) + ' **** **** ' + digits.slice(-4)
    },
  },
  {
    type: '邮箱',
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    mask: (raw) => {
      const [local, domain] = raw.split('@')
      return local.slice(0, 2) + '***@' + domain
    },
  },
  {
    type: 'IP地址',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    mask: (raw) => {
      const parts = raw.split('.')
      return parts[0] + '.***.***.' + parts[3]
    },
  },
  {
    type: 'API密钥',
    // 常见 Bearer Token / sk- / apikey= 之类的模式
    pattern: /(?:sk-|Bearer\s|apikey[=:]\s*|token[=:]\s*)[A-Za-z0-9\-_]{16,}/gi,
    mask: (raw) => {
      const prefix = raw.match(/^[^A-Za-z0-9]*/)?.[0] ?? ''
      return prefix + '**************[REDACTED]'
    },
  },
  {
    type: '密码字段',
    // 形如  password: "abc123" 或 pwd = 'secret'
    pattern: /(?:password|passwd|pwd|secret)\s*[:=]\s*["']?[^\s"',;]{4,}["']?/gi,
    mask: (raw) => {
      const sep = raw.includes('=') ? '=' : ':'
      const key = raw.split(new RegExp(`${sep}`))[0]
      return `${key}${sep} [REDACTED]`
    },
  },
]

/**
 * 检测文本中所有敏感信息
 * @returns 敏感匹配列表（按 index 升序排列）
 */
export function detectSensitive(text: string): SensitiveMatch[] {
  const matches: SensitiveMatch[] = []

  for (const rule of RULES) {
    // 重置 lastIndex（全局正则复用时必须）
    rule.pattern.lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = rule.pattern.exec(text)) !== null) {
      const raw = m[0]
      matches.push({
        type: rule.type,
        raw,
        masked: rule.mask(raw),
        index: m.index,
        length: raw.length,
      })
    }
    rule.pattern.lastIndex = 0
  }

  // 按位置升序，去重（同 index 只保留第一条）
  const seen = new Set<number>()
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((m) => {
      if (seen.has(m.index)) return false
      seen.add(m.index)
      return true
    })
}

/**
 * 将原始文本中所有敏感信息替换为脱敏后的内容
 * 从后往前替换，避免 index 偏移
 */
export function maskText(text: string, matches: SensitiveMatch[]): string {
  let result = text
  const sorted = [...matches].sort((a, b) => b.index - a.index)

  for (const m of sorted) {
    result = result.slice(0, m.index) + m.masked + result.slice(m.index + m.length)
  }

  return result
}

/**
 * 将敏感信息在文本中高亮 —— 返回带 <mark> 标记的 HTML 字符串
 * 调用方需用 dangerouslySetInnerHTML 渲染，确保输入已做 XSS 转义
 */
export function highlightSensitive(text: string, matches: SensitiveMatch[]): string {
  if (matches.length === 0) return escapeHtml(text)

  let result = ''
  let cursor = 0
  const sorted = [...matches].sort((a, b) => a.index - b.index)

  for (const m of sorted) {
    if (m.index < cursor) continue // 跳过重叠片段
    result += escapeHtml(text.slice(cursor, m.index))
    result += `<mark class="sensitive-highlight" title="${m.type}">${escapeHtml(m.masked)}</mark>`
    cursor = m.index + m.length
  }
  result += escapeHtml(text.slice(cursor))
  return result
}

/** XSS 安全转义 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
