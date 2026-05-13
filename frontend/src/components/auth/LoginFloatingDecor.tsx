import { cn } from '@/utils/cn'

/** 桌面端趣味漂浮标签与几何点缀；移动端隐藏 */
export function LoginFloatingDecor() {
  const pills = [
    { label: 'OCR 已解析', className: 'left-[2%] top-[6%] login-float-a bg-cyan-500/15 text-cyan-100 ring-cyan-400/25' },
    { label: '已生成 24 条用例', className: 'right-[0%] top-[18%] login-float-b bg-violet-500/15 text-violet-100 ring-violet-400/25' },
    { label: '等待评审', className: 'left-[8%] bottom-[28%] login-float-c bg-amber-400/12 text-amber-50 ring-amber-300/25' },
    { label: 'AI 建议', className: 'right-[6%] bottom-[14%] login-float-d bg-emerald-500/12 text-emerald-50 ring-emerald-400/20' },
    { label: '团队已同步', className: 'left-[22%] top-[38%] login-float-e bg-sky-500/12 text-sky-50 ring-sky-400/20' },
    { label: '需求已映射', className: 'right-[18%] top-[48%] login-float-f bg-rose-400/12 text-rose-50 ring-rose-300/25' },
  ]

  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-visible lg:block" aria-hidden>
      {pills.map((p) => (
        <span
          key={p.label}
          className={cn(
            'absolute inline-flex max-w-[9.5rem] items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset backdrop-blur-sm sm:text-[11px]',
            p.className,
          )}
        >
          {p.label}
        </span>
      ))}
      {/* 小型「用例」卡片 */}
      <div className="login-float-b absolute left-[6%] top-[52%] w-36 rounded-xl border border-white/10 bg-white/[0.07] p-2.5 shadow-lg backdrop-blur-md sm:w-40">
        <div className="mb-1.5 h-1.5 w-8 rounded-full bg-orange-400/55" />
        <div className="space-y-1">
          <div className="h-1 rounded bg-white/15" />
          <div className="h-1 w-[80%] rounded bg-white/10" />
          <div className="h-1 w-[55%] rounded bg-white/10" />
        </div>
        <p className="mt-2 font-mono text-[9px] text-slate-300/90">case_login_flow ✓</p>
      </div>
      {/* prompt 气泡 */}
      <div className="login-float-a absolute right-[4%] top-[62%] max-w-[11rem] rounded-2xl border border-white/12 bg-slate-950/35 px-3 py-2 text-[10px] leading-snug text-slate-200/95 shadow-lg backdrop-blur-md sm:text-[11px]">
        <span className="text-violet-200/90">//</span> 把 PRD 转成可执行用例…
      </div>
      {/* 几何 */}
      <div className="login-float-c absolute left-[40%] top-[12%] h-10 w-10 rotate-12 rounded-lg border border-cyan-400/20 bg-cyan-400/5" />
      <div className="login-float-e absolute bottom-[8%] right-[28%] h-6 w-6 -rotate-6 rounded-full border border-amber-300/25 bg-amber-200/10" />
    </div>
  )
}
