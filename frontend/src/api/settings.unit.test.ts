import { describe, expect, it, vi } from 'vitest'
import { settingsApi } from './settings'
import { request } from '@/utils/request'

vi.mock('@/utils/request', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  },
}))

describe('settingsApi', () => {
  it('loads runtime hints with redis queue observability fields', async () => {
    vi.mocked(request.get).mockResolvedValueOnce({
      redis: { ready: true, enabled: true, urlConfigured: true },
      queues: [{ name: 'ai-analysis', pending: 1 }],
    })

    const runtime = await settingsApi.getRuntime()

    expect(request.get).toHaveBeenCalledWith('/settings/runtime')
    expect(runtime.redis?.ready).toBe(true)
    expect(runtime.queues?.[0]).toEqual({ name: 'ai-analysis', pending: 1 })
  })

  it('deletes AI model configs with DELETE instead of archive POST', async () => {
    await settingsApi.deleteModel('model-1')

    expect(request.delete).toHaveBeenCalledWith('/settings/models/model-1')
    expect(request.post).not.toHaveBeenCalledWith('/settings/models/model-1/archive')
  })
})
