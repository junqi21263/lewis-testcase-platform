import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildAnalysisPdfFileName,
  buildAnalysisExportBasename,
  buildAnalysisXmindFileName,
} from './exportAnalysisPdf'

describe('buildAnalysisExportBasename', () => {
  it('strips extension', () => {
    expect(buildAnalysisExportBasename('我的需求.pdf')).toBe('我的需求')
  })
})

describe('buildAnalysisPdfFileName', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses basename and Chinese date suffix', () => {
    expect(buildAnalysisPdfFileName('我的需求.pdf')).toBe('我的需求需求分析2026年05月07日.pdf')
  })

  it('falls back when name missing', () => {
    expect(buildAnalysisPdfFileName(null)).toBe('需求分析报告需求分析2026年05月07日.pdf')
  })

  it('strips illegal path characters', () => {
    expect(buildAnalysisPdfFileName('a:b*c.pdf')).toBe('a_b_c需求分析2026年05月07日.pdf')
  })
})

describe('buildAnalysisXmindFileName', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses same basename rule with xmind extension', () => {
    expect(buildAnalysisXmindFileName('doc.docx')).toBe('doc需求分析2026年05月07日.xmind')
  })
})
