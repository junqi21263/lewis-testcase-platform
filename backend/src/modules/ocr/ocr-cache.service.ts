import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface CacheEntry {
  text: string
  /** epoch ms */
  expiresAt: number
}

/**
 * 进程内 OCR 结果缓存：MD5 → 文本，默认 TTL 7 天。
 * 大规模部署可替换为 Redis（本实现零额外依赖，与「简单队列」策略一致）。
 */
@Injectable()
export class OcrCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrCacheService.name)
  private readonly store = new Map<string, CacheEntry>()
  private sweepTimer?: NodeJS.Timeout

  constructor(private readonly config: ConfigService) {
    const enabled = this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') !== '0'
    if (!enabled) {
      this.logger.log('IMAGE_OCR_CACHE_ENABLED=0，OCR 缓存已关闭')
      return
    }
    const sweepMs = parseInt(this.config.get<string>('IMAGE_OCR_CACHE_SWEEP_MS') || '600000', 10)
    this.sweepTimer = setInterval(() => this.sweep(), Number.isFinite(sweepMs) && sweepMs > 60_000 ? sweepMs : 600_000)
    this.sweepTimer.unref?.()
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer)
  }

  private ttlMs(): number {
    const days = parseFloat(this.config.get<string>('IMAGE_OCR_CACHE_TTL_DAYS') || '7')
    const d = Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 7
    return Math.round(d * 24 * 60 * 60 * 1000)
  }

  get(md5: string): string | null {
    if (this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') === '0') return null
    const e = this.store.get(md5)
    if (!e) return null
    if (Date.now() > e.expiresAt) {
      this.store.delete(md5)
      return null
    }
    return e.text
  }

  set(md5: string, text: string): void {
    if (this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') === '0') return
    this.store.set(md5, { text, expiresAt: Date.now() + this.ttlMs() })
  }

  /** 运维 / 调试：清空全部 OCR 缓存 */
  clearAll(): number {
    const n = this.store.size
    this.store.clear()
    this.logger.log(`OCR 缓存已清空，共 ${n} 条`)
    return n
  }

  deleteKey(md5: string): boolean {
    return this.store.delete(md5)
  }

  private sweep() {
    const now = Date.now()
    let removed = 0
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) {
        this.store.delete(k)
        removed++
      }
    }
    if (removed) this.logger.debug(`OCR 缓存 sweep 移除 ${removed} 条过期项`)
  }
}
