import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { DocumentVisionService } from './document-vision.service'
import { TencentOcrClientService } from '@/modules/ocr/tencent-ocr.client.service'
import { ImagePreprocessService } from '@/modules/ocr/image-preprocess.service'
import { TencentOcrSdkPdfService } from './tencent-ocr-sdk-pdf.service'

export type PdfTextLayerMeta = { text: string; numpages: number }

type HeartbeatFn = (stage: string, progress?: Record<string, unknown>) => Promise<void>

/**
 * PDF 文本层检测 +（可选）腾讯云 OCR：优先官方 SDK（PDF 模式，免本地渲染），
 * 其次 HTTP 代理 + 本地逐页 JPEG；均不可用时由 FilesService 走视觉/Tesseract 分批管线。
 */
@Injectable()
export class PdfDocumentParseService {
  private readonly logger = new Logger(PdfDocumentParseService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly documentVision: DocumentVisionService,
    private readonly tencentOcr: TencentOcrClientService,
    private readonly imagePreprocess: ImagePreprocessService,
    private readonly tencentSdkPdf: TencentOcrSdkPdfService,
  ) {}

  /** pdf-parse 提取文本层与页数 */
  async extractTextLayerWithMeta(filePath: string): Promise<PdfTextLayerMeta> {
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{
      text?: string
      numpages?: number
      numPages?: number
    }>
    const buffer = fs.readFileSync(filePath)
    const data = await pdfParse(buffer)
    const numpages =
      typeof data.numpages === 'number'
        ? data.numpages
        : typeof data.numPages === 'number'
          ? data.numPages
          : 0
    return { text: data.text || '', numpages }
  }

