import { Circle } from 'lucide-react'
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

function chipClass(state: StudioStepState) {
  if (state === 'success') return 'border-emerald-500/45 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100'
  if (state === 'running') return 'border-cyan-500/55 bg-cyan-500/10 text-cyan-900 dark:text-cyan-100 motion-safe:animate-pulse'
  if (state === 'error') return 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-100'
  return 'border-workspace-panel-border/60 bg-workspace-panel-muted/50 text-workspace-text-secondary'
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
      <ol className="grid gap-1.5 sm:grid-cols-5">
        {STUDIO_STEP_LABELS.map((label, i) => {
          const state = states[i] ?? 'pending'
          return (
            <li
              key={label}
              className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 motion-safe:transition-[transform,opacity] motion-safe:duration-300 ${chipClass(state)}`}
            >
              <Circle className="h-2 w-2 shrink-0 fill-current opacity-80" aria-hidden />
              <span className="truncate text-[10px] font-semibold leading-tight">{label}</span>
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
