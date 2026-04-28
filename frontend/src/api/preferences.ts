import { request } from '@/utils/request'

export interface UserPreferences {
  id: string
  userId: string
  wallpaperEnabled: boolean
  wallpaperProvider: string
  wallpaperIntervalSec: number
  wallpaperCurrentUrl?: string | null
  wallpaperLastAt?: string | null
  weatherCityId?: string | null
  weatherCityName?: string | null
  weatherCityAdm1?: string | null
  weatherCityCountry?: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateUserPreferences = Partial<
  Pick<
    UserPreferences,
    | 'wallpaperEnabled'
    | 'wallpaperProvider'
    | 'wallpaperIntervalSec'
    | 'weatherCityId'
    | 'weatherCityName'
    | 'weatherCityAdm1'
    | 'weatherCityCountry'
  >
>

export const preferencesApi = {
  getMy: () => request.get<UserPreferences>('/preferences/me'),
  updateMy: (data: UpdateUserPreferences) => request.patch<UserPreferences>('/preferences/me', data),
}

