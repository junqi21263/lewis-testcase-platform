import { Injectable, Optional } from '@nestjs/common'
import { RedisService } from '@/redis/redis.service'

type HeartbeatState = {
  lastDbWriteAt: number
  lastDbStage: string
}

@Injectable()
export class FileParseRuntimeService {
  constructor(@Optional() private readonly redis?: RedisService) {}

  redisReady(): boolean {
    return this.redis?.isReady() ?? false
  }

  async enqueue(fileId: string, fileType: string): Promise<void> {
    await this.redis?.enqueueJob('file-parse', { fileId, fileType })
  }

  async setProgress(fileId: string, stage: string, progress?: unknown): Promise<void> {
    await this.redis?.setFileParseProgress(fileId, stage, progress ?? null)
  }

  async clearProgress(fileId: string): Promise<void> {
    await this.redis?.clearFileParseProgress(fileId)
  }

  mergeRealtime<T extends { parseStage?: string | null; parseProgress?: unknown; status?: unknown }>(
    fileId: string,
    dbPayload: T,
  ): Promise<T> {
    return this.redis?.mergeFileParseRealtime(fileId, dbPayload) ?? Promise.resolve(dbPayload)
  }

  shouldWriteHeartbeatToDb(stage: string, progress: Record<string, unknown> | undefined, state: HeartbeatState): boolean {
    if (!this.redisReady()) return true
    const nowMs = Date.now()
    return (
      stage !== state.lastDbStage ||
      nowMs - state.lastDbWriteAt > 10_000 ||
      !progress ||
      Object.keys(progress).length === 0
    )
  }

  markHeartbeatDbWritten(stage: string, state: HeartbeatState): void {
    state.lastDbWriteAt = Date.now()
    state.lastDbStage = stage
  }
}
