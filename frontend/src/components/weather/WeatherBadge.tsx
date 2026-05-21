import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { preferencesApi, type UserPreferences } from '@/api/preferences'
import { weatherApi, type WeatherNow } from '@/api/weather'
import { WeatherIcon } from '@/components/weather/WeatherIcon'
import { cn } from '@/utils/cn'
import { resolveWeatherCondition } from '@/utils/weatherCondition'

export function WeatherBadge() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [now, setNow] = useState<WeatherNow | null>(null)

  const cityLabel = useMemo(() => {
    if (!prefs?.weatherCityName) return '未设置城市'
    return prefs.weatherCityName
  }, [prefs])

  const condition = useMemo(() => resolveWeatherCondition(now), [now])

  const fullTitle = useMemo(() => {
    if (!prefs?.weatherCityId) return '未设置城市 · 点击设置'
    const parts = [cityLabel]
    if (prefs.weatherCityAdm1) parts.push(prefs.weatherCityAdm1)
    if (now?.temp != null) parts.push(`${now.temp}°`)
    if (now?.text) parts.push(now.text)
    return parts.join(' · ')
  }, [prefs, cityLabel, now])

  useEffect(() => {
    let mounted = true
    const refreshPrefs = () =>
      preferencesApi
        .getMy()
        .then((p) => {
          if (!mounted) return
          setPrefs(p)
        })
        .catch(() => setPrefs(null))

    refreshPrefs()
    const onUpdated = () => refreshPrefs()
    window.addEventListener('user-preferences-updated', onUpdated)
    return () => {
      mounted = false
      window.removeEventListener('user-preferences-updated', onUpdated)
    }
  }, [])

  useEffect(() => {
    if (!prefs?.weatherCityId) return
    let mounted = true
    const fetchNow = () =>
      weatherApi
        .current(prefs.weatherCityId!)
        .then((r) => {
          if (!mounted) return
          setNow(r)
        })
        .catch(() => {})

    fetchNow()
    const t = window.setInterval(fetchNow, 10 * 60_000)
    return () => {
      mounted = false
      window.clearInterval(t)
    }
  }, [prefs?.weatherCityId])

  const onClick = () => navigate('/settings#appearance-weather')

  return (
    <button
      type="button"
      onClick={onClick}
      title={fullTitle}
      className={cn(
        'weather-pill group/weather hidden max-w-[min(100%,14rem)] md:inline-flex',
        'h-9 min-h-9 items-center gap-2 rounded-full border px-3 py-1.5',
        'border-[hsl(var(--settings-weather-pill-border))] bg-[hsl(var(--settings-weather-pill-bg))]',
        'text-xs font-medium text-[hsl(var(--settings-text-primary))]',
        'shadow-[var(--settings-weather-pill-shadow)] backdrop-blur-md',
        'transition-[background-color,border-color,box-shadow] duration-200',
        'hover:border-[hsl(var(--settings-card-border-hover))] hover:shadow-[var(--settings-card-shadow-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--settings-input-focus))]/35',
        'motion-reduce:transition-none',
      )}
    >
      <WeatherIcon condition={prefs?.weatherCityId ? condition : 'default'} size={17} />
      <span className="hidden min-w-0 truncate sm:inline max-w-[5rem]">{cityLabel}</span>
      {prefs?.weatherCityId ? (
        now?.temp !== null && now?.temp !== undefined ? (
          <>
            <span
              className={cn(
                'tabular-nums shrink-0',
                now.stale
                  ? 'text-[hsl(var(--settings-text-muted))]'
                  : 'text-[hsl(var(--settings-text-secondary))]',
              )}
            >
              {now.temp}°
            </span>
            <span className="hidden min-w-0 truncate text-[hsl(var(--settings-text-muted))] lg:inline max-w-[4.5rem]">
              {now.text ?? ''}
            </span>
          </>
        ) : (
          <span className="text-[hsl(var(--settings-text-muted))]">加载中</span>
        )
      ) : (
        <span className="truncate text-[hsl(var(--settings-text-muted))]">点击设置</span>
      )}
    </button>
  )
}
