import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * 轻量并发限制器：控制同时进行的 OCR 任务数（默认 3）。
 * 可与 Tesseract Worker 池并用：并发槽 ≥ Worker 数时才能吃满多 Worker。
 */
@Injectable()
export class OcrQueueService {
  private active = 0
  private readonly waiting: Array<{
    resolve: () => void
    reject: (err: Error) => void
    timeout: NodeJS.Timeout | null
    expired: boolean
  }> = []

  constructor(private readonly config: ConfigService) {}

  private maxConcurrent(): number {
    const n = parseInt(this.config.get<string>('IMAGE_OCR_MAX_CONCURRENT') || '3', 10)
    return Number.isFinite(n) && n > 0 ? Math.min(n, 16) : 3
  }

  private maxWaiting(): number {
    const n = parseInt(this.config.get<string>('IMAGE_OCR_QUEUE_MAX_WAITING') || '100', 10)
    if (!Number.isFinite(n) || n < 0) return 100
    return Math.min(n, 10_000)
  }

  private waitTimeoutMs(): number {
    const n = parseInt(this.config.get<string>('IMAGE_OCR_QUEUE_WAIT_TIMEOUT_MS') || '60000', 10)
    if (!Number.isFinite(n) || n < 100) return 60_000
    return Math.min(n, 10 * 60_000)
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent()) {
      if (this.waiting.length >= this.maxWaiting()) {
        throw new ServiceUnavailableException('OCR 排队已满，请稍后重试')
      }
      await new Promise<void>((resolve, reject) => {
        const entry = {
          resolve: () => resolve(),
          reject: (err: Error) => reject(err),
          timeout: null as NodeJS.Timeout | null,
          expired: false,
        }
        const timeoutMs = this.waitTimeoutMs()
        entry.timeout = setTimeout(() => {
          entry.expired = true
          const idx = this.waiting.indexOf(entry)
          if (idx >= 0) this.waiting.splice(idx, 1)
          entry.reject(new ServiceUnavailableException('OCR 排队超时，请稍后重试'))
        }, timeoutMs)
        this.waiting.push(entry)
      })
    } else {
      this.active++
    }
    try {
      return await fn()
    } finally {
      this.active = Math.max(0, this.active - 1)
      while (this.waiting.length > 0 && this.active < this.maxConcurrent()) {
        const next = this.waiting.shift()
        if (!next || next.expired) continue
        if (next.timeout) clearTimeout(next.timeout)
        this.active++
        next.resolve()
        break
      }
    }
  }
}
