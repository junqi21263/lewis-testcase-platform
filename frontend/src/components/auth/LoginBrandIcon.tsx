import { useId } from 'react'
import { cn } from '@/utils/cn'

/**
 * 产品品牌符号：圆角 tile + 芯片底座 + 节点连线与中心光核（与吉祥物同系渐变，无「AI」字样）。
 */
export function LoginBrandIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '')

  return (
    <div
      className={cn(
        'login-brand-icon group/brand relative inline-flex shrink-0 rounded-[15px] p-0.5',
        'shadow-[0_14px_36px_-12px_var(--lp-brand-shadow)] ring-1 ring-white/25 dark:ring-white/15',
        'transition-[transform,box-shadow] duration-300 ease-out',
        'hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-10px_var(--lp-brand-shadow-hover)]',
        'motion-reduce:transform-none motion-reduce:hover:transform-none',
        className,
      )}
      aria-hidden
    >
      <div className="login-brand-icon-shine pointer-events-none absolute inset-0 overflow-hidden rounded-[13px]" />
      <svg
        viewBox="0 0 48 48"
        className="relative z-[1] h-12 w-12 rounded-[13px]"
        role="img"
        aria-label=""
      >
        <defs>
          <linearGradient id={`${uid}-tile`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--lp-brand-g1)" />
            <stop offset="50%" stopColor="var(--lp-brand-g2)" />
            <stop offset="100%" stopColor="var(--lp-brand-g3)" />
          </linearGradient>
          <linearGradient id={`${uid}-core`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="var(--lp-brand-core-hi)" />
            <stop offset="100%" stopColor="var(--lp-brand-core-lo)" />
          </linearGradient>
          <radialGradient id={`${uid}-spark`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--lp-brand-spark)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--lp-brand-spark)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="14" fill={`url(#${uid}-tile)`} />
        <rect x="9" y="28" width="30" height="11" rx="4" fill="var(--lp-brand-chip)" opacity="0.92" />
        <path
          d="M 14 28 V 22 Q 14 18 18 18 H 22"
          fill="none"
          stroke="var(--lp-brand-wire)"
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 34 28 V 22 Q 34 18 30 18 H 26"
          fill="none"
          stroke="var(--lp-brand-wire)"
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M 24 18 V 12"
          fill="none"
          stroke="var(--lp-brand-wire)"
          strokeWidth="1.35"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="18" cy="17" r="2.2" fill="var(--lp-brand-node)" />
        <circle cx="24" cy="11" r="2.4" fill="var(--lp-brand-node)" />
        <circle cx="30" cy="17" r="2.2" fill="var(--lp-brand-node)" />
        <circle cx="24" cy="21" r="7.5" fill={`url(#${uid}-core)`} opacity="0.95" />
        <circle cx="21" cy="20" r="1.1" fill="var(--lp-brand-eye)" />
        <circle cx="27" cy="20" r="1.1" fill="var(--lp-brand-eye)" />
        <circle className="login-brand-twinkle origin-center" cx="31" cy="13" r="1.6" fill={`url(#${uid}-spark)`} />
      </svg>
    </div>
  )
}
