import { useId } from 'react'
import { cn } from '@/utils/cn'

interface FriendlyBrandIconProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  sm: 'h-8 w-8 rounded-[12px]',
  md: 'h-11 w-11 rounded-[16px]',
  lg: 'h-14 w-14 rounded-[20px]',
}

/**
 * Shared product mark: a small smiling AI core with testcase flow nodes.
 * It intentionally avoids text so it can work in collapsed navigation and app surfaces.
 */
export function FriendlyBrandIcon({ className, size = 'md' }: FriendlyBrandIconProps) {
  const uid = useId().replace(/:/g, '')

  return (
    <span
      className={cn(
        'group/brand relative inline-flex shrink-0 overflow-hidden p-0.5',
        'bg-[linear-gradient(135deg,#7dd3fc_0%,#6366f1_48%,#34d399_100%)]',
        'shadow-[0_16px_34px_-16px_rgba(56,189,248,0.62)] ring-1 ring-white/30',
        'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'hover:-translate-y-0.5 hover:shadow-[0_22px_44px_-18px_rgba(129,140,248,0.7)]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        sizeMap[size],
        className,
      )}
      aria-hidden
    >
      <span className="app-brand-shine pointer-events-none absolute inset-0" />
      <svg viewBox="0 0 48 48" className="relative z-[1] h-full w-full" role="img" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-face`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.3)" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <rect x="1.5" y="1.5" width="45" height="45" rx="15" fill="rgba(255,255,255,0.1)" />
        <path
          d="M14 30v-7.3c0-3.8 3.1-6.9 6.9-6.9h6.2c3.8 0 6.9 3.1 6.9 6.9V30"
          fill="none"
          stroke="rgba(255,255,255,0.64)"
          strokeWidth="1.45"
          strokeLinecap="round"
        />
        <path
          d="M24 15.8V10.5M17.4 17.5l-3.6-3.1M30.6 17.5l3.6-3.1"
          fill="none"
          stroke="rgba(255,255,255,0.54)"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <circle cx="24" cy="10.1" r="2" fill="rgba(254,240,138,0.95)" />
        <circle cx="13.2" cy="13.7" r="1.7" fill="rgba(167,243,208,0.95)" />
        <circle cx="34.8" cy="13.7" r="1.7" fill="rgba(191,219,254,0.95)" />
        <rect x="12" y="19" width="24" height="19" rx="8" fill={`url(#${uid}-face)`} />
        <circle cx="20.4" cy="27" r="2" fill="#172033" />
        <circle cx="27.6" cy="27" r="2" fill="#172033" />
        <path
          d="M20.9 32.2c1.7 1.3 4.5 1.3 6.2 0"
          fill="none"
          stroke="#172033"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <circle cx="17" cy="30.6" r="1.5" fill="rgba(251,182,206,0.55)" />
        <circle cx="31" cy="30.6" r="1.5" fill="rgba(251,182,206,0.55)" />
        <circle cx="35" cy="10" r="6" fill={`url(#${uid}-glow)`} opacity="0.36" />
      </svg>
    </span>
  )
}