  /**
   * 乱码/替换符/控制字符占比，用于判断扫描版或坏编码（与 FilesService 原逻辑一致）。
   */
  estimateGarbledRatio(raw: string): number {
    if (!raw || raw.length === 0) return 1
    let bad = 0
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i)
      if (c === 0xfffd) bad++
      else if (c < 32 && c !== 9 && c !== 10 && c !== 13) bad++
    }
    return bad / raw.length
  }

  /** 是否应把当前 PDF 当「文本足够」直接返回文本层（不经 OCR） */
  evaluateTextLayerSufficiency(text: string, _numpages: number): {
    sufficient: boolean
    garbledRatio: number
    minLen: number
    garbledMax: number
  } {
    const minLen = parseInt(this.config.get<string>('VISION_PDF_MIN_TEXT_CHARS') || '120', 10)
    const garbledMaxRaw = this.config.get<string>('PDF_TEXT_GARBLED_RATIO_MAX')
    const garbledMax = parseFloat(garbledMaxRaw || '0.3')
    const garbledRatio = this.estimateGarbledRatio(text)
    const gm = Number.isFinite(garbledMax) && garbledMax > 0 && garbledMax <= 1 ? garbledMax : 0.3
    const sufficient = text.trim().length >= minLen && garbledRatio <= gm
    return { sufficient, garbledRatio, minLen, garbledMax: gm }
  }

  /** 文本层不足时，是否走 HTTP 代理全本逐页（需 TENCENT_OCR_HTTP_URL） */
  shouldPreferTencentFullPdfOcr(): boolean {
    if (!this.tencentOcr.isEnabled()) return false
    if (this.config.get<string>('PDF_TENCENT_OCR_ENABLED') === '0') return false
    return true
  }

  /**
   * 优先腾讯云官方 SDK（COS 签名 URL 或本地小 PDF Base64，按 PdfPageNumber 逐页，无需 pdf-to-img）；
   * 其次 HTTP 代理 + 本地渲染 JPEG。
   */
  async runTencentFullPdfOcr(
    filePath: string,
    embeddedText: string,
    totalPagesHint: number,
    heartbeat: HeartbeatFn,
    opts?: { originalStoredPath?: string },
  ): Promise<string | null> {
    const originalStoredPath = opts?.originalStoredPath ?? filePath

    if (this.tencentSdkPdf.isSdkPdfPathEnabled()) {
      try {
        const sdkBody = await this.tencentSdkPdf.recognizePdfBySdk({
          originalStoredPath,
          localPdfPath: filePath,
          numpages: totalPagesHint,
          heartbeat,
        })
        if (sdkBody) {
          const parts: string[] = []
          if (embeddedText.trim()) {
            parts.push(
              `【PDF 内置文本层（质量不足；已启用腾讯云官方 PDF OCR）】\n${embeddedText.trim()}`,
            )
          }
          parts.push(sdkBody)
          return parts.join('\n\n')
        }
      } catch (e) {
        const msg = (e as Error).message || String(e)
        if (msg.startsWith('【解析失败】')) throw e
        this.logger.warn(`腾讯云 SDK PDF 未采用，尝试 HTTP 逐页: ${msg}`)
      }
    }

    if (!this.shouldPreferTencentFullPdfOcr()) return null

    await heartbeat('PDF_TENCENT_OCR', {
      phase: 'OCR',
      pageCurrent: 0,
      pageTotal: Math.max(1, totalPagesHint),
      message: 'tencent_pdf_start',
    })

    const pageRetries = parseInt(this.config.get<string>('PDF_TENCENT_OCR_PAGE_RETRIES') || '2', 10)
    const maxAttempts = Number.isFinite(pageRetries) && pageRetries >= 0 ? pageRetries + 1 : 3

    const lines: string[] = []
    let anySuccess = false
    let maxPageSeen = 0

    try {
      for await (const { pageNum, buffer: pngBuf } of this.documentVision.iteratePdfPagesAsPng(filePath)) {
        maxPageSeen = Math.max(maxPageSeen, pageNum)
        const total = Math.max(totalPagesHint, maxPageSeen, pageNum)
        await heartbeat('PDF_TENCENT_OCR', {
          phase: 'OCR',
          pageCurrent: pageNum,
          pageTotal: total,
          message: `正在识别第${pageNum}页/共${total}页`,
        })

        let text: string | null = null
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const jpeg =
            (await this.imagePreprocess.preprocessBufferToJpegBuffer(pngBuf)) ??
            (await this.fallbackPngToJpeg(pngBuf))
          if (!jpeg?.length) {
            this.logger.warn(`PDF 第 ${pageNum} 页：无法生成 JPEG，跳过本轮 attempt=${attempt}`)
            continue
          }
          text = await this.tencentOcr.recognizeJpegBuffer(jpeg)
          if (text?.trim()) break
          this.logger.warn(`PDF 第 ${pageNum} 页：腾讯云 OCR 空结果 (${attempt}/${maxAttempts})`)
        }

        if (text?.trim()) {
          anySuccess = true
          lines.push(`--- PDF 第 ${pageNum} 页（腾讯云 OCR）---\n${text.trim()}`)
        } else {
          lines.push(`--- PDF 第 ${pageNum} 页（腾讯云 OCR）---\n（本页未识别到文字，请检查原稿清晰度或 OCR 服务）`)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.error(`腾讯云 PDF 全本 OCR 中断: ${msg}`)
      throw new Error(
        `【解析失败】扫描版 PDF 腾讯云识别中断：${msg}。请确认 TENCENT_OCR_HTTP_URL 可用且超时 PDF_TENCENT_OCR_* 合理。`,
      )
    }

    if (maxPageSeen === 0) {
      this.logger.warn('腾讯云 PDF OCR：未渲染出任何页面')
      return null
    }

    if (!anySuccess) {
      throw new Error(
        '【解析失败】扫描版 PDF 已走腾讯云逐页识别，但未得到有效文字。请检查 OCR 代理服务（TENCENT_OCR_HTTP_URL）是否正常，或稍后重试。',
      )
    }

    await heartbeat('PDF_TENCENT_OCR_DONE', {
      phase: 'OCR',
      pageCurrent: maxPageSeen,
      pageTotal: Math.max(totalPagesHint, maxPageSeen),
      message: 'tencent_pdf_done',
    })

    const parts: string[] = []
    if (embeddedText.trim()) {
      parts.push(
        `【PDF 内置文本层（质量不足；已启用腾讯云全本 OCR）】\n${embeddedText.trim()}`,
      )
    }
    parts.push(`【PDF｜腾讯云 OCR 全本识别】\n${lines.join('\n\n')}`)
    return parts.join('\n\n')
  }

  /** sharp 不可用时，尽力把 PNG 交给下游（与 preprocess 行为一致） */
  private async fallbackPngToJpeg(pngBuf: Buffer): Promise<Buffer | null> {
    try {
      const sharpMod = (await import('sharp')).default
      return await sharpMod(pngBuf).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    } catch {
      return null
    }
  }
}
