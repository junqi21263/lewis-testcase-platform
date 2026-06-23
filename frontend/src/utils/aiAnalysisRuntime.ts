export type AnalysisRuntimeMetricTone = 'neutral' | 'good' | 'warn'

export type AnalysisRuntimeMetric = {
  label: '解析耗时' | 'TTFT' | '总分析耗时'
  value: string
  tone: AnalysisRuntimeMetricTone
}

function formatSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-'
  const sec = ms / 1000
  if (sec < 10) return `${sec.toFixed(1)}s`
  return `${Math.round(sec)}s`
}

export function buildAnalysisRuntimeMetrics(input: {
  parseElapsedSec: number
  analysisStartedAtMs: number | null
  firstTokenAtMs: number | null
  analysisFinishedAtMs: number | null
  nowMs: number
}): AnalysisRuntimeMetric[] {
  const analysisStart = input.analysisStartedAtMs
  const end = input.analysisFinishedAtMs ?? input.nowMs
  const totalMs = analysisStart ? Math.max(0, end - analysisStart) : 0
  const ttftMs = analysisStart && input.firstTokenAtMs ? Math.max(0, input.firstTokenAtMs - analysisStart) : null

  return [
    {
      label: '解析耗时',
      value: input.parseElapsedSec > 0 ? `${Math.round(input.parseElapsedSec)}s` : '-',
      tone: 'neutral',
    },
    {
      label: 'TTFT',
      value: ttftMs == null ? '等待首字' : formatSeconds(ttftMs),
      tone: ttftMs == null ? 'warn' : ttftMs <= 3000 ? 'good' : 'neutral',
    },
    {
      label: '总分析耗时',
      value: totalMs > 0 ? formatSeconds(totalMs) : '-',
      tone: 'neutral',
    },
  ]
}
