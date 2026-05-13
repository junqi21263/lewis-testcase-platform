import { useEffect, useRef } from 'react'

type Pt = { x: number; y: number; vx: number; vy: number }

type Theme = 'light' | 'dark'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type Props = {
  theme: Theme
}

/**
 * 轻量 Canvas 粒子：颜色与透明度随登录深浅主题变化。
 */
export function LoginAmbientCanvas({ theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const ptsRef = useRef<Pt[]>([])
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    if (prefersReducedMotion()) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let w = 0
    let h = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const count = w < 640 ? 12 : 32
      const next: Pt[] = []
      for (let i = 0; i < count; i++) {
        next.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.1,
        })
      }
      ptsRef.current = next
    }

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: (e.clientX - rect.left) / Math.max(rect.width, 1),
        y: (e.clientY - rect.top) / Math.max(rect.height, 1),
      }
    }

    const tick = () => {
      if (w < 8 || h < 8) {
        raf = requestAnimationFrame(tick)
        return
      }
      const isDark = themeRef.current === 'dark'
      const lineAlpha = isDark ? 0.12 : 0.07
      const dotAlpha = isDark ? 0.32 : 0.2
      const pts = ptsRef.current
      const mx = mouseRef.current.x * w
      const my = mouseRef.current.y * h

      for (const p of pts) {
        const dx = p.x - mx
        const dy = p.y - my
        const d2 = dx * dx + dy * dy
        const repel = d2 < 220 * 220 && d2 > 1
        if (repel) {
          const inv = 420 / d2
          p.vx += dx * inv * 0.015
          p.vy += dy * inv * 0.015
        }
        p.vx *= 0.985
        p.vy *= 0.985
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -0.6
        if (p.y < 0 || p.y > h) p.vy *= -0.6
        p.x = Math.max(0, Math.min(w, p.x))
        p.y = Math.max(0, Math.min(h, p.y))
      }

      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 0.35
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]
          const b = pts[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < 105) {
            const alpha = (1 - d / 105) * lineAlpha
            const cool = (i + j) % 3 === 0
            ctx.strokeStyle = cool
              ? `rgba(34, 211, 238, ${alpha * 1.15})`
              : (i + j) % 3 === 1
                ? `rgba(167, 139, 250, ${alpha})`
                : isDark
                  ? `rgba(148, 163, 184, ${alpha * 0.9})`
                  : `rgba(100, 116, 139, ${alpha * 0.85})`
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
      }
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k]
        const hue = k % 3
        const base = dotAlpha
        ctx.fillStyle =
          hue === 0
            ? `rgba(94, 234, 212, ${base})`
            : hue === 1
              ? `rgba(196, 181, 253, ${base})`
              : isDark
                ? `rgba(148, 163, 184, ${base * 0.95})`
                : `rgba(100, 116, 139, ${base * 0.9})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.05, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(tick)
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
    }
  }, [theme])

  if (prefersReducedMotion()) return null

  return (
    <canvas
      ref={canvasRef}
      className="login-ambient-canvas pointer-events-none absolute inset-0 z-0 h-full w-full"
      aria-hidden
    />
  )
}
