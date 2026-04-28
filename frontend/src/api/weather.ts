import { request } from '@/utils/request'

export interface WeatherCityItem {
  id: string
  name: string
  adm1: string
  adm2: string
  country: string
  lat?: string
  lon?: string
}

export interface WeatherNow {
  locationId: string
  updateTime: string | null
  obsTime: string | null
  temp: number | null
  feelsLike: number | null
  text: string | null
  icon: string | null
  windDir: string | null
  windScale: string | null
  humidity: number | null
  stale: boolean
}

export const weatherApi = {
  cities: (query: string) => request.get<WeatherCityItem[]>('/weather/cities', { params: { query } }),
  current: (cityId: string) => request.get<WeatherNow>('/weather/current', { params: { cityId } }),
}

