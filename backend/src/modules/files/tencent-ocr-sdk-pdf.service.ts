import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { CosStorageService } from './cos-storage.service'

type HeartbeatFn = (stage: string, progress?: Record<string, unknown>) => Promise<void>

/** 腾讯云 GeneralBasicOCR 单页识别结果项 */
interface TextDet {
  DetectedText?: string
}

/**
 * 使用腾讯云官方 OCR SDK（GeneralBasicOCR + IsPdf + PdfPageNumber）按页识别 PDF，
 * 无需本地 pdf-to-img 渲染。OCR 调用密钥优先读 TENCENTCLOUD_SECRET_ID / KEY；未单独配置时自动回退为 COS_SECRET_ID / KEY（与 COS 同子账号时可不再重复填写）。
 *
 * - **COS 文件**：对 `cos://` 生成签名 **ImageUrl**，腾讯云侧直连拉取（推荐）。
 * - **仅本地文件**：小 PDF（默认 ≤4MB）可走 **ImageBase64**；更大则返回 null 由上层降级为本地渲染 + HTTP 代理。
 *
 * 说明：官方接口每次只识别 **一页**（PdfPageNumber），全本需循环调用。
 */
@Injectable()
export class TencentOcrSdkPdfService {
  private readonly logger = new Logger(TencentOcrSdkPdfService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly cosStorage: CosStorageService,
  ) {}

  /** OCR 接口凭证：优先专用变量，否则与 COS 共用一套 Secret（同账号常见） */
  private resolveOcrCredentials(): { secretId: string; secretKey: string } | null {
    const sid =
      this.config.get<string>('TENCENTCLOUD_SECRET_ID')?.trim() ||
      this.config.get<string>('COS_SECRET_ID')?.trim()
    const sk =
      this.config.get<string>('TENCENTCLOUD_SECRET_KEY')?.trim() ||
      this.config.get<string>('COS_SECRET_KEY')?.trim()
    if (!sid || !sk) return null
    return { secretId: sid, secretKey: sk }
  }

  /** 是否启用「官方 SDK PDF 模式」（与 HTTP 代理二选一优先级由 PdfDocumentParseService 决定） */
  isSdkPdfPathEnabled(): boolean {
    if (this.config.get<string>('PDF_TENCENT_SDK_PDF') === '0') return false
    return this.isSdkConfigured()
  }

  isSdkConfigured(): boolean {
    return this.resolveOcrCredentials() !== null
  }

  private getRegion(): string {
    return (
      this.config.get<string>('TENCENT_OCR_REGION')?.trim() ||
      this.config.get<string>('COS_REGION')?.trim() ||
      'ap-guangzhou'
    )
  }

