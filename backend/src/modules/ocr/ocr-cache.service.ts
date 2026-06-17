import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { RedisService } from '@/redis/redis.service'

interface CacheEntry {
  text: string
  /** epoch ms */
  expiresAt: number
  textBytes: number
}

/**
 * 进程内 OCR 结果缓存：MD5 → 文本，默认 TTL 7 天。
 * 大规模部署可替换为 Redis（本实现零额外依赖，与「简单队列」策略一致）。
 */
@Injectable()
export class OcrCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrCacheService.name)
  private readonly store = new Map<string, CacheEntry>()
  private totalTextBytes = 0
  private sweepTimer?: NodeJS.Timeout

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
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

  private ttlSec(): number {
    return Math.max(1, Math.ceil(this.ttlMs() / 1000))
  }

  private redisKey(md5: string): string {
    return `ocr:result:${md5}`
  }

  private maxEntries(): number {
    const raw = parseInt(this.config.get<string>('IMAGE_OCR_CACHE_MAX_ENTRIES') || '1000', 10)
    if (!Number.isFinite(raw) || raw < 1) return 1000
    return Math.min(raw, 20_000)
  }

  private maxTextBytes(): number {
    const raw = parseInt(
      this.config.get<string>('IMAGE_OCR_CACHE_MAX_TEXT_BYTES') || String(50 * 1024 * 1024),
      10,
    )
    if (!Number.isFinite(raw) || raw < 1) return 50 * 1024 * 1024
    return Math.min(raw, 512 * 1024 * 1024)
  }

  private approxBytes(text: string): number {
    return Buffer.byteLength(text || '', 'utf8')
  }

  private evictIfNeeded() {
    const maxEntries = this.maxEntries()
    const maxBytes = this.maxTextBytes()
    while (this.store.size > maxEntries || this.totalTextBytes > maxBytes) {
      const oldest = this.store.keys().next().value as string | undefined
      if (!oldest) break
      const entry = this.store.get(oldest)
      this.store.delete(oldest)
      if (entry) this.totalTextBytes = Math.max(0, this.totalTextBytes - entry.textBytes)
    }
  }

  get(md5: string): string | null {
    if (this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') === '0') return null
    const e = this.store.get(md5)
    if (!e) return null
    if (Date.now() > e.expiresAt) {
      this.store.delete(md5)
      this.totalTextBytes = Math.max(0, this.totalTextBytes - e.textBytes)
      return null
    }
    // LRU: 访问后提升到最近使用
    this.store.delete(md5)
    this.store.set(md5, e)
    return e.text
  }

  async getAsync(md5: string): Promise<string | null> {
    if (this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') === '0') return null
    if (this.redis?.isReady()) {
      const redisValue = await this.redis.getEntry(this.redisKey(md5))
      if (redisValue !== null && redisValue !== undefined) return redisValue
    }
    return this.get(md5)
  }

  set(md5: string, text: string): void {
    if (this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') === '0') return
    const prev = this.store.get(md5)
    if (prev) {
      this.totalTextBytes = Math.max(0, this.totalTextBytes - prev.textBytes)
      this.store.delete(md5)
    }
    const entry: CacheEntry = {
      text,
      expiresAt: Date.now() + this.ttlMs(),
      textBytes: this.approxBytes(text),
    }
    this.store.set(md5, entry)
    this.totalTextBytes += entry.textBytes
    this.evictIfNeeded()
  }

  async setAsync(md5: string, text: string): Promise<void> {
    if (this.config.get<string>('IMAGE_OCR_CACHE_ENABLED') === '0') return
    if (this.redis?.isReady()) {
      await this.redis.setEntry(this.redisKey(md5), text, this.ttlSec())
    }
    this.set(md5, text)
  }

  /** 运维 / 调试：清空全部 OCR 缓存 */
  clearAll(): number {
    const n = this.store.size
    this.store.clear()
    this.totalTextBytes = 0
    this.logger.log(`OCR 缓存已清空，共 ${n} 条`)
    return n
  }

  deleteKey(md5: string): boolean {
    const prev = this.store.get(md5)
    const ok = this.store.delete(md5)
    if (ok && prev) {
      this.totalTextBytes = Math.max(0, this.totalTextBytes - prev.textBytes)
    }
    return ok
  }

  private sweep() {
    const now = Date.now()
    let removed = 0
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) {
        this.store.delete(k)
        this.totalTextBytes = Math.max(0, this.totalTextBytes - v.textBytes)
        removed++
      }
    }
    if (removed) this.logger.debug(`OCR 缓存 sweep 移除 ${removed} 条过期项`)
  }
}
