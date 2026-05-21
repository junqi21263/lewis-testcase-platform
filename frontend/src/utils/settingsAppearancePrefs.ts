import type { WeatherCondition } from '@/utils/weatherCondition'

const STORAGE_KEY = 'settings-appearance-ui-v1'

export type WeatherEffectMode = 'follow' | 'manual' | 'off'
export type MotionLevel = 'low' | 'medium' | 'high'

export interface SettingsAppearanceUiPrefs {
  weatherEffectMode: WeatherEffectMode
  manualWeatherCondition: WeatherCondition
  motionLevel: MotionLevel
  readabilityMask: boolean
  reduceWallpaperBrightness: boolean
  reduceMotionOpacity: boolean
  lowPowerMode: boolean
}

const DEFAULTS: SettingsAppearanceUiPrefs = {
  weatherEffectMode: 'follow',
  manualWeatherCondition: 'default',
  motionLevel: 'medium',
  readabilityMask: true,
  reduceWallpaperBrightness: true,
  reduceMotionOpacity: true,
  lowPowerMode: false,
}

export function loadAppearanceUiPrefs(): SettingsAppearanceUiPrefs {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<SettingsAppearanceUiPrefs>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveAppearanceUiPrefs(patch: Partial<SettingsAppearanceUiPrefs>): SettingsAppearanceUiPrefs {
  const next = { ...loadAppearanceUiPrefs(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('settings-appearance-ui-updated'))
  return next
}
