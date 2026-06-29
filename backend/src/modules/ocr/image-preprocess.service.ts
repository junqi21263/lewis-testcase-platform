import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/**
 * 图片预处理：EXIF 自动旋转、限宽、转 JPEG、控制体积，显著降低 Tesseract 耗时与内存。
 * 关键参数见环境变量 IMAGE_OCR_*（.env.example）。
 */
@Injectable()
export class ImagePreprocessService {
  private readonly logger = new Logger(ImagePreprocessService.name)

  constructor(private readonly config: ConfigService) {}

  /** 原始文件 MD5（缓存键；与是否预处理无关） */
  md5File(filePath: string): string {
    const buf = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(buf).digest('hex')
  }

  md5Buffer(buf: Buffer): string {
    return crypto.createHash('md5').update(buf).digest('hex')
  }

  /**
   * 预处理为 JPEG Buffer；失败时返回 null，调用方降级使用原图。
   * — rotate() 根据 EXIF 自动摆正
   * — resize 最大宽度默认 1920（等比缩放，不放大）
   * — jpeg 质量默认 80，若仍超过 IMAGE_OCR_MAX_OUTPUT_BYTES 则逐步降质量
   */
  async preprocessToJpegBuffer(inputPath: string): Promise<Buffer | null> {
    let sharpMod: typeof import('sharp') | null = null
    try {
      sharpMod = (await import('sharp')).default
    } catch (e) {
      this.logger.warn(`sharp 未安装或加载失败，跳过图片预处理: ${(e as Error).message}`)
      return null
    }

    const maxW = parseInt(this.config.get<string>('IMAGE_OCR_MAX_WIDTH') || '1920', 10)
    const startQ = parseInt(this.config.get<string>('IMAGE_OCR_JPEG_QUALITY') || '80', 10)
    const maxBytes = parseInt(this.config.get<string>('IMAGE_OCR_MAX_OUTPUT_BYTES') || '512000', 10)
    const wCap = Number.isFinite(maxW) && maxW >= 640 ? Math.min(maxW, 8192) : 1920

    let base = sharpMod(inputPath).rotate()
    base = base.resize({
      width: wCap,
      height: undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })

    let q = Number.isFinite(startQ) ? Math.min(95, Math.max(40, startQ)) : 80
    let buf: Buffer | undefined
    for (let i = 0; i < 10; i++) {
      buf = await base.jpeg({ quality: q, mozjpeg: true }).toBuffer()
      if (buf.length <= maxBytes || q <= 45) break
      q -= 8
    }
    if (!buf?.length) return null
    if (buf.length > maxBytes) {
      this.logger.debug(`预处理后仍约 ${(buf.length / 1024).toFixed(0)}KB（目标≤${(maxBytes / 1024).toFixed(0)}KB），继续 OCR`)
    }
    return buf
  }

  /** 从内存 Buffer 预处理（PDF 页渲染图等无磁盘路径场景） */
  async preprocessBufferToJpegBuffer(input: Buffer): Promise<Buffer | null> {
    let sharpMod: typeof import('sharp') | null = null
    try {
      sharpMod = (await import('sharp')).default
    } catch (e) {
      this.logger.warn(`sharp 未安装或加载失败: ${(e as Error).message}`)
      return null
    }
    const maxW = parseInt(this.config.get<string>('IMAGE_OCR_MAX_WIDTH') || '1920', 10)
    const startQ = parseInt(this.config.get<string>('IMAGE_OCR_JPEG_QUALITY') || '80', 10)
    const maxBytes = parseInt(this.config.get<string>('IMAGE_OCR_MAX_OUTPUT_BYTES') || '512000', 10)
    const wCap = Number.isFinite(maxW) && maxW >= 640 ? Math.min(maxW, 8192) : 1920
    const base = sharpMod(input).rotate().resize({
      width: wCap,
      height: undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    let q = Number.isFinite(startQ) ? Math.min(95, Math.max(40, startQ)) : 80
    let buf: Buffer | undefined
    for (let i = 0; i < 10; i++) {
      buf = await base.jpeg({ quality: q, mozjpeg: true }).toBuffer()
      if (buf.length <= maxBytes || q <= 45) break
      q -= 8
    }
    return buf?.length ? buf : null
  }

  /**
   * 将 JPEG buffer 写入临时文件（供仅接受路径的 API 使用），调用方负责 unlink。
   */
  writeTempJpeg(buf: Buffer, prefix = 'ocr-pre'): string {
    const dir = this.config.get<string>('UPLOAD_DIR', './uploads')
    const tmp = path.join(dir, `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`)
    fs.writeFileSync(tmp, buf)
    return tmp
  }

  /**
   * 竖向分块（高度超过 IMAGE_OCR_CHUNK_MAX_HEIGHT 时），自上而下切片，避免单张超高图拖垮 OCR。
   */
  async splitVerticalJpegChunks(jpegBuffer: Buffer): Promise<Buffer[]> {
    let sharpMod: typeof import('sharp') | null = null
    try {
      sharpMod = (await import('sharp')).default
    } catch {
      return [jpegBuffer]
    }
    const maxH = parseInt(this.config.get<string>('IMAGE_OCR_CHUNK_MAX_HEIGHT') || '2000', 10)
    const cap = Number.isFinite(maxH) && maxH >= 800 ? Math.min(maxH, 8000) : 2000
    const img = sharpMod(jpegBuffer)
    const meta = await img.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (!w || !h || h <= cap) return [jpegBuffer]

    const chunks: Buffer[] = []
    for (let top = 0; top < h; top += cap) {
      const height = Math.min(cap, h - top)
      const piece = await sharpMod(jpegBuffer)
        .extract({ left: 0, top, width: w, height })
        .jpeg({ quality: Math.min(85, parseInt(this.config.get<string>('IMAGE_OCR_JPEG_QUALITY') || '80', 10) || 80), mozjpeg: true })
        .toBuffer()
      chunks.push(piece)
    }
    return chunks.length ? chunks : [jpegBuffer]
  }
}