  /**
   * 返回合并正文（含分页标题），失败返回 null 以便降级其它链路。
   */
  async recognizePdfBySdk(params: {
    originalStoredPath: string
    localPdfPath: string
    numpages: number
    heartbeat: HeartbeatFn
  }): Promise<string | null> {
    if (!this.isSdkPdfPathEnabled()) return null

    const cred = this.resolveOcrCredentials()
    if (!cred) return null

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tencentcloud = require('tencentcloud-sdk-nodejs') as typeof import('tencentcloud-sdk-nodejs')
    const OcrClient = tencentcloud.ocr.v20181119.Client
    const client = new OcrClient({
      credential: { secretId: cred.secretId, secretKey: cred.secretKey },
      region: this.getRegion(),
      profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } },
    })

    let imageUrl: string | null = null
    let imageBase64: string | null = null

    if (CosStorageService.isCosUri(params.originalStoredPath) && this.cosStorage.isConfigured()) {
      try {
        const ttl = parseInt(this.config.get<string>('TENCENT_OCR_COS_URL_EXPIRES_SEC') || '7200', 10)
        imageUrl = await this.cosStorage.getSignedGetObjectUrl(
          params.originalStoredPath,
          Number.isFinite(ttl) ? ttl : 7200,
        )
      } catch (e) {
        this.logger.warn(`COS 签名 URL 失败，跳过 SDK PDF：${(e as Error).message}`)
        return null
      }
    } else {
      const maxRaw = this.config.get<string>('PDF_TENCENT_SDK_MAX_BYTES') || `${4 * 1024 * 1024}`
      const maxBytes = parseInt(maxRaw, 10)
      const cap = Number.isFinite(maxBytes) && maxBytes > 100_000 ? maxBytes : 4 * 1024 * 1024
      try {
        const st = fs.statSync(params.localPdfPath)
        if (st.size > cap) {
          this.logger.debug(`PDF 超过 SDK Base64 上限 ${cap}B，跳过官方接口`)
          return null
        }
        imageBase64 = fs.readFileSync(params.localPdfPath).toString('base64')
      } catch (e) {
        this.logger.warn(`读取本地 PDF 失败: ${(e as Error).message}`)
        return null
      }
    }

    const probeMax = parseInt(this.config.get<string>('PDF_TENCENT_SDK_MAX_PROBE_PAGES') || '200', 10)
    const maxProbe = Number.isFinite(probeMax) && probeMax > 0 ? Math.min(probeMax, 500) : 200
    const totalPages = params.numpages > 0 ? params.numpages : maxProbe

    await params.heartbeat('PDF_TENCENT_SDK', {
      phase: 'OCR',
      pageCurrent: 0,
      pageTotal: Math.max(1, params.numpages || 1),
      message: 'tencent_sdk_pdf_start',
    })

    const lines: string[] = []
    let anyText = false
    let consecutiveEmpty = 0
    const maxConsecutiveEmpty = params.numpages > 0 ? 999 : 3

    for (let p = 1; p <= totalPages; p++) {
      const displayTotal = params.numpages > 0 ? params.numpages : Math.max(p, totalPages)
      await params.heartbeat('PDF_TENCENT_SDK', {
        phase: 'OCR',
        pageCurrent: p,
        pageTotal: displayTotal,
        message: `正在识别第${p}页/共${params.numpages > 0 ? params.numpages : '…'}页`,
      })

      try {
        const req = {
          IsPdf: true,
          PdfPageNumber: p,
          LanguageType: 'zh' as const,
          ...(imageUrl ? { ImageUrl: imageUrl } : { ImageBase64: imageBase64! }),
        }
        const res = (await client.GeneralBasicOCR(req)) as { TextDetections?: TextDet[] }
        const txt = (res.TextDetections ?? [])
          .map((d) => d.DetectedText)
          .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
          .join('\n')
        if (txt.trim()) {
          anyText = true
          consecutiveEmpty = 0
          lines.push(`--- PDF 第 ${p} 页（腾讯云官方 OCR｜PDF）---\n${txt.trim()}`)
        } else {
          consecutiveEmpty++
          lines.push(`--- PDF 第 ${p} 页（腾讯云官方 OCR｜PDF）---\n（本页无文本）`)
          if (params.numpages <= 0 && consecutiveEmpty >= maxConsecutiveEmpty) {
            this.logger.debug(`SDK PDF：连续 ${maxConsecutiveEmpty} 页无内容，假定已到末页`)
            break
          }
        }
      } catch (e) {
        const msg = this.formatTencentError(e)
        if (params.numpages > 0) {
          throw new Error(`【解析失败】腾讯云 PDF 识别第 ${p} 页失败：${msg}`)
        }
        if (p === 1) {
          throw new Error(`【解析失败】腾讯云 PDF 识别失败：${msg}`)
        }
        this.logger.warn(`SDK PDF：第 ${p} 页报错，假定已到末页: ${msg}`)
        break
      }
    }

    if (!anyText) {
      this.logger.warn('腾讯云 SDK PDF：未得到任何非空页')
      return null
    }

    await params.heartbeat('PDF_TENCENT_SDK_DONE', {
      phase: 'OCR',
      pageCurrent: lines.length,
      pageTotal: params.numpages > 0 ? params.numpages : lines.length,
      message: 'tencent_sdk_pdf_done',
    })

    return `【PDF｜腾讯云官方 OCR（PDF 模式）】\n${lines.join('\n\n')}`
  }

  private formatTencentError(e: unknown): string {
    const err = e as { message?: string; code?: string }
    const parts = [err.code, err.message].filter(Boolean)
    return parts.join(' ') || String(e)
  }
}
