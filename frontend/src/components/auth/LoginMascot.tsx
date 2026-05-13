import { cn } from '@/utils/cn'

export type LoginMascotEyesMode = 'track' | 'closed' | 'cautious'

export type LoginMascotMood = 'idle' | 'listening' | 'loading' | 'error'

type Props = {
  /** 相对 SVG 视图盒的 -1~1，用于瞳孔偏移 */
  look: { x: number; y: number }
  eyesMode: LoginMascotEyesMode
  /** 额外情绪：倾听用户名 / 登录中 / 失败困惑 */
  mood: LoginMascotMood
  className?: string
}

/**
 * SVG 小助手：瞳孔随 look；密码态 closed / cautious（单眼偷看）；
 * loading 扫描线；error 困惑嘴型；listening 轻微点头动画（外层）。
 */
export function LoginMascot({ look, eyesMode, mood, className }: Props) {
  const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
  const px = clamp(look.x, -1, 1) * 3.2
  const py = clamp(look.y, -1, 1) * 2.8

  const isError = mood === 'error'
  const isLoading = mood === 'loading'
  const listening = mood === 'listening'

  return (
    <div
      className={cn('relative flex justify-center', listening && 'login-mascot-listening', className)}
      aria-hidden
    >
      <svg
        viewBox="0 0 120 120"
        className="h-28 w-28 text-slate-200/95 drop-shadow-[0_16px_48px_rgba(56,189,248,0.18)] sm:h-36 sm:w-36"
        role="img"
        aria-label=""
      >
        <defs>
          <linearGradient id="login-bot-head" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(71 85 105)" />
            <stop offset="55%" stopColor="rgb(51 65 85)" />
            <stop offset="100%" stopColor="rgb(30 41 59)" />
          </linearGradient>
          <linearGradient id="login-bot-glass" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.2)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
          <linearGradient id="login-bot-scan" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(34,211,238,0)" />
            <stop offset="45%" stopColor="rgba(34,211,238,0.35)" />
            <stop offset="55%" stopColor="rgba(167,139,250,0.35)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0)" />
          </linearGradient>
        </defs>
        <rect x="18" y="22" width="84" height="78" rx="24" fill="url(#login-bot-head)" stroke="rgba(148,163,184,0.4)" strokeWidth="1" />
        <rect x="22" y="26" width="76" height="36" rx="16" fill="url(#login-bot-glass)" />

        {/* 眼睛 */}
        {eyesMode === 'closed' ? (
          <>
            <path
              d="M 38 58 Q 50 52 62 58"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-slate-400"
            />
            <path
              d="M 58 58 Q 70 52 82 58"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-slate-400"
            />
            <ellipse cx="60" cy="62" rx="26" ry="10" fill="rgb(71 85 105)" opacity="0.5" />
            <ellipse cx="60" cy="60" rx="24" ry="8" fill="rgb(100 116 139)" opacity="0.72" />
          </>
        ) : eyesMode === 'cautious' ? (
          <>
            {/* 右眼弯线「不好意思看」 */}
            <path
              d="M 58 58 Q 70 52 82 58"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-slate-400"
            />
            {/* 左眼偷看 */}
            <circle cx="50" cy="56" r="7.5" fill="rgb(15 23 42)" stroke="rgba(148,163,184,0.5)" strokeWidth="1" />
            <circle cx={49 + px * 0.35} cy={56 + py * 0.35} r="2.4" fill="rgb(226 232 240)" />
            <circle cx={50 + px * 0.4} cy={55 + py * 0.4} r="0.85" fill="rgb(15 23 42)" />
            {/* 半遮 */}
            <path d="M 42 52 Q 50 48 58 52" fill="none" stroke="rgba(100,116,139,0.85)" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="50" cy="56" r="8" fill="rgb(15 23 42)" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
            <circle cx="70" cy="56" r="8" fill="rgb(15 23 42)" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
            <circle cx={50 + px} cy={56 + py} r="3.2" fill="rgb(226 232 240)" />
            <circle cx={70 + px} cy={56 + py} r="3.2" fill="rgb(226 232 240)" />
            <circle cx={50 + px * 1.1} cy={55 + py * 1.1} r="1.1" fill="rgb(15 23 42)" />
            <circle cx={70 + px * 1.1} cy={55 + py * 1.1} r="1.1" fill="rgb(15 23 42)" />
          </>
        )}

        {/* 嘴：常态微笑 / 困惑 */}
        {isError ? (
          <path
            d="M 48 82 Q 60 74 72 82"
            fill="none"
            stroke="rgba(251,191,36,0.65)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M 48 78 Q 60 84 72 78"
            fill="none"
            stroke="rgba(148,163,184,0.45)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )}

        <circle cx="60" cy="92" r="3.2" fill="rgba(56, 189, 248, 0.4)" />
        <circle cx="54" cy="90" r="1.2" fill="rgba(167, 139, 250, 0.35)" />

        {isLoading && (
          <>
            <rect x="22" y="34" width="76" height="44" rx="14" fill="url(#login-bot-scan)" className="login-mascot-scan" />
            <circle cx="60" cy="100" r="2" fill="rgba(34,211,238,0.6)" className="login-mascot-pulse-dot" />
          </>
        )}
      </svg>
    </div>
  )
}
