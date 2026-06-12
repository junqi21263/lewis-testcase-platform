import { describe, expect, it, vi } from 'vitest'
import { templatesApi } from './templates'
import { request } from '@/utils/request'

vi.mock('@/utils/request', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('templatesApi', () => {
  it('uses a long quiet request for prompt evaluation', async () => {
    await templatesApi.evaluateTemplate('tpl_1', { sampleLimit: 3 })

    expect(request.post).toHaveBeenCalledWith(
      '/templates/tpl_1/evaluate',
      { sampleLimit: 3 },
      expect.objectContaining({
        timeout: expect.any(Number),
        suppressToast: true,
      }),
    )
    const config = vi.mocked(request.post).mock.calls[0][2]
    expect(config?.timeout).toBeGreaterThan(60_000)
  })
})
