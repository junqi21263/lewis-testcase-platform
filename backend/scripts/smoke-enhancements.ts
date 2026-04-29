import axios from 'axios'

function mustEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

type ApiResp<T> = { code: number; message?: string; data: T }

function unwrap<T>(label: string, status: number, body: unknown): T {
  const b = body as ApiResp<T>
  if (status !== 200 || b?.code !== 0) {
    throw new Error(`${label} failed: status=${status} body=${JSON.stringify(body)}`)
  }
  return b.data as T
}

async function main() {
  const base = (process.env.SMOKE_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')
  const username = mustEnv('SMOKE_USERNAME')
  const password = mustEnv('SMOKE_PASSWORD')

  const client = axios.create({
    baseURL: base,
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  })

  {
    const r = await client.get<ApiResp<{ status: string }>>('/health')
    unwrap('GET /health', r.status, r.data)
  }

  const loginRes = await client.post<ApiResp<{ accessToken: string; user: unknown }>>('/auth/login', {
    username,
    password,
  })
  const loginData = unwrap<{ accessToken: string; user: unknown }>(
    'POST /auth/login',
    loginRes.status,
    loginRes.data,
  )
  const token = loginData.accessToken
  if (!token || typeof token !== 'string') {
    throw new Error('login token missing')
  }

  const authed = axios.create({
    baseURL: base,
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  })

  {
    const r = await authed.get<ApiResp<unknown>>('/preferences/me')
    unwrap('GET /preferences/me', r.status, r.data)
  }

  {
    const r = await authed.patch<ApiResp<unknown>>('/preferences/me', {
      wallpaperEnabled: true,
      wallpaperIntervalSec: 0,
    })
    unwrap('PATCH /preferences/me', r.status, r.data)
  }

  let wp1: { enabled: boolean; url: string | null }
  {
    const r = await authed.get<ApiResp<{ enabled: boolean; url: string | null }>>('/wallpaper/next', {
      params: { force: 1 },
    })
    wp1 = unwrap('GET /wallpaper/next?force=1 (1)', r.status, r.data)
  }
  if (wp1.enabled !== true || typeof wp1.url !== 'string' || !wp1.url.startsWith('http')) {
    throw new Error(`wallpaper payload invalid: ${JSON.stringify(wp1)}`)
  }

  let wp2: { enabled: boolean; url: string | null }
  {
    const r = await authed.get<ApiResp<{ enabled: boolean; url: string | null }>>('/wallpaper/next', {
      params: { force: 1 },
    })
    wp2 = unwrap('GET /wallpaper/next?force=1 (2)', r.status, r.data)
  }
  if (wp1.url === wp2.url) {
    // eslint-disable-next-line no-console
    console.warn('[smoke] warning: two forced rotations returned the same URL (rare); Bing idx collision?')
  }

  const cityList = await (async () => {
    const r = await authed.get<ApiResp<unknown[]>>('/weather/cities', { params: { query: '北京' } })
    return unwrap<unknown[]>('GET /weather/cities', r.status, r.data)
  })()

  if (!Array.isArray(cityList)) throw new Error(`weather/cities data not array: ${JSON.stringify(cityList)}`)

  if (cityList.length > 0) {
    const first = cityList[0] as { id?: string; lat?: string; lon?: string }
    if (!first.id || !first.lat || !first.lon) {
      throw new Error(`weather city item invalid: ${JSON.stringify(first)}`)
    }

    const r = await authed.get<ApiResp<{ locationId: string }>>('/weather/current', {
      params: { cityId: first.id },
    })
    const now = unwrap<{ locationId: string }>('GET /weather/current', r.status, r.data)
    if (now.locationId !== first.id) {
      throw new Error(`weather/current locationId mismatch: ${JSON.stringify(now)}`)
    }
  }

  // eslint-disable-next-line no-console
  console.log('[smoke] ok', { base })
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[smoke] failed', e)
  process.exit(1)
})
