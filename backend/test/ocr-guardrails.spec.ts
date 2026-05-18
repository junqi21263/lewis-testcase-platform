import { OcrCacheService } from '@/modules/ocr/ocr-cache.service'
import { OcrQueueService } from '@/modules/ocr/ocr-queue.service'

function configFrom(map: Record<string, string>) {
  return {
    get: (key: string, defaultValue?: string) => {
      if (Object.prototype.hasOwnProperty.call(map, key)) return map[key]
      return defaultValue
    },
  } as any
}

describe('OCR cache guardrails', () => {
  it('evicts old entries when max entries exceeded', () => {
    const svc = new OcrCacheService(
      configFrom({
        IMAGE_OCR_CACHE_ENABLED: '1',
        IMAGE_OCR_CACHE_MAX_ENTRIES: '2',
        IMAGE_OCR_CACHE_MAX_TEXT_BYTES: '999999',
      }),
    )
    svc.set('a', '1')
    svc.set('b', '2')
    svc.set('c', '3')
    expect(svc.get('a')).toBeNull()
    expect(svc.get('b')).toBe('2')
    expect(svc.get('c')).toBe('3')
    svc.onModuleDestroy()
  })
})

describe('OCR queue guardrails', () => {
  it('rejects immediately when waiting queue is full', async () => {
    const svc = new OcrQueueService(
      configFrom({
        IMAGE_OCR_MAX_CONCURRENT: '1',
        IMAGE_OCR_QUEUE_MAX_WAITING: '0',
        IMAGE_OCR_QUEUE_WAIT_TIMEOUT_MS: '1000',
      }),
    )
    let releaseFirst!: () => void
    const first = svc.run(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('ok')
        }),
    )
    await expect(svc.run(async () => 'second')).rejects.toThrow('OCR 排队已满')
    releaseFirst()
    await expect(first).resolves.toBe('ok')
  })

  it('times out waiting task and removes it from queue', async () => {
    const svc = new OcrQueueService(
      configFrom({
        IMAGE_OCR_MAX_CONCURRENT: '1',
        IMAGE_OCR_QUEUE_MAX_WAITING: '2',
        IMAGE_OCR_QUEUE_WAIT_TIMEOUT_MS: '120',
      }),
    )
    let releaseFirst!: () => void
    const first = svc.run(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = () => resolve('ok')
        }),
    )
    await expect(svc.run(async () => 'second')).rejects.toThrow('OCR 排队超时')
    releaseFirst()
    await expect(first).resolves.toBe('ok')
  })
})
