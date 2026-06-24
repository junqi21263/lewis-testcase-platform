import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import type { UploadedFile } from '@/types'
import type { AnalysisRuntimeMetric } from '@/utils/aiAnalysisRuntime'

type AnalysisStatus = 'idle' | 'uploading' | 'parsing' | 'analyzing' | 'review' | 'approved' | 'error'
type StudioStepState = 'pending' | 'running' | 'success' | 'error'

const STUDIO_STEP_LABELS = [
  '文件接收',
  '文档解析',
  'OCR / 多模态提取',
  '需求归纳',
  '结构化报告',
] as const

export function deriveStudioStepStates(
  status: AnalysisStatus,
  uploadedFile: UploadedFile | null,
  reportText: string,
): StudioStepState[] {
  const rep = reportText.trim().length > 0
  const f = uploadedFile
  const out: StudioStepState[] = ['pending', 'pending', 'pending', 'pending', 'pending']

  if (!f) {
    if (status === 'analyzing') {
      out[0] = 'success'
      out[1] = 'success'
      out[2] = 'success'
      out[3] = 'running'
      if (rep) out[4] = 'running'
      return out
    }
    if (status === 'review' || status === 'approved') {
      return ['success', 'success', 'success', 'success', rep ? 'success' : 'pending']
    }
    if (status === 'error') out[0] = 'error'
    return out
  }
  if (status === 'uploading') {
    out[0] = 'running'
    return out
  }
  out[0] = 'success'

  if (f.status === 'FAILED') {
    out[1] = 'error'
    return out
  }
  if (status === 'parsing' || f.status === 'PARSING' || f.status === 'PENDING') {
    out[1] = 'running'
    if (f.fileType === 'IMAGE' || f.fileType === 'PDF') out[2] = 'running'
    return out
  }

  if (f.status === 'PARSED') {
    out[1] = 'success'
    out[2] = 'success'
  }

  if (status === 'idle') return out

  if (status === 'analyzing') {
    out[3] = 'running'
    if (rep) out[4] = 'running'
    return out
  }

  if (status === 'review' || status === 'approved') {
    out[3] = 'success'
    out[4] = rep ? 'success' : 'pending'
    return out
  }

  if (status === 'error') {
    if (rep) {
      out[3] = 'success'
      out[4] = 'error'
    } else {
      out[3] = 'error'
    }
  }

  return out
}

function stepToneClass(state: StudioStepState) {
  if (state === 'success') return 'text-emerald-700 dark:text-emerald-300'
  if (state === 'running') return 'text-cyan-700 dark:text-cyan-300'
  if (state === 'error') return 'text-red-700 dark:text-red-300'
  return 'text-workspace-text-muted'
}

function connectorClass(done: boolean, running: boolean) {
  if (done) return 'bg-emerald-400/60'
  if (running) return 'bg-cyan-400/45'
  return 'bg-workspace-panel-border/60'
}

function StepIcon({ state }: { state: StudioStepState }) {
  if (state === 'success') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
  if (state === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
  if (state === 'error') return <XCircle className="h-3.5 w-3.5" aria-hidden />
  return <Circle className="h-3 w-3" aria-hidden />
}

function metricClass(tone: AnalysisRuntimeMetric['tone']) {
  if (tone === 'good') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100'
  if (tone === 'warn') return 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-100'
  return 'border-workspace-panel-border/60 bg-workspace-panel-muted/45 text-workspace-text-primary'
}

export function AiAnalysisRuntimePanel({
  status,
  uploadedFile,
  reportText,
  metrics,
}: {
  status: AnalysisStatus
  uploadedFile: UploadedFile | null
  reportText: string
  metrics: AnalysisRuntimeMetric[]
}) {
  const states = deriveStudioStepStates(status, uploadedFile, reportText)

  return (
    <div className="space-y-2">
      <ol
        className="ai-analysis-stage-track grid min-w-0 grid-cols-1 gap-1.5 rounded-xl border border-workspace-panel-border/60 bg-workspace-panel-muted/20 px-3 py-3 sm:grid-cols-5"
        data-testid="ai-analysis-runtime-stage-track"
        data-layout="inline-connectors"
      >
        {STUDIO_STEP_LABELS.map((label, i) => {
          const state = states[i] ?? 'pending'
          const nextState = states[i + 1]
          return (
            <li
              key={label}
              className={`ai-analysis-stage-segment relative flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-1.5 motion-safe:transition-[transform,opacity] motion-safe:duration-300 ${stepToneClass(state)}`}
              data-state={state}
            >
              <span className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/35 bg-workspace-card-bg/90">
                <StepIcon state={state} />
              </span>
              <span
                className="relative z-[1] min-w-0 truncate text-center text-[10px] font-semibold leading-tight"
                data-testid="ai-analysis-runtime-stage-label"
              >
                {label}
              </span>
              {i < STUDIO_STEP_LABELS.length - 1 && (
                <span
                  className={`ai-analysis-stage-bridge hidden sm:block ${connectorClass(state === 'success', nextState === 'running')}`}
                  data-testid="ai-analysis-runtime-stage-connector"
                  aria-hidden
                />
              )}
            </li>
          )
        })}
      </ol>
      <div className="grid gap-1.5 sm:grid-cols-3" data-testid="ai-analysis-runtime-metrics">
        {metrics.map((metric) => (
          <div key={metric.label} className={`rounded-lg border px-2.5 py-2 ${metricClass(metric.tone)}`}>
            <p className="text-[10px] text-workspace-text-muted">{metric.label}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
