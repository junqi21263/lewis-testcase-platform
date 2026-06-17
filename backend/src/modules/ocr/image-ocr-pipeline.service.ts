import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import { ImagePreprocessService } from './image-preprocess.service'
import { OcrCacheService } from './ocr-cache.service'
import { OcrEngineService } from './ocr-engine.service'
import { OcrQueueService } from './ocr-queue.service'
import { TencentOcrClientService } from './tencent-ocr.client.service'

export type OcrProgressPayload = {
  phase: string
  ocrStripCurrent?: number
  ocrStripTotal?: number
  message?: string
}

/**
 * 图片 OCR 主链路：MD5 缓存 →（可选）云端 HTTP OCR → 预处理 → 竖向分块 →
 * 并发队列 + Worker 池逐块识别 → 合并文本；含自动重试。
 */
@Injectable()
export class ImageOcrPipelineService {
  private readonly logger = new Logger(ImageOcrPipelineService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly preprocess: ImagePreprocessService,
    private readonly cache: OcrCacheService,
    private readonly engine: OcrEngineService,
    private readonly queue: OcrQueueService,
    private readonly tencent: TencentOcrClientService,
  ) {}

  private autoRetries(): number {
    const n = parseInt(this.config.get<string>('IMAGE_OCR_AUTO_RETRIES') || '2', 10)
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 5) : 2
  }

  /**
   * 从磁盘路径识别（用于上传后的本地文件）。
   * @param onProgress 回写 parseProgress（如 OCR 分块序号）
   */
  async recognizeFilePath(
    filePath: string,
    opts?: { onProgress?: (p: OcrProgressPayload) => void | Promise<void> },
  ): Promise<string> {
    const buf = fs.readFileSync(filePath)
    const md5 = this.preprocess.md5Buffer(buf)
    return this.recognizeWithMd5(md5, buf, filePath, opts)
  }

  /** PNG 等内存缓冲（PDF 分页 OCR 等），可带 cacheSalt 避免与整图 MD5 冲突 */
  async recognizeBuffer(
    buffer: Buffer,
    opts?: { cacheSalt?: string; onProgress?: (p: OcrProgressPayload) => void | Promise<void> },
  ): Promise<string> {
    const salt = opts?.cacheSalt ? `:${opts.cacheSalt}` : ''
    const md5 = this.preprocess.md5Buffer(buffer) + salt
    return this.recognizeWithMd5(md5, buffer, null, opts)
  }

  private async recognizeWithMd5(
    cacheKey: string,
    originalBuf: Buffer,
    diskPath: string | null,
    opts?: { onProgress?: (p: OcrProgressPayload) => void | Promise<void> },
  ): Promise<string> {
    const cached = await this.cache.getAsync(cacheKey)
    if (cached) {
      await opts?.onProgress?.({ phase: 'OCR', message: 'cache_hit' })
      return cached
    }

    const retries = this.autoRetries()
    let lastErr: Error | undefined
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const text = await this.recognizeOnce(originalBuf, diskPath, opts)
        if (text.trim()) {
          await this.cache.setAsync(cacheKey, text)
          return text
        }
        lastErr = new Error('OCR 结果为空')
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
        this.logger.warn(`OCR 尝试 ${attempt + 1}/${retries + 1} 失败: ${lastErr.message}`)
      }
    }
    throw lastErr ?? new Error('OCR 失败')
  }

  private async recognizeOnce(
    originalBuf: Buffer,
    diskPath: string | null,
    opts?: { onProgress?: (p: OcrProgressPayload) => void | Promise<void> },
  ): Promise<string> {
    await opts?.onProgress?.({ phase: 'OCR', message: 'preprocess_start' })

    let workBuf = await this.tryPreprocess(diskPath, originalBuf)
    if (!workBuf) workBuf = originalBuf

    if (this.tencent.isEnabled()) {
      const cloud = await this.tencent.recognizeJpegBuffer(
        workBuf[0] === 0xff && workBuf[1] === 0xd8 ? workBuf : originalBuf,
      )
      if (cloud?.trim()) {
        await opts?.onProgress?.({ phase: 'OCR', message: 'tencent_http_ok' })
        return cloud
      }
    }

    const chunks = await this.preprocess.splitVerticalJpegChunks(workBuf)
    const total = chunks.length
    await opts?.onProgress?.({
      phase: 'OCR',
      ocrStripCurrent: 0,
      ocrStripTotal: total,
      message: 'strips_ready',
    })

    const parts: string[] = await Promise.all(
      chunks.map((chunk, idx) =>
        this.queue.run(async () => {
          await opts?.onProgress?.({
            phase: 'OCR',
            ocrStripCurrent: idx + 1,
            ocrStripTotal: total,
            message: 'strip_ocr',
          })
          const t = await this.engine.recognize(chunk)
          return t.trim()
        }),
      ),
    )

    const merged = parts.filter(Boolean).join('\n\n')
    await opts?.onProgress?.({
      phase: 'OCR',
      ocrStripCurrent: total,
      ocrStripTotal: total,
      message: 'ocr_done',
    })
    return merged
  }

  private async tryPreprocess(diskPath: string | null, originalBuf: Buffer): Promise<Buffer | null> {
    try {
      if (diskPath && fs.existsSync(diskPath)) {
        return await this.preprocess.preprocessToJpegBuffer(diskPath)
      }
      return await this.preprocess.preprocessBufferToJpegBuffer(originalBuf)
    } catch (e) {
      this.logger.debug(`预处理跳过: ${(e as Error).message}`)
      return null
    }
  }
}
