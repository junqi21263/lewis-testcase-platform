import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * 轻量并发限制器：控制同时进行的 OCR 任务数（默认 3）。
 * 可与 Tesseract Worker 池并用：并发槽 ≥ Worker 数时才能吃满多 Worker。
 */
@Injectable()
export class OcrQueueService {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly config: ConfigService) {}

  private maxConcurrent(): number {
    const n = parseInt(this.config.get<string>('IMAGE_OCR_MAX_CONCURRENT') || '3', 10)
    return Number.isFinite(n) && n > 0 ? Math.min(n, 16) : 3
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const wait = () => {
        if (this.active < this.maxConcurrent()) {
          this.active++
          resolve()
        } else {
          this.waiting.push(wait)
        }
      }
      wait()
    })
    try {
      return await fn()
    } finally {
      this.active--
      const next = this.waiting.shift()
      if (next) next()
    }
  }
}
