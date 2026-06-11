import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import axios from 'axios'

type OpenMeteoGeocodingResponse = {
  results?: Array<{
    name: string
    latitude: number
    longitude: number
    country?: string
    country_code?: string
    admin1?: string
    admin2?: string
    timezone?: string
  }>
}

type OpenMeteoForecastResponse = {
  current?: {
    time?: string
    interval?: number
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    wind_direction_10m?: number
    weather_code?: number
  }
}

type WttrResponse = {
  current_condition?: Array<{
    localObsDateTime?: string
    observation_time?: string
    temp_C?: string
    FeelsLikeC?: string
    humidity?: string
    weatherCode?: string
    weatherDesc?: Array<{ value?: string }>
    winddirDegree?: string
  }>
}

type CacheEntry<T> = { value: T; expiresAt: number }

type NominatimSearchItem = {
  lat: string
  lon: string
  name?: string
  display_name?: string
  importance?: number
  class?: string
  type?: string
  place_rank?: number
  address?: {
    city?: string
    town?: string
    village?: string
    county?: string
    state?: string
    region?: string
    province?: string
    country?: string
    country_code?: string
  }
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name)
  private cache = new Map<string, CacheEntry<any>>()

  private nominatimHost(): string {
    return 'https://nominatim.openstreetmap.org'
  }

  private geoHost(): string {
    return 'https://geocoding-api.open-meteo.com'
  }

  private weatherHost(): string {
    return 'https://api.open-meteo.com'
  }

  private wttrHost(): string {
    return 'https://wttr.in'
  }

  private cacheGet<T>(key: string): T | null {
    const e = this.cache.get(key)
    if (!e) return null
    if (Date.now() > e.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return e.value as T
  }

  private cacheSet(key: string, value: any, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  private nominatimBaseScore(it: NominatimSearchItem): number {
    let s = typeof it.importance === 'number' && Number.isFinite(it.importance) ? it.importance : 0
    const t = (it.type ?? '').toLowerCase()
    const c = (it.class ?? '').toLowerCase()
    if (t === 'administrative' && c === 'boundary') s += 0.14
    if (t === 'city' || t === 'municipality' || t === 'metropolis') s += 0.12
    if (t === 'town') s += 0.05
    if (['village', 'hamlet'].includes(t)) s -= 0.28
    if (['neighbourhood', 'suburb', 'quarter', 'locality'].includes(t)) s -= 0.12
    return s
  }

  /** 让「北京/上海」这类大城市优先于外省同名村；依赖 Nominatim 的 importance + 行政区字段 */
  private nominatimQueryBoost(
    query: string,
    it: NominatimSearchItem,
    row: { name: string; adm1: string },
  ): number {
    const q = query.trim()
    if (!q) return 0
    const qn = q.replace(/市$/u, '').trim()
    const addr = it.address ?? {}
    const st = addr.state ?? addr.province ?? addr.region ?? ''
    const city = addr.city ?? ''
    const cc = (addr.country_code ?? '').toLowerCase()

    let b = 0
    const targetAdmin =
      st.includes(`${qn}市`) || st === `${qn}市` || city === `${qn}市` || city === `${q}市`
    if (targetAdmin) b += 0.58
    else if (city === qn || city === q) b += 0.42

    if (cc === 'cn') {
      const t = (it.type ?? '').toLowerCase()
      const smallPlace = ['village', 'hamlet', 'neighbourhood', 'suburb', 'quarter'].includes(t)
      const nameMatches =
        row.name === qn || row.name === q || row.name === `${qn}市` || row.name === `${q}市`
      const adminMatches = b >= 0.4
      if (nameMatches && !adminMatches && smallPlace) b -= 0.5
    }
    return b
  }

  private normalizePlaceFromNominatim(it: NominatimSearchItem) {
    const addr = it.address ?? {}
    const root = typeof it.name === 'string' ? it.name.trim() : ''
    const name =
      root ||
      addr.city ||
      addr.town ||
      addr.village ||
      addr.county ||
      (typeof it.display_name === 'string' ? it.display_name.split(',')[0]?.trim() : '') ||
      ''
    const adm1 = addr.state ?? addr.province ?? addr.region ?? ''
    const adm2 =
      addr.county ??
      (addr.city && addr.city !== name ? addr.city : '') ??
      (addr.town && addr.town !== name ? addr.town : '') ??
      ''
    const country = addr.country ?? ''
    const lat = it.lat ?? ''
    const lon = it.lon ?? ''
    return {
      id: `${lat},${lon}`,
      name,
      adm1,
      adm2,
      country,
      lat,
      lon,
    }
  }

  async cityLookup(query: string) {
    const q = query.trim()
    if (!q) return []

    const cacheKey = `city:${q}`
    const cached = this.cacheGet<any[]>(cacheKey)
    if (cached) return cached

    // Open-Meteo geocoding 对中文地名（如“北京/大连”）匹配不稳定，优先用 Nominatim（OSM）提升全球城市命中率
    try {
      const url = `${this.nominatimHost()}/search`
      const { data } = await axios.get<NominatimSearchItem[]>(url, {
        timeout: 10_000,
        headers: {
          // Nominatim usage policy: identify your application
          'User-Agent': 'lewis-testcase-platform/1.0',
        },
        params: {
          q,
          format: 'jsonv2',
          addressdetails: 1,
          limit: 25,
          'accept-language': 'zh-CN',
        },
      })

      const scored = (Array.isArray(data) ? data : [])
        .map((it) => {
          const row = this.normalizePlaceFromNominatim(it)
          const score =
            this.nominatimBaseScore(it) + this.nominatimQueryBoost(q, it, row)
          return { row, score }
        })
        .filter((x) => x.row.lat && x.row.lon && x.row.name)

      scored.sort((a, b) => b.score - a.score)

      const list = scored.slice(0, 10).map((x) => x.row)

      if (list.length > 0) {
        this.cacheSet(cacheKey, list, 60_000)
        return list
      }
    } catch {
      // ignore and fallback
    }

    // fallback: Open-Meteo geocoding（若 Nominatim 不可用）
    const url = `${this.geoHost()}/v1/search`
    const { data } = await axios.get<OpenMeteoGeocodingResponse>(url, {
      timeout: 10_000,
      params: {
        name: q,
        count: 10,
        language: 'zh',
        format: 'json',
      },
    })

    const list =
      data.results
        ?.map((c) => ({
          id: `${c.latitude},${c.longitude}`,
          name: c.name,
          adm1: c.admin1 ?? '',
          adm2: c.admin2 ?? '',
          country: c.country ?? '',
          lat: String(c.latitude ?? ''),
          lon: String(c.longitude ?? ''),
        }))
        .filter((x) => x.lat && x.lon && x.name) ?? []

    this.cacheSet(cacheKey, list, 60_000)
    return list
  }

  private parseLatLon(cityId: string): { latitude: number; longitude: number } {
    const parts = cityId.split(',').map((s) => s.trim())
    if (parts.length !== 2) throw new BadRequestException('cityId 格式错误，应为 "lat,lon"')
    const latitude = Number(parts[0])
    const longitude = Number(parts[1])
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('cityId 坐标非法')
    }
    return { latitude, longitude }
  }

  private weatherCodeToText(code: number | null): { text: string; icon: string } {
    // 参考 WMO Weather interpretation codes（Open-Meteo 使用）
    const c = code ?? -1
    if (c === 0) return { text: '晴', icon: 'sun' }
    if (c === 1) return { text: '大部晴朗', icon: 'sun-cloud' }
    if (c === 2) return { text: '局部多云', icon: 'cloud-sun' }
    if (c === 3) return { text: '阴', icon: 'cloud' }
    if (c === 45 || c === 48) return { text: '雾', icon: 'fog' }
    if ([51, 53, 55, 56, 57].includes(c)) return { text: '毛毛雨', icon: 'drizzle' }
    if ([61, 63, 65, 66, 67].includes(c)) return { text: '雨', icon: 'rain' }
    if ([71, 73, 75, 77].includes(c)) return { text: '雪', icon: 'snow' }
    if ([80, 81, 82].includes(c)) return { text: '阵雨', icon: 'shower' }
    if ([85, 86].includes(c)) return { text: '阵雪', icon: 'snow' }
    if (c === 95 || c === 96 || c === 99) return { text: '雷暴', icon: 'thunder' }
    return { text: '未知', icon: 'unknown' }
  }

  private parseOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value !== 'string') return null
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : null
  }

  private wttrCodeToText(code: string | null, rawText: string | null): { text: string; icon: string } {
    const c = code ? Number(code) : NaN
    if ([113].includes(c)) return { text: '晴', icon: 'sun' }
    if ([116, 119, 122].includes(c)) return { text: '多云', icon: 'cloud' }
    if ([143, 248, 260].includes(c)) return { text: '雾', icon: 'fog' }
    if ([179, 227, 230, 323, 326, 329, 332, 335, 338, 368, 371, 392, 395].includes(c)) {
      return { text: '雪', icon: 'snow' }
    }
    if (
      [
        176, 182, 185, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314,
        317, 320, 353, 356, 359, 362, 365, 374, 377,
      ].includes(c)
    ) {
      return { text: '雨', icon: 'rain' }
    }
    if ([200, 386, 389].includes(c)) return { text: '雷暴', icon: 'thunder' }

    const t = (rawText ?? '').toLowerCase()
    if (/thunder/.test(t)) return { text: '雷暴', icon: 'thunder' }
    if (/snow|sleet|ice|blizzard/.test(t)) return { text: '雪', icon: 'snow' }
    if (/fog|mist|haze/.test(t)) return { text: '雾', icon: 'fog' }
    if (/rain|drizzle|shower/.test(t)) return { text: '雨', icon: 'rain' }
    if (/cloud|overcast/.test(t)) return { text: '多云', icon: 'cloud' }
    if (/sun|clear/.test(t)) return { text: '晴', icon: 'sun' }
    return { text: rawText || '未知', icon: 'unknown' }
  }

  private async fetchWttrNow(loc: string, latitude: number, longitude: number) {
    const { data } = await axios.get<WttrResponse>(
      `${this.wttrHost()}/${latitude},${longitude}`,
      {
        timeout: 10_000,
        params: { format: 'j1' },
        headers: {
          'User-Agent': 'lewis-testcase-platform/1.0',
        },
      },
    )

    const cur = data.current_condition?.[0]
    if (!cur) throw new ServiceUnavailableException('天气查询失败（wttr 返回缺少 current_condition）')

    const rawText = cur.weatherDesc?.[0]?.value?.trim() || null
    const wx = this.wttrCodeToText(cur.weatherCode ?? null, rawText)
    const obsTime = cur.localObsDateTime || cur.observation_time || null

    return {
      locationId: loc,
      updateTime: obsTime,
      obsTime,
      temp: this.parseOptionalNumber(cur.temp_C),
      feelsLike: this.parseOptionalNumber(cur.FeelsLikeC),
      text: wx.text,
      icon: wx.icon,
      windDir: cur.winddirDegree ?? null,
      windScale: null,
      humidity: this.parseOptionalNumber(cur.humidity),
    }
  }

  private unavailableNow(locationId: string) {
    return {
      locationId,
      updateTime: null,
      obsTime: null,
      temp: null,
      feelsLike: null,
      text: '暂不可用',
      icon: 'unknown',
      windDir: null,
      windScale: null,
      humidity: null,
      stale: true,
    }
  }

  async now(locationId: string) {
    const loc = locationId.trim()
    if (!loc) throw new BadRequestException('缺少 locationId')

    const cacheKey = `now:${loc}`
    const cached = this.cacheGet<any>(cacheKey)
    if (cached) return { ...cached, stale: false }

    const { latitude, longitude } = this.parseLatLon(loc)
    const url = `${this.weatherHost()}/v1/forecast`
    try {
      const { data } = await axios.get<OpenMeteoForecastResponse>(url, {
        timeout: 10_000,
        params: {
          latitude,
          longitude,
          timezone: 'auto',
          current: [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'wind_speed_10m',
            'wind_direction_10m',
            'weather_code',
          ].join(','),
        },
      })

      const cur = data.current
      if (!cur || typeof cur.time !== 'string') {
        throw new ServiceUnavailableException('天气查询失败（返回缺少 current）')
      }

      const wx = this.weatherCodeToText(
        typeof cur.weather_code === 'number' ? cur.weather_code : null,
      )

      const result = {
        locationId: loc,
        updateTime: cur.time ?? null,
        obsTime: cur.time ?? null,
        temp: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
        feelsLike: typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : null,
        text: wx.text,
        icon: wx.icon,
        windDir:
          typeof cur.wind_direction_10m === 'number' ? String(cur.wind_direction_10m) : null,
        windScale: null,
        humidity: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
      }

      this.cacheSet(cacheKey, result, 10 * 60_000)
      return { ...result, stale: false }
    } catch (e) {
      try {
        const fallback = await this.fetchWttrNow(loc, latitude, longitude)
        this.cacheSet(cacheKey, fallback, 10 * 60_000)
        return { ...fallback, stale: false }
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        this.logger.warn(`天气备用源查询失败 locationId=${loc}: ${fallbackMessage}`)
      }

      const last = this.cacheGet<any>(cacheKey)
      if (last) return { ...last, stale: true }
      const message = e instanceof Error ? e.message : String(e)
      this.logger.warn(`天气查询失败，返回降级数据 locationId=${loc}: ${message}`)
      return this.unavailableNow(loc)
    }
  }
}
