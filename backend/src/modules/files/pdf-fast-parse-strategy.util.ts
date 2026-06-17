export type PdfParseStrategyMode =
  | 'text_only'
  | 'embedded_text_fast'
  | 'flowchart_vision_fast'
  | 'standard'

export type PdfParseStrategyEnv = Partial<Record<
  | 'FILE_PARSE_PDF_FAST_MODE'
  | 'FILE_PARSE_PDF_FAST_MAX_MB'
  | 'FILE_PARSE_PDF_FAST_MAX_PAGES'
  | 'FILE_PARSE_PDF_FAST_VISION_PAGES'
  | 'FILE_PARSE_PDF_HUNYUAN_FIRST',
  string
>>

export type PdfParseStrategyInput = {
  fileBytes: number
  numpages: number
  embeddedTextChars: number
  embeddedSufficient: boolean
  parseRetryHint: string | null
  env: PdfParseStrategyEnv
}

export type PdfParseStrategy = {
  mode: PdfParseStrategyMode
  reason: string
  skipHunyuanPrimary: boolean
  skipLocalOcr: boolean
  maxVisionPages?: number
}

function envEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase())
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function decidePdfParseStrategy(input: PdfParseStrategyInput): PdfParseStrategy {
  if (input.parseRetryHint === 'text_only') {
    return {
      mode: 'text_only',
      reason: 'explicit_text_only_retry',
      skipHunyuanPrimary: true,
      skipLocalOcr: true,
    }
  }

  const fastMode = envEnabled(input.env.FILE_PARSE_PDF_FAST_MODE, true)
  if (!fastMode) {
    return {
      mode: 'standard',
      reason: 'fast_mode_disabled',
      skipHunyuanPrimary: false,
      skipLocalOcr: false,
    }
  }

  const maxMb = positiveNumber(input.env.FILE_PARSE_PDF_FAST_MAX_MB, 10)
  const maxPages = Math.floor(positiveNumber(input.env.FILE_PARSE_PDF_FAST_MAX_PAGES, 3))
  const isSmallPdf = input.fileBytes <= maxMb * 1024 * 1024 && input.numpages > 0 && input.numpages <= maxPages

  if (isSmallPdf && input.embeddedSufficient) {
    return {
      mode: 'embedded_text_fast',
      reason: 'small_pdf_text_layer_sufficient',
      skipHunyuanPrimary: true,
      skipLocalOcr: true,
    }
  }

  if (isSmallPdf && !input.embeddedSufficient) {
    const maxVisionPages = Math.floor(positiveNumber(input.env.FILE_PARSE_PDF_FAST_VISION_PAGES, 3))
    return {
      mode: 'flowchart_vision_fast',
      reason: 'small_pdf_weak_text_layer_use_limited_vision',
      skipHunyuanPrimary: false,
      skipLocalOcr: true,
      maxVisionPages: Math.max(1, Math.min(maxVisionPages, maxPages)),
    }
  }

  return {
    mode: 'standard',
    reason: 'not_small_pdf',
    skipHunyuanPrimary: false,
    skipLocalOcr: false,
  }
}
