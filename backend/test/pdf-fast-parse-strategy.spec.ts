import { decidePdfParseStrategy } from '../src/modules/files/pdf-fast-parse-strategy.util'

describe('PDF fast parse strategy', () => {
  it('uses embedded text fast path for small PDFs with sufficient text layer', () => {
    const strategy = decidePdfParseStrategy({
      fileBytes: 5.6 * 1024 * 1024,
      numpages: 3,
      embeddedTextChars: 1800,
      embeddedSufficient: true,
      parseRetryHint: null,
      env: {
        FILE_PARSE_PDF_FAST_MODE: '1',
        FILE_PARSE_PDF_HUNYUAN_FIRST: '1',
      },
    })

    expect(strategy.mode).toBe('embedded_text_fast')
    expect(strategy.skipHunyuanPrimary).toBe(true)
    expect(strategy.skipLocalOcr).toBe(true)
    expect(strategy.reason).toContain('small_pdf_text_layer')
  })

  it('uses flowchart vision for small weak-text PDFs before local OCR', () => {
    const strategy = decidePdfParseStrategy({
      fileBytes: 5.6 * 1024 * 1024,
      numpages: 2,
      embeddedTextChars: 20,
      embeddedSufficient: false,
      parseRetryHint: null,
      env: {
        FILE_PARSE_PDF_FAST_MODE: '1',
      },
    })

    expect(strategy.mode).toBe('flowchart_vision_fast')
    expect(strategy.maxVisionPages).toBe(3)
    expect(strategy.skipLocalOcr).toBe(true)
  })

  it('respects explicit text-only retry', () => {
    const strategy = decidePdfParseStrategy({
      fileBytes: 20 * 1024 * 1024,
      numpages: 20,
      embeddedTextChars: 200,
      embeddedSufficient: false,
      parseRetryHint: 'text_only',
      env: {
        FILE_PARSE_PDF_FAST_MODE: '1',
      },
    })

    expect(strategy.mode).toBe('text_only')
    expect(strategy.skipHunyuanPrimary).toBe(true)
  })
})
