import { RedisService } from '@/redis/redis.service'
import { AiRuntimeQueueService } from '@/modules/ai/ai-runtime-queue.service'
import { AiStreamRecoveryService } from '@/modules/ai/ai-stream-recovery.service'
import { FileParseRuntimeService } from '@/modules/files/file-parse-runtime.service'

function serviceWithClient(client: Record<string, jest.Mock>) {
  const svc = new RedisService() as any
  svc.client = client
  return svc as RedisService
}

describe('Redis runtime helpers', () => {
  it('stores and reads stream chunks for interrupted AI streams', async () => {
    const list: string[] = []
    const client = {
      status: 'ready',
      rpush: jest.fn(async (_key: string, value: string) => list.push(value)),
      expire: jest.fn(),
      lrange: jest.fn(async () => list),
      del: jest.fn(),
    } as any
    const redis = serviceWithClient(client)

    await redis.appendStreamChunk('stream-1', 'hello ')
    await redis.appendStreamChunk('stream-1', 'world')
    const snapshot = await redis.getStreamSnapshot('stream-1')

    expect(snapshot).toBe('hello world')
    expect(client.expire).toHaveBeenCalled()
  })

  it('enqueues and dequeues lightweight redis jobs', async () => {
    const queue: string[] = []
    const client = {
      status: 'ready',
      lpush: jest.fn(async (_key: string, value: string) => queue.unshift(value)),
      rpop: jest.fn(async () => queue.pop() ?? null),
      expire: jest.fn(),
    } as any
    const redis = serviceWithClient(client)

    await redis.enqueueJob('file-parse', { fileId: 'file-1' })
    const job = await redis.dequeueJob<{ fileId: string }>('file-parse')

    expect(job?.fileId).toBe('file-1')
    expect(client.lpush).toHaveBeenCalledWith('queue:file-parse', JSON.stringify({ fileId: 'file-1' }))
  })

  it('merges realtime parse progress over database state', async () => {
    const client = {
      status: 'ready',
      setex: jest.fn(),
      get: jest.fn(async () => JSON.stringify({ parseStage: 'OCR', parseProgress: { pageCurrent: 2 } })),
    } as any
    const redis = serviceWithClient(client)

    await redis.setFileParseProgress('file-1', 'OCR', { pageCurrent: 2 })
    const merged = await redis.mergeFileParseRealtime('file-1', {
      status: 'PARSING',
      parseStage: 'PDF',
      parseProgress: null,
    })

    expect(merged).toEqual({
      status: 'PARSING',
      parseStage: 'OCR',
      parseProgress: { pageCurrent: 2 },
    })
  })

  it('does not throw business errors when redis is unavailable', async () => {
    const redis = serviceWithClient({
      status: 'end',
      get: jest.fn(async () => {
        throw new Error('redis down')
      }),
      setex: jest.fn(async () => {
        throw new Error('redis down')
      }),
      lpush: jest.fn(async () => {
        throw new Error('redis down')
      }),
      rpop: jest.fn(async () => {
        throw new Error('redis down')
      }),
      llen: jest.fn(async () => {
        throw new Error('redis down')
      }),
      rpush: jest.fn(async () => {
        throw new Error('redis down')
      }),
      lrange: jest.fn(async () => {
        throw new Error('redis down')
      }),
      del: jest.fn(async () => {
        throw new Error('redis down')
      }),
    } as any)

    await expect(redis.setEntry('k', 'v', 1)).resolves.toBeUndefined()
    await expect(redis.enqueueJob('ai-analysis', { recordId: 'r1' })).resolves.toBeUndefined()
    await expect(redis.dequeueJob('ai-analysis')).resolves.toBeNull()
    await expect(redis.queueLength('ai-analysis')).resolves.toBe(0)
    await expect(redis.appendStreamChunk('r1', 'delta')).resolves.toBeUndefined()
    await expect(redis.getStreamSnapshot('r1')).resolves.toBe('')
    await expect(redis.clearStreamSnapshot('r1')).resolves.toBeUndefined()
    await expect(redis.mergeFileParseRealtime('f1', { parseStage: 'DB' })).resolves.toEqual({
      parseStage: 'DB',
    })
  })

  it('keeps AI stream and queue runtime services safe without redis', async () => {
    const stream = new AiStreamRecoveryService(undefined as any)
    const queue = new AiRuntimeQueueService(undefined as any)

    await expect(stream.snapshot('r1')).resolves.toBe('')
    await expect(stream.append('r1', 'delta')).resolves.toBeUndefined()
    await expect(queue.enqueue('ai-generate', { recordId: 'r1' })).resolves.toBe(false)
    await expect(queue.length('ai-generate')).resolves.toBe(0)
    await expect(queue.drain('ai-generate', jest.fn())).resolves.toBeUndefined()
  })

  it('keeps caching stream chunks when the browser response is already closed', async () => {
    const redis = {
      appendStreamChunk: jest.fn().mockResolvedValue(undefined),
    }
    const stream = new AiStreamRecoveryService(redis as any)
    const response = {
      destroyed: true,
      writableEnded: false,
      write: jest.fn(() => {
        throw new Error('Cannot write after close')
      }),
    }

    await expect(stream.writeSseContent(response as any, 'record-1', 'delta')).resolves.toBeUndefined()

    expect(redis.appendStreamChunk).toHaveBeenCalledWith('record-1', 'delta')
    expect(response.write).not.toHaveBeenCalled()
  })

  it('delegates file parse runtime to redis when available and throttles db heartbeats', async () => {
    const redis = {
      isReady: jest.fn(() => true),
      enqueueJob: jest.fn(),
      setFileParseProgress: jest.fn(),
      clearFileParseProgress: jest.fn(),
      mergeFileParseRealtime: jest.fn(async (_fileId: string, payload: any) => ({
        ...payload,
        parseStage: 'OCR',
      })),
    }
    const runtime = new FileParseRuntimeService(redis as any)

    await runtime.enqueue('file-1', 'PDF')
    await runtime.setProgress('file-1', 'OCR', { pageCurrent: 1 })
    const merged = await runtime.mergeRealtime('file-1', { parseStage: 'PDF' })
    await runtime.clearProgress('file-1')

    const state = { lastDbWriteAt: Date.now(), lastDbStage: 'OCR' }
    expect(runtime.shouldWriteHeartbeatToDb('OCR', { pageCurrent: 2 }, state)).toBe(false)
    expect(runtime.shouldWriteHeartbeatToDb('DONE', undefined, state)).toBe(true)
    expect(merged.parseStage).toBe('OCR')
    expect(redis.enqueueJob).toHaveBeenCalledWith('file-parse', { fileId: 'file-1', fileType: 'PDF' })
    expect(redis.setFileParseProgress).toHaveBeenCalledWith('file-1', 'OCR', { pageCurrent: 1 })
    expect(redis.clearFileParseProgress).toHaveBeenCalledWith('file-1')
  })
})
