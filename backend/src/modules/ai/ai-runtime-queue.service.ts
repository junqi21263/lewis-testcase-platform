import { Injectable, Optional } from '@nestjs/common'
import { RedisService } from '@/redis/redis.service'

@Injectable()
export class AiRuntimeQueueService {
  private readonly draining = new Set<string>()

  constructor(@Optional() private readonly redis?: RedisService) {}

  isReady(): boolean {
    return this.redis?.isReady() ?? false
  }

  async enqueue<T extends object>(queueName: string, payload: T): Promise<boolean> {
    if (!this.redis?.isReady()) return false
    await this.redis.enqueueJob(queueName, payload)
    return true
  }

  async length(queueName: string): Promise<number> {
    return this.redis?.queueLength(queueName) ?? 0
  }

  async drain<T extends object>(
    queueName: string,
    handler: (job: T) => Promise<void>,
    options: { batchSize?: number; onMore?: () => void } = {},
  ): Promise<void> {
    if (!this.redis?.isReady()) return
    if (this.draining.has(queueName)) return
    this.draining.add(queueName)
    try {
      const batchSize = Math.max(1, options.batchSize ?? 5)
      for (let i = 0; i < batchSize; i++) {
        const job = await this.redis.dequeueJob<T>(queueName)
        if (!job) return
        await handler(job)
      }
    } finally {
      this.draining.delete(queueName)
      if ((await this.length(queueName)) > 0) {
        options.onMore?.()
      }
    }
  }
}
