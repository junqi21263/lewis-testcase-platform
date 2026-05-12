import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type TesseractWorker = {
  load: () => Promise<void>
  loadLanguage: (langs: string) => Promise<void>
  initialize: (langs: string) => Promise<void>
  recognize: (image: string | Buffer) => Promise<{ data: { text: string } }>
  terminate: () => Promise<void>
}

/**
 * Tesseract Worker 池：服务启动时预热，避免首次 recognize 冷启动数秒级延迟。
 * 池大小 IMAGE_OCR_WORKER_POOL（默认 2），与队列并发配合可并行多块竖切 OCR。
 */
@Injectable()
export class OcrEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrEngineService.name)
  private pool: TesseractWorker[] = []
  private poolSize = 1
  private langs = 'chi_sim+chi_tra+eng'
  private ready: Promise<void> | null = null

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const warm = this.config.get<string>('IMAGE_OCR_WARMUP') !== '0'
    if (!warm) {
      this.logger.warn('IMAGE_OCR_WARMUP=0，跳过 Tesseract 预热')
      return
    }
    this.poolSize = parseInt(this.config.get<string>('IMAGE_OCR_WORKER_POOL') || '2', 10)
    this.poolSize = Number.isFinite(this.poolSize) ? Math.min(Math.max(this.poolSize, 1), 4) : 2
    this.langs =
      (this.config.get<string>('OCR_LANGS') || 'chi_sim+chi_tra+eng').trim() || 'chi_sim+chi_tra+eng'
    this.ready = this.initPool()
    try {
      await this.ready
      this.logger.log(`Tesseract Worker 池已预热，数量=${this.pool.length}，语言=${this.langs}`)
    } catch (e) {
      this.logger.error(`Tesseract 预热失败，将按需降级单次识别: ${(e as Error).message}`)
      this.pool = []
    }
  }

  private async initPool() {
    const { createWorker } = await import('tesseract.js')
    this.pool = []
    for (let i = 0; i < this.poolSize; i++) {
      const w = (await createWorker()) as unknown as TesseractWorker
      try {
        await w.load()
      } catch {
        /* tesseract.js v5 部分构建无独立 load()，忽略 */
      }
      await w.loadLanguage(this.langs)
      await w.initialize(this.langs)
      this.pool.push(w)
    }
  }

  async onModuleDestroy() {
    for (const w of this.pool) {
      try {
        await w.terminate()
      } catch {
        /* ignore */
      }
    }
    this.pool = []
  }

  /** 使用池内 worker 执行识别（内部串行占用 worker） */
  async recognize(image: string | Buffer): Promise<string> {
    if (this.ready) await this.ready
    if (this.pool.length === 0) {
      return this.recognizeFallback(image)
    }
    const w = this.pool[Math.floor(Math.random() * this.pool.length)]
    const { data } = await w.recognize(image)
    return (data?.text ?? '').trim()
  }

  /** 未预热成功时降级：单次 recognize（会慢） */
  private async recognizeFallback(image: string | Buffer): Promise<string> {
    const Tesseract = await import('tesseract.js')
    const langs = this.langs
    const {
      data: { text },
    } = await Tesseract.recognize(image, langs)
    return (text ?? '').trim()
  }
}
