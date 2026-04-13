/**
 * 与前端访问来源对齐：浏览器请求的 `Origin` 是「前端页面」的协议+主机+端口，不含路径。
 * 生产可再设环境变量 `FRONTEND_URL`、`CORS_ORIGINS`（逗号分隔）追加。
 */
export const DEFAULT_BROWSER_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://lewis-testcase-platform-xyqvs7bh.edgeone.cool',
] as const

export function buildCorsOrigins(): string[] {
  const origins = new Set<string>([...DEFAULT_BROWSER_ORIGINS])
  const extra = process.env.FRONTEND_URL?.trim()
  if (extra) origins.add(extra)
  const csv = process.env.CORS_ORIGINS?.trim()
  if (csv) {
    for (const part of csv.split(',')) {
      const o = part.trim()
      if (o) origins.add(o)
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
    if (staticList.includes(origin)) {
      callback(null, origin)
      return
    }
    try {
      const { hostname } = new URL(origin)
      const edgeOne =
        hostname.endsWith('.edgeone.cool') ||
        hostname.endsWith('.edgeone.site') ||
        hostname === 'edgeone.cool' ||
        hostname === 'edgeone.site'
      if (edgeOne) {
        callback(null, origin)
        return
      }
    } catch {
      callback(new Error('Not allowed by CORS'))
      return
    }
    callback(new Error('Not allowed by CORS'))
  }
}
