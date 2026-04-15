/**
 * 服务端脱敏：与大模型交互前、落库展示前统一处理
 * （规则与前端 sensitiveDetector 对齐）
 */

type MaskRule = {
  pattern: RegExp
  mask: (raw: string) => string
}

const RULES: MaskRule[] = [
  {
    pattern: /(?:\+?86[-\s]?)?1[3-9]\d{9}/g,
    mask: (raw) => raw.slice(0, 3) + '****' + raw.slice(-4),
  },
  {
    pattern: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX]/g,
    mask: (raw) => raw.slice(0, 6) + '********' + raw.slice(-4),
  },
  {
    pattern: /\b(?:\d[-\s]?){15,18}\d\b/g,
    mask: (raw) => {
      const digits = raw.replace(/[-\s]/g, '')
      return digits.slice(0, 4) + ' **** **** ' + digits.slice(-4)
    },
  },
  {
    pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    mask: (raw) => {
      const [local, domain] = raw.split('@')
      return local.slice(0, 2) + '***@' + domain
    },
  },
  {
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    mask: (raw) => {
      const parts = raw.split('.')
      return parts[0] + '.***.***.' + parts[3]
    },
  },
  {
    pattern: /(?:sk-|Bearer\s|apikey[=:]\s*|token[=:]\s*)[A-Za-z0-9\-_]{16,}/gi,
    mask: (raw) => {
      const prefix = raw.match(/^[^A-Za-z0-9]*/)?.[0] ?? ''
      return prefix + '**************[REDACTED]'
    },
  },
  {
    pattern: /(?:password|passwd|pwd|secret)\s*[:=]\s*["']?[^\s"',;]{4,}["']?/gi,
    mask: (raw) => {
      const sep = raw.includes('=') ? '=' : ':'
      const key = raw.split(new RegExp(`${sep}`))[0]
      return `${key}${sep} [REDACTED]`
    },
  },
]

interface MatchSeg {
  index: number
  length: number
  masked: string
}

function collectMatches(text: string): MatchSeg[] {
  const out: MatchSeg[] = []
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.pattern.exec(text)) !== null) {
      const raw = m[0]
      out.push({ index: m.index, length: raw.length, masked: rule.mask(raw) })
    }
    rule.pattern.lastIndex = 0
  }
  const seen = new Set<number>()
  return out
    .sort((a, b) => a.index - b.index)
    .filter((x) => {
      if (seen.has(x.index)) return false
      seen.add(x.index)
      return true
    })
}

/** 将文本中的敏感片段替换为脱敏占位，用于入库与调用结构化模型 */
export function maskSensitivePlainText(text: string): string {
  const matches = collectMatches(text)
  let result = text
  const sorted = [...matches].sort((a, b) => b.index - a.index)
  for (const m of sorted) {
    result = result.slice(0, m.index) + m.masked + result.slice(m.index + m.length)
  }
  return result
}
