import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'

/**
 * 腾讯云通用印刷体识别（OCR）可选集成点。
 * 生产环境需按腾讯云 TC3 签名调用 API；此处提供「HTTP 代理」模式便于一键切换：
 * 自建微服务接收 multipart 图片，返回 `{ "text": "..." }`，配置 TENCENT_OCR_HTTP_URL 即可。
 */
@Injectable()
export class TencentOcrClientService {
  private readonly logger = new Logger(TencentOcrClientService.name)

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const url = this.config.get<string>('TENCENT_OCR_HTTP_URL')?.trim()
    return (url?.length ?? 0) > 0
  }

  /** 将 JPEG 二进制转发到配置的 HTTP OCR 代理 */
  async recognizeJpegBuffer(buf: Buffer): Promise<string | null> {
    const url = this.config.get<string>('TENCENT_OCR_HTTP_URL')?.trim()
    if (!url) return null
    const timeoutMs = parseInt(this.config.get<string>('TENCENT_OCR_HTTP_TIMEOUT_MS') || '60000', 10)
    try {
      const { data } = await axios.post<{ text?: string }>(
        url,
        buf,
        {
          headers: { 'Content-Type': 'application/octet-stream' },
          timeout: Number.isFinite(timeoutMs) && timeoutMs > 3000 ? timeoutMs : 60_000,
        },
      )
      const t = typeof data?.text === 'string' ? data.text.trim() : ''
      return t || null
    } catch (e) {
      this.logger.warn(`TENCENT_OCR_HTTP_URL 调用失败: ${(e as Error).message}`)
      return null
    }
  }
}
