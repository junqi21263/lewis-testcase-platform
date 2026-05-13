import { useId } from 'react'
import { cn } from '@/utils/cn'

export type LoginMascotEyesMode = 'track' | 'closed' | 'cautious'

export type LoginMascotMood = 'idle' | 'listening' | 'loading' | 'error' | 'success'

type Props = {
  look: { x: number; y: number }
  eyesMode: LoginMascotEyesMode
  mood: LoginMascotMood
  /** 密码已输入且隐藏时脸颊微光 */
  passwordHiddenGlow?: boolean
  className?: string
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

/**
 * Friendly AI companion：与品牌 icon 共享圆角与光色；状态以 opacity / transform 过渡为主。
 */
export function LoginMascot({ look, eyesMode, mood, passwordHiddenGlow, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const px = clamp(look.x, -1, 1) * 4.2
  const py = clamp(look.y, -1, 1) * 3.4

  const isError = mood === 'error'
  const isLoading = mood === 'loading'
  const isSuccess = mood === 'success'
  const listening = mood === 'listening'

  const showTrack = eyesMode === 'track'
  const showClosed = eyesMode === 'closed'
  const showCautious = eyesMode === 'cautious'

  return (
    <div
      className={cn(
        'relative flex justify-center',
        (mood === 'idle' || listening) && !isLoading && !isSuccess && 'login-mascot-idle-float',
        listening && 'login-mascot-listening',
        isLoading && 'login-mascot-body-pulse',
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 128 132"
        className="h-[7.5rem] w-[7.5rem] drop-shadow-[0_16px_42px_var(--lp-mascot-drop)] sm:h-[8.75rem] sm:w-[8.75rem]"
        role="img"
        aria-label=""
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--lp-mascot-body-a)" />
            <stop offset="45%" stopColor="var(--lp-mascot-body-b)" />
            <stop offset="100%" stopColor="var(--lp-mascot-body-c)" />
          </linearGradient>
          <linearGradient id={`${uid}-belly`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="var(--lp-mascot-belly-hi)" />
            <stop offset="100%" stopColor="var(--lp-mascot-belly-lo)" />
          </linearGradient>
          <linearGradient id={`${uid}-scan`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(34,211,238,0)" />
            <stop offset="50%" stopColor="rgba(34,211,238,0.45)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0)" />
          </linearGradient>
          <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse cx="64" cy="118" rx="28" ry="7" fill="var(--lp-mascot-shadow)" opacity="0.45" />

        <path
          d="M 64 18 L 64 10"
          stroke="var(--lp-mascot-antenna)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="64" cy="8" r="3.5" fill="var(--lp-mascot-antenna-cap)" />

        <path
          d="M 32 52 C 28 28 48 20 64 22 C 80 20 100 28 96 52 C 102 72 98 96 64 100 C 30 96 26 72 32 52 Z"
          fill={`url(#${uid}-body)`}
          stroke="var(--lp-mascot-stroke)"
          strokeWidth="1.15"
          filter={`url(#${uid}-soft)`}
        />
        <ellipse cx="64" cy="78" rx="36" ry="28" fill={`url(#${uid}-belly)`} opacity="0.55" />

        <g
          className="transition-opacity duration-300 ease-out"
          style={{ opacity: passwordHiddenGlow ? 0.55 : 0 }}
        >
          <ellipse cx="42" cy="68" rx="8" ry="5" fill="var(--lp-mascot-blush)" opacity="0.5" />
          <ellipse cx="86" cy="68" rx="8" ry="5" fill="var(--lp-mascot-blush)" opacity="0.5" />
        </g>

        {/* 睁眼追踪 */}
        <g
          className="transition-opacity duration-200 ease-out"
          style={{ opacity: showTrack && !isLoading && !isSuccess ? 1 : 0 }}
        >
          <ellipse cx="48" cy="58" rx="11" ry="12" fill="var(--lp-mascot-eye-white)" />
          <ellipse cx="80" cy="58" rx="11" ry="12" fill="var(--lp-mascot-eye-white)" />
          <circle cx={48 + px} cy={58 + py} r="4.2" fill="var(--lp-mascot-pupil)" />
          <circle cx={80 + px} cy={58 + py} r="4.2" fill="var(--lp-mascot-pupil)" />
          <circle cx={49 + px * 1.05} cy={56.5 + py * 1.05} r="1.35" fill="var(--lp-mascot-eye-shine)" />
          <circle cx={81 + px * 1.05} cy={56.5 + py * 1.05} r="1.35" fill="var(--lp-mascot-eye-shine)" />
        </g>

        {/* 闭眼 */}
        <g className="transition-opacity duration-200 ease-out" style={{ opacity: showClosed && !isSuccess ? 1 : 0 }}>
          <path
            d="M 38 58 Q 48 50 58 58"
            fill="none"
            stroke="var(--lp-mascot-lid)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M 70 58 Q 80 50 90 58"
            fill="none"
            stroke="var(--lp-mascot-lid)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <ellipse cx="64" cy="62" rx="30" ry="11" fill="var(--lp-mascot-hand)" opacity="0.42" />
        </g>

        {/* 谨慎偷看 */}
        <g className="transition-opacity duration-200 ease-out" style={{ opacity: showCautious && !isSuccess ? 1 : 0 }}>
          <path
            d="M 70 58 Q 80 50 90 58"
            fill="none"
            stroke="var(--lp-mascot-lid)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <ellipse cx="48" cy="58" rx="11" ry="12" fill="var(--lp-mascot-eye-white)" />
          <circle cx={47 + px * 0.35} cy={58 + py * 0.35} r="3.2" fill="var(--lp-mascot-pupil)" />
          <circle cx={48 + px * 0.4} cy={57 + py * 0.4} r="1" fill="var(--lp-mascot-eye-shine)" />
          <path
            d="M 40 52 Q 48 48 56 52"
            fill="none"
            stroke="var(--lp-mascot-lid)"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>

        {/* 成功：弯弯笑眼 */}
        <g className="transition-opacity duration-300 ease-out" style={{ opacity: isSuccess ? 1 : 0 }}>
          <path
            d="M 38 60 Q 48 50 58 60"
            fill="none"
            stroke="var(--lp-mascot-pupil)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M 70 60 Q 80 50 90 60"
            fill="none"
            stroke="var(--lp-mascot-pupil)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="34" cy="48" r="1.2" fill="var(--lp-mascot-spark)" className="login-mascot-star-a" />
          <circle cx="94" cy="46" r="1" fill="var(--lp-mascot-spark)" className="login-mascot-star-b" />
          <circle cx="88" cy="54" r="0.8" fill="var(--lp-mascot-spark)" className="login-mascot-star-c" />
        </g>

        {/* 扫描（登录中） */}
        <g className="transition-opacity duration-200" style={{ opacity: isLoading ? 1 : 0 }}>
          <rect x="34" y="44" width="60" height="32" rx="12" fill={`url(#${uid}-scan)`} className="login-mascot-scan-rect" />
          <line
            x1="34"
            x2="94"
            y1="58"
            y2="58"
            stroke="var(--lp-mascot-scan-line)"
            strokeWidth="1.2"
            strokeDasharray="4 6"
            className="login-mascot-scan-line"
          />
        </g>

        {/* 嘴巴：常态 / 困惑 / 开心 */}
        <g className="transition-opacity duration-200" style={{ opacity: !isError && !isSuccess ? 1 : 0 }}>
          <path
            d="M 50 86 Q 64 96 78 86"
            fill="none"
            stroke="var(--lp-mascot-mouth)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <g className="transition-opacity duration-200" style={{ opacity: isError ? 1 : 0 }}>
          <path
            d="M 50 90 Q 64 78 78 90"
            fill="none"
            stroke="var(--lp-mascot-mouth-worry)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <g className="transition-opacity duration-300" style={{ opacity: isSuccess ? 1 : 0 }}>
          <path
            d="M 48 84 Q 64 96 80 84"
            fill="none"
            stroke="var(--lp-mascot-mouth-happy)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>

        <circle cx="52" cy="102" r="2.2" fill="var(--lp-mascot-glow-a)" opacity="0.85" />
        <circle cx="76" cy="100" r="1.6" fill="var(--lp-mascot-glow-b)" opacity="0.75" />
      </svg>
    </div>
  )
}
