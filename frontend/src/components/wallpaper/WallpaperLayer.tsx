import { useEffect, useMemo, useRef, useState } from 'react'
import { preferencesApi } from '@/api/preferences'
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

  const style = useMemo(() => {
    if (!enabled || !url) return undefined
    return { backgroundImage: `url("${url}")` } as const
  }, [enabled, url])

  const refresh = async (force: boolean) => {
    const res = await wallpaperApi.next({ force })
    if (!res.enabled || !res.url) {
      setEnabled(false)
      setUrl(null)
      return
    }
    if (res.url === url) return
    await preloadImage(res.url)
    setFading(true)
    setUrl(res.url)
    window.setTimeout(() => setFading(false), 350)
  }

  useEffect(() => {
    let mounted = true
    preferencesApi
      .getMy()
      .then((p) => {
        if (!mounted) return
        setEnabled(!!p.wallpaperEnabled)
        setUrl(p.wallpaperCurrentUrl ?? null)

        if (p.wallpaperEnabled) {
          // intervalSec=0 时，页面进入“主动换一张”
          refresh(true).catch(() => {})

          if ((p.wallpaperIntervalSec ?? 0) > 0) {
            if (intervalRef.current) window.clearInterval(intervalRef.current)
            intervalRef.current = window.setInterval(() => {
              refresh(false).catch(() => {})
            }, p.wallpaperIntervalSec * 1000)
          }
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!enabled || !url) return null

  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
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

