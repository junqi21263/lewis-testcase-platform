import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  PlayCircle,
} from 'lucide-react'
import type { GenerationRecord } from '@/types'
import { buildRecordWorkflow, type RecordWorkflowStepState } from '@/utils/recordWorkflow'
import { cn } from '@/utils/cn'

function stateClass(state: RecordWorkflowStepState) {
  if (state === 'complete') return 'border-emerald-400/55 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300'
  if (state === 'current') return 'border-sky-400/55 bg-sky-500/12 text-sky-600 dark:text-sky-300'
  if (state === 'blocked') return 'border-rose-400/55 bg-rose-500/12 text-rose-600 dark:text-rose-300'
  return 'border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-chip-bg))] text-[hsl(var(--records-text-muted))]'
}

function StepIcon({ state }: { state: RecordWorkflowStepState }) {
  if (state === 'complete') return <CheckCircle2 className="h-3.5 w-3.5" />
  if (state === 'current') return <Clock3 className="h-3.5 w-3.5" />
  if (state === 'blocked') return <AlertTriangle className="h-3.5 w-3.5" />
  return <Circle className="h-3.5 w-3.5" />
}

export function RecordWorkflowRail({
  record,
  compact = false,
}: {
  record: GenerationRecord
  compact?: boolean
}) {
  const workflow = buildRecordWorkflow(record)

  return (
    <section
      className={cn(
        'rounded-2xl border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-filter-panel-bg))]/75 p-3',
        compact ? 'space-y-2' : 'space-y-3',
      )}
      aria-label="工作流状态"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold text-[hsl(var(--records-text-primary))]">工作流状态</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          当前：{workflow.current.label}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 records-scrollbar" data-testid="record-workflow-rail">
        {workflow.steps.map((step, idx) => (
          <div key={step.id} className="flex min-w-[92px] flex-1 items-center gap-2">
            <div
              className={cn(
                'flex min-h-[46px] flex-1 flex-col justify-center rounded-xl border px-2.5 py-2 transition-colors',
                stateClass(step.state),
              )}
              title={step.description}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                <StepIcon state={step.state} />
                {step.label}
              </span>
              {!compact && (
                <span className="mt-1 line-clamp-1 text-[10px] opacity-75">{step.description}</span>
              )}
            </div>
            {idx < workflow.steps.length - 1 && (
              <span className="hidden h-px w-4 shrink-0 bg-[hsl(var(--records-panel-border))] sm:block" />
            )}
          </div>
        ))}
      </div>
      {!compact && (
        <p className="text-[11px] text-[hsl(var(--records-text-muted))]">
          下一步：{workflow.nextAction}
        </p>
      )}
    </section>
  )
}
