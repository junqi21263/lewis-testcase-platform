import { describe, expect, it } from 'vitest'
import { buildAnalysisRuntimeMetrics } from './aiAnalysisRuntime'

describe('aiAnalysisRuntime', () => {
  it('formats parse duration, TTFT and total analysis duration for the runtime view', () => {
    const metrics = buildAnalysisRuntimeMetrics({
      parseElapsedSec: 12,
      analysisStartedAtMs: 1_000,
      firstTokenAtMs: 2_750,
      analysisFinishedAtMs: 8_100,
      nowMs: 9_000,
    })

    expect(metrics).toEqual([
      { label: '解析耗时', value: '12s', tone: 'neutral' },
      { label: 'TTFT', value: '1.8s', tone: 'good' },
      { label: '总分析耗时', value: '7.1s', tone: 'neutral' },
    ])
  })

  it('uses waiting placeholders before the first streamed token arrives', () => {
    const metrics = buildAnalysisRuntimeMetrics({
      parseElapsedSec: 0,
      analysisStartedAtMs: 1_000,
      firstTokenAtMs: null,
      analysisFinishedAtMs: null,
      nowMs: 4_200,
    })

    expect(metrics[1]).toEqual({ label: 'TTFT', value: '等待首字', tone: 'warn' })
    expect(metrics[2]).toEqual({ label: '总分析耗时', value: '3.2s', tone: 'neutral' })
  })

  it('marks slow first token as neutral and empty timings as placeholders', () => {
    expect(
      buildAnalysisRuntimeMetrics({
        parseElapsedSec: -1,
        analysisStartedAtMs: null,
        firstTokenAtMs: null,
        analysisFinishedAtMs: null,
        nowMs: 10_000,
      }),
    ).toEqual([
      { label: '解析耗时', value: '-', tone: 'neutral' },
      { label: 'TTFT', value: '等待首字', tone: 'warn' },
      { label: '总分析耗时', value: '-', tone: 'neutral' },
    ])

    const metrics = buildAnalysisRuntimeMetrics({
      parseElapsedSec: 4,
      analysisStartedAtMs: 1_000,
      firstTokenAtMs: 7_000,
      analysisFinishedAtMs: 13_000,
      nowMs: 20_000,
    })
    expect(metrics[1]).toEqual({ label: 'TTFT', value: '6.0s', tone: 'neutral' })
    expect(metrics[2]).toEqual({ label: '总分析耗时', value: '12s', tone: 'neutral' })
  })
})
