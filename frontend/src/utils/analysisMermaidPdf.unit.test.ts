import { describe, expect, it } from 'vitest'
import reportMarkdown from '@/test/fixtures/contracts/analysis-report/mermaid-subroutine.md?raw'
import { extractMermaidBlocksForPdf } from './analysisMermaidPdf'

describe('extractMermaidBlocksForPdf', () => {
  it('extracts and normalizes Mermaid blocks for PDF export', () => {
    expect(extractMermaidBlocksForPdf(reportMarkdown)).toEqual([
      expect.stringContaining('A[[用户提交订单]]'),
    ])
  })
})
