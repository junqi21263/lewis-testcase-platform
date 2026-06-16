import { describe, expect, it } from 'vitest'
import { buildRecordWorkflow } from './recordWorkflow'
import type { GenerationRecord } from '@/types'

function record(overrides: Partial<GenerationRecord>): GenerationRecord {
  return {
    id: 'record-1',
    title: '登录流程用例',
    status: 'SUCCESS',
    reviewStatus: 'pending_review',
    sourceType: 'text',
    prompt: '登录需求',
    modelId: 'model-1',
    modelName: 'Model',
    caseCount: 6,
    creatorId: 'user-1',
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    ...overrides,
  }
}

describe('record workflow', () => {
  it('marks text records as parsed and analyzed when prompt exists', () => {
    const wf = buildRecordWorkflow(record({ sourceType: 'text', prompt: '用户登录需求' }))

    expect(wf.current.id).toBe('review')
    expect(wf.steps.find((s) => s.id === 'parsed')?.state).toBe('complete')
    expect(wf.steps.find((s) => s.id === 'analyzed')?.state).toBe('complete')
    expect(wf.steps.find((s) => s.id === 'generated')?.state).toBe('complete')
  })

  it('keeps file records at parsed step while file parsing is not done', () => {
    const wf = buildRecordWorkflow(
      record({
        sourceType: 'file',
        status: 'PENDING',
        caseCount: 0,
        prompt: '',
        file: { id: 'file-1', originalName: 'flow.pdf', status: 'PARSING' },
      }),
    )

    expect(wf.current.id).toBe('parsed')
    expect(wf.steps.find((s) => s.id === 'parsed')?.state).toBe('current')
    expect(wf.steps.find((s) => s.id === 'generated')?.state).toBe('pending')
  })

  it('surfaces generated as current when cases exist but closed loop has not run', () => {
    const wf = buildRecordWorkflow(record({ reviewStatus: undefined, notes: null }))

    expect(wf.current.id).toBe('generated')
    expect(wf.steps.find((s) => s.id === 'closed_loop')?.state).toBe('pending')
  })

  it('detects closed loop completion from record notes', () => {
    const wf = buildRecordWorkflow(
      record({
        notes: 'AI 闭环优化：新增 1 条，修订 2 条；评分 70 -> 92',
        reviewStatus: 'pending_review',
      }),
    )

    expect(wf.current.id).toBe('review')
    expect(wf.steps.find((s) => s.id === 'closed_loop')?.state).toBe('complete')
    expect(wf.steps.find((s) => s.id === 'review')?.state).toBe('current')
  })

  it('marks approved records as executable', () => {
    const wf = buildRecordWorkflow(
      record({
        notes: 'AI 闭环优化：修订完成',
        reviewStatus: 'approved',
      }),
    )

    expect(wf.current.id).toBe('executable')
    expect(wf.steps.find((s) => s.id === 'review')?.state).toBe('complete')
    expect(wf.steps.find((s) => s.id === 'executable')?.state).toBe('complete')
  })
})
