// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AiAnalysisFlowStepper } from './AiAnalysisFlowStepper'
import type { AiAnalysisFlowStep } from '@/utils/aiAnalysisInput'

describe('AiAnalysisFlowStepper', () => {
  it('renders all phases and exposes generate click only when active', async () => {
    const user = userEvent.setup()
    const onGenerate = vi.fn()
    const steps: AiAnalysisFlowStep[] = [
      { id: 'source', title: '选择输入', description: '上传文档', status: 'done' },
      { id: 'quality', title: '输入质检', description: '确认质量', status: 'done' },
      { id: 'analysis', title: 'AI 分析运行', description: '流式报告', status: 'done' },
      { id: 'review', title: '结构化审阅', description: '问题确认', status: 'done' },
      { id: 'generate', title: '生成用例', description: '进入用例生成', status: 'active' },
    ]

    render(<AiAnalysisFlowStepper steps={steps} onGenerate={onGenerate} />)

    expect(screen.getByTestId('ai-analysis-flow-step-source')).toHaveTextContent('选择输入')
    expect(screen.getByTestId('ai-analysis-flow-step-generate')).toHaveTextContent('生成用例')

    await user.click(screen.getByRole('button', { name: /生成用例/i }))
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })
})
