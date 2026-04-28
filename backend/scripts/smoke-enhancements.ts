import axios from 'axios'

function mustEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

type ApiResp<T> = { code: number; message?: string; data: T }

async function main() {
  const base = (process.env.SMOKE_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')
  const username = mustEnv('SMOKE_USERNAME')
  const password = mustEnv('SMOKE_PASSWORD')

  const client = axios.create({
    baseURL: base,
    timeout: 20_000,
    headers: { 'Content-Type': 'application/json' },
    validateStatus: () => true,
  })

  const login = await client.post<ApiResp<{ accessToken: string }>>('/auth/login', {
    username,
    password,
  })
  if (login.status !== 200 || !login.data || (login.data as any).code !== 0) {
    throw new Error(`login failed: status=${login.status} body=${JSON.stringify(login.data)}`)
  }
  const accessToken = (login.data as any).data?.accessToken || (login.data as any).accessToken
  if (!accessToken || typeof accessToken !== 'string') {
    // 当前后端实际返回 { accessToken, user }（被响应包装后在 data 内）
    const wrapped = login.data as any
    const token = wrapped?.data?.accessToken ?? wrapped?.data?.data?.accessToken
    if (!token) throw new Error(`login token missing: ${JSON.stringify(login.data)}`)
  }
  const token =
    (login.data as any).data?.accessToken ??
    (login.data as any).data?.data?.accessToken ??
    (login.data as any).accessToken

  const authed = axios.create({
    baseURL: base,
    timeout: 20_000,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  })

  // preferences: get
  const pref1 = await authed.get<ApiResp<any>>('/preferences/me')
  if (pref1.status !== 200 || (pref1.data as any).code !== 0) {
    throw new Error(`preferences/me failed: status=${pref1.status} body=${JSON.stringify(pref1.data)}`)
  }

  // preferences: patch wallpaper enabled
  const pref2 = await authed.patch<ApiResp<any>>('/preferences/me', {
    wallpaperEnabled: true,
    wallpaperIntervalSec: 0,
  })
  if (pref2.status !== 200 || (pref2.data as any).code !== 0) {
    throw new Error(`preferences patch failed: status=${pref2.status} body=${JSON.stringify(pref2.data)}`)
  }

  // wallpaper: next (force)
  const wp = await authed.get<ApiResp<any>>('/wallpaper/next', { params: { force: 1 } })
  if (wp.status !== 200 || (wp.data as any).code !== 0) {
    throw new Error(`wallpaper/next failed: status=${wp.status} body=${JSON.stringify(wp.data)}`)
  }
  const wpData = (wp.data as any).data ?? (wp.data as any)
  if (wpData.enabled !== true || typeof wpData.url !== 'string' || !wpData.url.startsWith('http')) {
    throw new Error(`wallpaper payload invalid: ${JSON.stringify(wpData)}`)
  }

  // weather: cities
  const cities = await authed.get<ApiResp<any[]>>('/weather/cities', { params: { query: '北京' } })
  if (cities.status !== 200 || (cities.data as any).code !== 0) {
    throw new Error(`weather/cities failed: status=${cities.status} body=${JSON.stringify(cities.data)}`)
  }
  const cityList = ((cities.data as any).data ?? []) as any[]
  if (!Array.isArray(cityList)) throw new Error(`weather/cities data not array: ${JSON.stringify(cities.data)}`)

  if (cityList.length > 0) {
    const first = cityList[0]
    if (!first.id || !first.lat || !first.lon) {
      throw new Error(`weather city item invalid: ${JSON.stringify(first)}`)
    }

    // weather: current
    const cur = await authed.get<ApiResp<any>>('/weather/current', { params: { cityId: first.id } })
    if (cur.status !== 200 || (cur.data as any).code !== 0) {
      throw new Error(`weather/current failed: status=${cur.status} body=${JSON.stringify(cur.data)}`)
    }
    const now = (cur.data as any).data ?? (cur.data as any)
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

