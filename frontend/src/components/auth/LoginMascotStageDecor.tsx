import { cn } from '@/utils/cn'

/**
 * 仅围绕 AI 小助手的装饰区：绝对定位相对于父级 `.login-mascot-stage`，不覆盖标题与表单。
 * 大屏显示；移动端由父级隐藏。
 */
export function LoginMascotStageDecor() {
  const pill =
    'absolute z-[1] inline-flex max-w-[10rem] items-center rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/90 shadow-[0_6px_20px_-8px_rgba(0,0,0,0.35)] backdrop-blur-md sm:text-[11px]'

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      <span
        className={cn(pill, 'login-float-e left-[2%] top-[6%] bg-emerald-400/18 text-emerald-50 ring-1 ring-emerald-300/25')}
      >
        团队已同步
      </span>
      <span
        className={cn(pill, 'login-float-b right-[0%] top-[10%] bg-violet-500/18 text-violet-50 ring-1 ring-violet-300/30')}
      >
        已生成 24 条用例
      </span>
      <span
        className={cn(pill, 'login-float-c left-[4%] bottom-[14%] bg-orange-400/16 text-orange-50 ring-1 ring-orange-300/25')}
      >
        需求已映射
      </span>
      <span
        className={cn(pill, 'login-float-d left-[-2%] top-[44%] bg-sky-400/16 text-sky-50 ring-1 ring-sky-300/25')}
      >
        AI 建议
      </span>
      <span
        className={cn(pill, 'login-float-a right-[2%] bottom-[10%] bg-amber-300/14 text-amber-50 ring-1 ring-amber-200/35')}
      >
        Review ready
      </span>

      <div className="login-float-b absolute bottom-[20%] left-[6%] z-[1] w-[7.25rem] rounded-xl border border-white/15 bg-slate-950/30 p-2 shadow-lg backdrop-blur-md">
        <div className="mb-1.5 h-1 w-7 rounded-full bg-cyan-400/50" />
        <div className="space-y-1">
          <div className="h-0.5 rounded-full bg-white/20" />
          <div className="h-0.5 w-[78%] rounded-full bg-white/12" />
          <div className="h-0.5 w-[52%] rounded-full bg-white/10" />
        </div>
        <p className="mt-1.5 font-mono text-[8px] text-slate-300/90">case_login ✓</p>
      </div>

      <div className="login-float-a absolute right-[4%] top-[52%] z-[1] max-w-[9.5rem] rounded-2xl border border-white/14 bg-slate-950/35 px-2.5 py-1.5 text-[9px] leading-snug text-slate-200/95 shadow-md backdrop-blur-md sm:text-[10px]">
        <span className="text-violet-200/90">//</span> PRD → 用例
      </div>

      <div className="login-float-c absolute right-[14%] top-[4%] z-[1] h-8 w-8 rotate-12 rounded-lg border border-cyan-400/25 bg-cyan-400/8" />
      <div className="login-float-e absolute bottom-[6%] right-[22%] z-[1] h-5 w-5 -rotate-6 rounded-full border border-amber-300/30 bg-amber-200/12" />
    </div>
  )
}
