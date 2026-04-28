import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
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

type CacheEntry<T> = { value: T; expiresAt: number }

type NominatimSearchItem = {
  lat: string
  lon: string
  display_name?: string
  address?: {
    city?: string
    town?: string
    village?: string
    county?: string
    state?: string
    region?: string
    province?: string
    country?: string
  }
}

@Injectable()
export class WeatherService {
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

  private normalizePlaceFromNominatim(it: NominatimSearchItem) {
    const addr = it.address ?? {}
    const name =
      addr.city ??
      addr.town ??
      addr.village ??
      addr.county ??
      (typeof it.display_name === 'string' ? it.display_name.split(',')[0]?.trim() : '') ??
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
          limit: 10,
          'accept-language': 'zh-CN',
        },
      })

      const list = (Array.isArray(data) ? data : [])
        .map((it) => this.normalizePlaceFromNominatim(it))
        .filter((x) => x.lat && x.lon && x.name)

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
      const last = this.cacheGet<any>(cacheKey)
      if (last) return { ...last, stale: true }
      throw e
    }
  }
}

