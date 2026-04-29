import { useEffect, useMemo, useRef, useState } from 'react'
import { preferencesApi, type UserPreferences } from '@/api/preferences'
import { wallpaperApi } from '@/api/wallpaper'

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('failed to load image'))
    img.src = url
  })
}

export function WallpaperLayer() {
  const [enabled, setEnabled] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [fading, setFading] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)
  urlRef.current = url

  const style = useMemo(() => {
    if (!enabled || !url) return undefined
    return { backgroundImage: `url("${url}")` } as const
  }, [enabled, url])

  const refresh = async (force: boolean) => {
    try {
      const res = await wallpaperApi.next({ force })
      // 接口失败或未返回 url 时保留当前展示，避免误把用户已开启的壁纸关掉
      if (!res?.url) return
      if (res.enabled === false) {
        setEnabled(false)
        setUrl(null)
        return
      }
      if (res.url === urlRef.current) return
      await preloadImage(res.url)
      setFading(true)
      setUrl(res.url)
      window.setTimeout(() => setFading(false), 350)
    } catch {
      /* 保持 preferences 里已有的 url */
    }
  }

  const applyPreferences = (p: UserPreferences) => {
    setEnabled(!!p.wallpaperEnabled)
    setUrl(p.wallpaperCurrentUrl ?? null)

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (p.wallpaperEnabled) {
      void refresh(true)
      if ((p.wallpaperIntervalSec ?? 0) > 0) {
        intervalRef.current = window.setInterval(() => {
          void refresh(false)
        }, p.wallpaperIntervalSec * 1000)
      }
    } else {
      setUrl(null)
    }
  }

  useEffect(() => {
    let mounted = true
    preferencesApi
      .getMy()
      .then((p) => {
        if (!mounted) return
        applyPreferences(p)
      })
      .catch(() => {})

    const onPrefsUpdated = () => {
      preferencesApi
        .getMy()
        .then((p) => {
          if (!mounted) return
          applyPreferences(p)
        })
        .catch(() => {})
    }
    window.addEventListener('user-preferences-updated', onPrefsUpdated)

    return () => {
      mounted = false
      if (intervalRef.current) window.clearInterval(intervalRef.current)
      window.removeEventListener('user-preferences-updated', onPrefsUpdated)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!enabled || !url) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-300"
        style={style}
      />
      <div
        className={[
          'absolute inset-0',
          // 轻微遮罩，避免影响可读性
          'bg-gradient-to-b from-background/30 via-background/40 to-background/70',
          fading ? 'opacity-80' : 'opacity-100',
          'transition-opacity duration-300',
        ].join(' ')}
      />
    </div>
  )
}

