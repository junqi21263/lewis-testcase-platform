import { useEffect, useMemo, useState } from 'react'
import { preferencesApi } from '@/api/preferences'
import { weatherApi, type WeatherNow } from '@/api/weather'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/utils/cn'
import {
  loadAppearanceUiPrefs,
  type SettingsAppearanceUiPrefs,
} from '@/utils/settingsAppearancePrefs'
import { resolveWeatherCondition, type WeatherCondition } from '@/utils/weatherCondition'

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

export function WeatherAtmosphereLayer() {
  const theme = useThemeStore((s) => s.theme)
  const reducedMotion = useReducedMotion()
  const [prefs, setPrefs] = useState<SettingsAppearanceUiPrefs>(() => loadAppearanceUiPrefs())
  const [cityId, setCityId] = useState<string | null>(null)
  const [now, setNow] = useState<WeatherNow | null>(null)

  useEffect(() => {
    const refreshUi = () => setPrefs(loadAppearanceUiPrefs())
    window.addEventListener('settings-appearance-ui-updated', refreshUi)
    return () => window.removeEventListener('settings-appearance-ui-updated', refreshUi)
  }, [])

  useEffect(() => {
    let mounted = true
    preferencesApi
      .getMy()
      .then((p) => {
        if (!mounted) return
        setCityId(p.weatherCityId ?? null)
      })
      .catch(() => {})
    const onPrefs = () => {
      preferencesApi
        .getMy()
        .then((p) => {
          if (!mounted) return
          setCityId(p.weatherCityId ?? null)
        })
        .catch(() => {})
    }
    window.addEventListener('user-preferences-updated', onPrefs)
    return () => {
      mounted = false
      window.removeEventListener('user-preferences-updated', onPrefs)
    }
  }, [])

  useEffect(() => {
    if (!cityId) return
    let mounted = true
    const fetchNow = () =>
      weatherApi.current(cityId).then((r) => {
        if (mounted) setNow(r)
      })
    void fetchNow()
    const t = window.setInterval(() => void fetchNow(), 10 * 60_000)
    return () => {
      mounted = false
      window.clearInterval(t)
    }
  }, [cityId])

  const condition: WeatherCondition = useMemo(() => {
    if (prefs.weatherEffectMode === 'off') return 'default'
    if (prefs.weatherEffectMode === 'manual') return prefs.manualWeatherCondition
    return resolveWeatherCondition(now)
  }, [prefs, now])

  const staticOnly =
    reducedMotion ||
    prefs.lowPowerMode ||
    prefs.motionLevel === 'low'

  if (prefs.weatherEffectMode === 'off') return null

  return (
    <div
      className={cn(
        'weather-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden',
        `weather-atmosphere--${condition}`,
        theme === 'dark' ? 'weather-atmosphere--dark' : 'weather-atmosphere--light',
        staticOnly && 'weather-atmosphere--static',
        prefs.readabilityMask && 'weather-atmosphere--readable',
        prefs.reduceWallpaperBrightness && 'weather-atmosphere--dim',
        prefs.reduceMotionOpacity && 'weather-atmosphere--soft',
      )}
      aria-hidden
    >
      <div className="weather-atmosphere__base absolute inset-0" />
      <div className="weather-atmosphere__glow absolute inset-0" />
      {!staticOnly ? (
        <>
          <div className="weather-atmosphere__particles absolute inset-0" />
          {condition === 'thunder' ? (
            <div className="weather-atmosphere__flash absolute inset-0" />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
