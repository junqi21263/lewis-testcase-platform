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

  /** mount：进入页拉新图；event：偏好已在服务端更新（如「换一张」），只同步 URL，避免重复请求 */
  const applyPreferences = (p: UserPreferences, source: 'mount' | 'event') => {
    setEnabled(!!p.wallpaperEnabled)

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!p.wallpaperEnabled) {
      setUrl(null)
      return
    }

    if ((p.wallpaperIntervalSec ?? 0) > 0) {
      intervalRef.current = window.setInterval(() => {
        void refresh(false)
      }, p.wallpaperIntervalSec * 1000)
    }

    if (source === 'mount') {
      setUrl(p.wallpaperCurrentUrl ?? null)
      void refresh(true)
      return
    }

    if (!p.wallpaperCurrentUrl) {
      setUrl(null)
      void refresh(true)
      return
    }

    const nextUrl = p.wallpaperCurrentUrl
    void preloadImage(nextUrl)
      .then(() => {
        setFading(true)
        setUrl(nextUrl)
        window.setTimeout(() => setFading(false), 350)
      })
      .catch(() => {})
  }

  useEffect(() => {
    let mounted = true
    preferencesApi
      .getMy()
      .then((p) => {
        if (!mounted) return
        applyPreferences(p, 'mount')
      })
      .catch(() => {})

    const onPrefsUpdated = () => {
      preferencesApi
        .getMy()
        .then((p) => {
          if (!mounted) return
          applyPreferences(p, 'event')
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
          // 轻遮罩：卡片已承担主要对比度，此处略减不透明度以露出更多壁纸
          'bg-gradient-to-b from-background/18 via-background/28 to-background/58 dark:from-background/22 dark:via-background/32 dark:to-background/62',
          fading ? 'opacity-80' : 'opacity-100',
          'transition-opacity duration-300',
        ].join(' ')}
      />
    </div>
  )
}

