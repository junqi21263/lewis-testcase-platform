import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import axios from 'axios'

type QWeatherCityLookupResponse = {
  code: string
  location?: Array<{
    id: string
    name: string
    adm1?: string
    adm2?: string
    country?: string
    lat?: string
    lon?: string
  }>
}

type QWeatherNowResponse = {
  code: string
  updateTime?: string
  now?: {
    obsTime?: string
    temp?: string
    feelsLike?: string
    text?: string
    icon?: string
    windDir?: string
    windScale?: string
    humidity?: string
  }
}

type CacheEntry<T> = { value: T; expiresAt: number }

@Injectable()
export class WeatherService {
  private cache = new Map<string, CacheEntry<any>>()

  private get apiKey(): string {
    const k = process.env.QWEATHER_API_KEY || process.env.WEATHER_API_KEY || ''
    if (!k) throw new BadRequestException('未配置天气 API Key（QWEATHER_API_KEY）')
    return k
  }

  private geoHost(): string {
    return (process.env.QWEATHER_GEO_HOST || 'https://geoapi.qweather.com').replace(/\/+$/, '')
  }

  private weatherHost(): string {
    return (process.env.QWEATHER_WEATHER_HOST || 'https://devapi.qweather.com').replace(
      /\/+$/,
      '',
    )
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

  async cityLookup(query: string) {
    const q = query.trim()
    if (!q) return []

    const cacheKey = `city:${q}`
    const cached = this.cacheGet<any[]>(cacheKey)
    if (cached) return cached

    const url = `${this.geoHost()}/v2/city/lookup`
    const { data } = await axios.get<QWeatherCityLookupResponse>(url, {
      timeout: 10_000,
      headers: { 'X-QW-Api-Key': this.apiKey },
      params: { location: q, range: 'cn', number: 10, lang: 'zh-hans' },
    })
    if (data.code !== '200') throw new ServiceUnavailableException(`城市查询失败（code=${data.code}）`)

    const list =
      data.location?.map((c) => ({
        id: c.id,
        name: c.name,
        adm1: c.adm1 ?? '',
        adm2: c.adm2 ?? '',
        country: c.country ?? '',
        lat: c.lat ?? '',
        lon: c.lon ?? '',
      })) ?? []

    this.cacheSet(cacheKey, list, 60_000)
    return list
  }

  async now(locationId: string) {
    const loc = locationId.trim()
    if (!loc) throw new BadRequestException('缺少 locationId')

    const cacheKey = `now:${loc}`
    const cached = this.cacheGet<any>(cacheKey)
    if (cached) return { ...cached, stale: false }

    const url = `${this.weatherHost()}/v7/weather/now`
    try {
      const { data } = await axios.get<QWeatherNowResponse>(url, {
        timeout: 10_000,
        headers: { 'X-QW-Api-Key': this.apiKey },
        params: { location: loc, lang: 'zh-hans', unit: 'm' },
      })
      if (data.code !== '200') throw new ServiceUnavailableException(`天气查询失败（code=${data.code}）`)

      const result = {
        locationId: loc,
        updateTime: data.updateTime ?? null,
        obsTime: data.now?.obsTime ?? null,
        temp: data.now?.temp ? Number(data.now.temp) : null,
        feelsLike: data.now?.feelsLike ? Number(data.now.feelsLike) : null,
        text: data.now?.text ?? null,
        icon: data.now?.icon ?? null,
        windDir: data.now?.windDir ?? null,
        windScale: data.now?.windScale ?? null,
        humidity: data.now?.humidity ? Number(data.now.humidity) : null,
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

