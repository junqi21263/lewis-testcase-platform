/**
 * 与前端访问来源对齐：浏览器请求的 `Origin` 是「前端页面」的协议+主机+端口，不含路径。
 * 生产可再设环境变量 `FRONTEND_URL`、`CORS_ORIGINS`（逗号分隔）追加。
 */
export const DEFAULT_BROWSER_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
] as const

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, '')
  try {
    const u = new URL(trimmed)
    // keep protocol + host(:port); drop path/query/hash
    return `${u.protocol}//${u.host}`
  } catch {
    return trimmed
  }
}

/**
 * localhost / 127.0.0.1 任意端口：
 * - 默认在非 production 放行（本地 `pnpm start:dev`）
 * - 若 .env 误设 `NODE_ENV=production`，须显式 `CORS_ALLOW_LOCALHOST=1`，或在 `CORS_ORIGINS` 写全量 Origin（含端口）
 */
function isLocalLoopbackBrowserOriginAllowed(normalized: string): boolean {
  try {
    const u = new URL(normalized)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false
    if (process.env.NODE_ENV !== 'production') return true
    const v = process.env.CORS_ALLOW_LOCALHOST?.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes'
  } catch {
    return false
  }
}

export function buildCorsOrigins(): string[] {
  const origins = new Set<string>([...DEFAULT_BROWSER_ORIGINS].map(normalizeOrigin))
  const extra = process.env.FRONTEND_URL?.trim()
  if (extra) origins.add(normalizeOrigin(extra))
  const csv = process.env.CORS_ORIGINS?.trim()
  if (csv) {
    for (const part of csv.split(',')) {
      const o = part.trim()
      if (o) origins.add(normalizeOrigin(o))
    }
  }
  return [...origins]
}

/** EdgeOne Pages 等预览子域会变化，动态放行 *.edgeone.cool / *.edgeone.site */
export function corsOriginDelegate(): (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void,
) => void {
  const staticList = buildCorsOrigins()
  return (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }
    const normalized = normalizeOrigin(origin)
    if (staticList.includes(normalized)) {
      callback(null, normalized)
      return
    }
    try {
      const { hostname, protocol, host } = new URL(normalized)
      if (isLocalLoopbackBrowserOriginAllowed(normalized)) {
        callback(null, `${protocol}//${host}`)
        return
      }
      const edgeOne =
        hostname.endsWith('.edgeone.cool') ||
        hostname.endsWith('.edgeone.site') ||
        hostname === 'edgeone.cool' ||
        hostname === 'edgeone.site'
      if (edgeOne) {
        callback(null, `${protocol}//${host}`)
        return
      }
    } catch {
      callback(new Error('Not allowed by CORS'))
      return
    }
    const hintLocalhost =
      normalized.includes('localhost') || normalized.includes('127.0.0.1')
        ? ' Local NODE_ENV=production: set CORS_ALLOW_LOCALHOST=1 or list the full Origin in CORS_ORIGINS.'
        : ''
    callback(
      new Error(
        `Not allowed by CORS (origin=${normalized}). Set CORS_ORIGINS (comma-separated) or FRONTEND_URL.${hintLocalhost}`,
      ),
    )
  }
}
