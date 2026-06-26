import { describe, expect, it, vi } from 'vitest'
import {
  PROMPT_TEMPLATE_STORAGE_KEY,
  combineUserRequirementNotes,
  fileHistoryStatusBadge,
  formatFileSizeShort,
  initialPageState,
  isTransientPollError,
  loadStoredPromptTemplate,
  pageReducer,
  pollErrorLabel,
  terminalLogStatusFromText,
} from './analysisPageState'

describe('analysisPageState', () => {
  it('resets transient output when starting a new analysis', () => {
    const state = pageReducer(
      {
        status: 'review',
        logs: [{ id: 'log-1', text: 'old log', timestamp: '10:00:00' }],
        reportText: 'old report',
        reviewText: 'old review',
        revisionCount: 1,
      },
      { type: 'START_ANALYSIS' },
    )

    expect(state).toMatchObject({
      status: 'analyzing',
      logs: [],
      reportText: '',
      reviewText: '',
      revisionCount: 1,
    })
  })

  it('restores running snapshot with a visible recovery log', () => {
    vi.setSystemTime(new Date('2026-06-26T10:11:12+08:00'))

    const state = pageReducer(initialPageState, {
      type: 'LOAD_RECOVERED_REPORT',
      text: 'recovered report',
      status: 'analyzing',
    })

    expect(state.status).toBe('analyzing')
    expect(state.reportText).toBe('recovered report')
    expect(state.logs).toHaveLength(1)
    expect(state.logs[0]?.statusOverride).toBe('running')
    expect(state.logs[0]?.text).toContain('流式快照恢复')
  })

  it('maps terminal log semantics without relying on emoji', () => {
    expect(terminalLogStatusFromText('解析失败：模型空输出')).toBe('error')
    expect(terminalLogStatusFromText('文件上传成功，等待解析...')).toBe('pending')
    expect(terminalLogStatusFromText('正在调用 AI 模型')).toBe('running')
    expect(terminalLogStatusFromText('AI 需求分析完成')).toBe('success')
    expect(terminalLogStatusFromText('提示：OCR 质量较低')).toBe('warning')
  })

  it('classifies transient polling errors and exposes readable labels', () => {
    const transient = { response: { status: 502 } }
    const badRequest = { response: { status: 400 } }
    const timeout = { code: 'ECONNABORTED' }

    expect(isTransientPollError(transient)).toBe(true)
    expect(isTransientPollError(timeout)).toBe(true)
    expect(isTransientPollError(badRequest)).toBe(false)
    expect(pollErrorLabel(transient)).toBe('HTTP 502')
    expect(pollErrorLabel(timeout)).toBe('ECONNABORTED')
  })

  it('formats user notes, sizes, badges and stored prompt fallback consistently', () => {
    localStorage.removeItem(PROMPT_TEMPLATE_STORAGE_KEY)
    expect(loadStoredPromptTemplate()).toContain('需求文档内容')

    localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, 'custom prompt')
    expect(loadStoredPromptTemplate()).toBe('custom prompt')

    expect(combineUserRequirementNotes('需求', '补充')).toBe('需求\n\n补充')
    expect(formatFileSizeShort(1536)).toBe('1.5 KB')
    expect(fileHistoryStatusBadge('PARSED').label).toBe('已解析')
  })
})
