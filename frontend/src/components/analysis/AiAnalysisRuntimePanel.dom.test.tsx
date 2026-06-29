// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AiAnalysisRuntimePanel } from './AiAnalysisRuntimePanel'
import type { AnalysisRuntimeMetric } from '@/utils/aiAnalysisRuntime'
import type { UploadedFile } from '@/types'

const metrics: AnalysisRuntimeMetric[] = [
  { label: '解析耗时', value: '12s', tone: 'neutral' },
  { label: 'TTFT', value: '2.1s', tone: 'good' },
  { label: '总分析耗时', value: '42s', tone: 'neutral' },
]

const parsedFile: UploadedFile = {
  id: 'file-1',
  name: 'demo.pdf',
  originalName: 'demo.pdf',
  size: 1024,
  mimeType: 'application/pdf',
  fileType: 'PDF',
  status: 'PARSED',
  uploaderId: 'u-1',
  createdAt: '2026-06-29T00:00:00.000Z',
  parsedContent: '支付流程',
}

describe('AiAnalysisRuntimePanel', () => {
  it('shows inline stage track and runtime metrics for running analysis', () => {
    render(
      <AiAnalysisRuntimePanel
        status="analyzing"
        uploadedFile={parsedFile}
        reportText=""
        metrics={metrics}
      />,
    )

    const track = screen.getByTestId('ai-analysis-runtime-stage-track')
    const labels = within(track).getAllByTestId('ai-analysis-runtime-stage-label')
    expect(labels).toHaveLength(5)
    expect(track).toHaveTextContent('文件接收')
    expect(track).toHaveTextContent('结构化报告')

    const metricsPanel = screen.getByTestId('ai-analysis-runtime-metrics')
    expect(metricsPanel).toHaveTextContent('12s')
    expect(metricsPanel).toHaveTextContent('2.1s')
    expect(metricsPanel).toHaveTextContent('42s')
  })
})
