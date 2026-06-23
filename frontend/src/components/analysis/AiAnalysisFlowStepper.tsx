import { CheckCircle2, Loader2 } from 'lucide-react'
import type { AiAnalysisFlowStep } from '@/utils/aiAnalysisInput'

export function AiAnalysisFlowStepper({
  steps,
  onGenerate,
}: {
  steps: AiAnalysisFlowStep[]
  onGenerate?: () => void
}) {
  return (
    <div
      className="shrink-0 border-b border-[color:var(--ai-ar-divider)] bg-[color:var(--ai-ar-panel-bg)]/85 px-4 py-3 backdrop-blur-md sm:px-5"
      data-testid="ai-analysis-flow-stepper"
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, idx) => {
          const active = step.status === 'active'
          const done = step.status === 'done'
          const clickableGenerate = step.id === 'generate' && active && onGenerate
          const Shell = clickableGenerate ? 'button' : 'div'
          return (
            <Shell
              key={step.id}
              type={clickableGenerate ? 'button' : undefined}
              onClick={clickableGenerate ? onGenerate : undefined}
              data-testid={`ai-analysis-flow-step-${step.id}`}
              className={`group relative w-full rounded-xl border px-3 py-2 text-left transition-[background-color,border-color,box-shadow,transform] ${
                done
                  ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
                  : active
                    ? 'border-cyan-400/45 bg-cyan-500/10 text-cyan-950 shadow-[0_0_0_3px_rgba(34,211,238,0.08)] dark:text-cyan-100'
                    : 'border-workspace-panel-border/60 bg-workspace-panel-muted/35 text-workspace-text-muted dark:border-white/10'
              } ${clickableGenerate ? 'cursor-pointer hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-500/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/40' : ''}`}
            >
              {idx < steps.length - 1 && (
                <span
                  className={`pointer-events-none absolute left-[calc(50%+1.25rem)] right-[-0.75rem] top-1/2 hidden h-px -translate-y-1/2 xl:block ${
                    done ? 'bg-emerald-400/55' : active ? 'bg-cyan-400/45' : 'bg-workspace-panel-border/50'
                  }`}
                  aria-hidden
                />
              )}
              <div className="relative z-[1] flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-white/20 ${
                    done
                      ? 'bg-emerald-500 text-white'
                      : active
                        ? 'bg-cyan-500 text-white'
                        : 'bg-workspace-panel-muted text-workspace-text-muted'
                  }`}
                >
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{step.title}</p>
                  <p className="truncate text-[10px] opacity-75">{step.description}</p>
                </div>
              </div>
            </Shell>
          )
        })}
      </div>
    </div>
  )
}
