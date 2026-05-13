import { cn } from '@/utils/cn'

/**
 * 仅围绕吉祥物的装饰；深浅色用 Tailwind dark: 与 html.dark 对齐。
 */
export function LoginMascotStageDecor() {
  const pill =
    'login-tag-pill absolute z-[1] inline-flex max-w-[10rem] items-center rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide shadow-md backdrop-blur-md sm:text-[11px]'

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      <span
        className={cn(
          pill,
          'login-float-e left-[2%] top-[6%] border-emerald-500/25 bg-emerald-500/15 text-emerald-950 dark:border-emerald-400/25 dark:bg-emerald-400/12 dark:text-emerald-50',
        )}
      >
        团队已同步
      </span>
      <span
        className={cn(
          pill,
          'login-float-b right-[0%] top-[10%] border-violet-400/25 bg-violet-500/15 text-violet-950 dark:border-violet-400/25 dark:bg-violet-500/12 dark:text-violet-50',
        )}
      >
        已生成 24 条用例
      </span>
      <span
        className={cn(
          pill,
          'login-float-c left-[4%] bottom-[14%] border-orange-300/30 bg-orange-400/14 text-orange-950 dark:border-orange-300/25 dark:bg-orange-400/12 dark:text-orange-50',
        )}
      >
        需求已映射
      </span>
      <span
        className={cn(
          pill,
          'login-float-d left-[-2%] top-[44%] border-sky-300/30 bg-sky-400/14 text-sky-950 dark:border-sky-400/22 dark:bg-sky-400/12 dark:text-sky-50',
        )}
      >
        AI 建议
      </span>
      <span
        className={cn(
          pill,
          'login-float-a right-[2%] bottom-[10%] border-amber-300/35 bg-amber-200/25 text-amber-950 dark:border-amber-200/30 dark:bg-amber-300/12 dark:text-amber-50',
        )}
      >
        Review ready
      </span>

      <div className="login-float-b absolute bottom-[20%] left-[6%] z-[1] w-[7.25rem] rounded-xl border border-slate-200/60 bg-white/70 p-2 shadow-lg backdrop-blur-md dark:border-white/12 dark:bg-slate-950/35">
        <div className="mb-1.5 h-1 w-7 rounded-full bg-cyan-500/60 dark:bg-cyan-400/50" />
        <div className="space-y-1">
          <div className="h-0.5 rounded-full bg-slate-300/80 dark:bg-white/20" />
          <div className="h-0.5 w-[78%] rounded-full bg-slate-200/90 dark:bg-white/12" />
          <div className="h-0.5 w-[52%] rounded-full bg-slate-200/80 dark:bg-white/10" />
        </div>
        <p className="mt-1.5 font-mono text-[8px] text-slate-600 dark:text-slate-300/90">case_login ✓</p>
      </div>

      <div className="login-float-a absolute right-[4%] top-[52%] z-[1] max-w-[9.5rem] rounded-2xl border border-slate-200/70 bg-white/75 px-2.5 py-1.5 text-[9px] leading-snug text-slate-700 shadow-md backdrop-blur-md dark:border-white/14 dark:bg-slate-950/35 dark:text-slate-200/95 sm:text-[10px]">
        <span className="text-violet-600 dark:text-violet-200/90">//</span> PRD → 用例
      </div>

      <div className="login-float-c absolute right-[14%] top-[4%] z-[1] h-8 w-8 rotate-12 rounded-lg border border-cyan-400/35 bg-cyan-400/15 dark:border-cyan-400/25 dark:bg-cyan-400/8" />
      <div className="login-float-e absolute bottom-[6%] right-[22%] z-[1] h-5 w-5 -rotate-6 rounded-full border border-amber-300/40 bg-amber-200/30 dark:border-amber-300/30 dark:bg-amber-200/12" />
    </div>
  )
}
