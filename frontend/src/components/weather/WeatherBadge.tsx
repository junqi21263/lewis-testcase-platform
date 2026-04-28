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
    preferencesApi
      .getMy()
      .then((p) => {
        if (!mounted) return
        setPrefs(p)
      })
      .catch(() => setPrefs(null))
    return () => {
      mounted = false
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

  const onClick = () => navigate('/settings')

  return (
    <button onClick={onClick} className="hidden md:block">
      <Badge variant="secondary" className="gap-2">
        <span className="max-w-[6rem] truncate">{cityLabel}</span>
        {prefs?.weatherCityId ? (
          now?.temp !== null && now?.temp !== undefined ? (
            <span className={now.stale ? 'text-muted-foreground' : ''}>
              {now.temp}° {now.text ?? ''}
            </span>
          ) : (
            <span className="text-muted-foreground">加载中</span>
          )
        ) : (
          <span className="text-muted-foreground">点击设置</span>
        )}
      </Badge>
    </button>
  )
}

