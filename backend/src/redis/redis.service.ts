import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'

const GEN_KEY = 'tpl:list:gen'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis | null = null

  async onModuleInit() {
    const url = process.env.REDIS_URL?.trim()
    const want = ['1', 'true'].includes((process.env.TEMPLATES_LIST_CACHE_REDIS || '').trim().toLowerCase())
    if (!url || !want) {
      this.logger.log(
        'Template list cache: Redis backend off (set REDIS_URL + TEMPLATES_LIST_CACHE_REDIS=1 for multi-replica).',
      )
      return
    }
    try {
      const c = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 8000 })
      await c.ping()
      this.client = c
      this.logger.log('Redis: connected; template list cache can sync across instances.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`Redis connect failed (${msg}); template list cache uses in-process only.`)
      this.client?.disconnect()
      this.client = null
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
  }

  /** Redis selected for template list + wired and connected */
  isReady(): boolean {
    return this.client !== null && this.client.status === 'ready'
  }

  async getListGen(): Promise<number> {
    if (!this.client) return 0
    try {
      const v = await this.client.get(GEN_KEY)
      return v === null || v === undefined ? 0 : Number(v) || 0
    } catch {
      return 0
    }
  }

  async incrListGen(): Promise<void> {
    if (!this.client) return
    try {
      await this.client.incr(GEN_KEY)
    } catch {
      /* fall through */
    }
  }

  async getEntry(key: string): Promise<string | null> {
    if (!this.client) return null
    try {
      return await this.client.get(key)
    } catch {
      return null
    }
  }

  async setEntry(key: string, value: string, ttlSec: number): Promise<void> {
    if (!this.client) return
    try {
      const sec = Math.max(1, Math.ceil(ttlSec))
      await this.client.setex(key, sec, value)
    } catch {
      /* fall through */
    }
  }
}
