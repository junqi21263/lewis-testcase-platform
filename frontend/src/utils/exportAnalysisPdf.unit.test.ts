import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildAnalysisPdfFileName } from './exportAnalysisPdf'

describe('buildAnalysisPdfFileName', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses safe basename and ISO date', () => {
    expect(buildAnalysisPdfFileName('我的需求.pdf')).toBe('我的需求.pdf_2026-05-07.pdf')
  })

  it('falls back when name missing', () => {
    expect(buildAnalysisPdfFileName(null)).toBe('需求分析报告_2026-05-07.pdf')
  })

  it('strips illegal path characters', () => {
    expect(buildAnalysisPdfFileName('a:b*c')).toBe('a_b_c_2026-05-07.pdf')
  })
})
