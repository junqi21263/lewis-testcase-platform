import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { preferencesApi, type UserPreferences } from '@/api/preferences'
import { weatherApi, type WeatherNow } from '@/api/weather'
import { Badge } from '@/components/ui/badge'

export function WeatherBadge() {
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<UserPreferences | null>(null)
  const [now, setNow] = useState<WeatherNow | null>(null)

  const cityLabel = useMemo(() => {
    if (!prefs?.weatherCityName) return '未设置城市'
    const parts = [prefs.weatherCityName]
    if (prefs.weatherCityAdm1) parts.push(prefs.weatherCityAdm1)
    return parts[0]
  }, [prefs])

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
    <button type="button" onClick={onClick} className="hidden md:block">
      <Badge
        variant="secondary"
        className="gap-2 rounded-full border border-workspace-panel-border/55 bg-workspace-control/90 px-3 py-1.5 text-xs font-medium text-workspace-text-primary shadow-[0_10px_26px_-16px_rgba(15,23,42,0.12)] backdrop-blur-md hover:bg-workspace-control dark:border-white/10 dark:bg-workspace-control/90 dark:text-workspace-text-primary dark:shadow-[0_12px_28px_-16px_rgba(0,0,0,0.4)]"
      >
        <span className="max-w-[6rem] truncate text-workspace-text-primary">{cityLabel}</span>
        {prefs?.weatherCityId ? (
          now?.temp !== null && now?.temp !== undefined ? (
            <span className={now.stale ? 'text-workspace-text-muted' : 'text-workspace-text-secondary'}>
              {now.temp}° {now.text ?? ''}
            </span>
          ) : (
            <span className="text-workspace-text-muted">加载中</span>
          )
        ) : (
          <span className="text-workspace-text-muted">点击设置</span>
        )}
      </Badge>
    </button>
  )
}

