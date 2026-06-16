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
  it('deletes AI model configs with DELETE instead of archive POST', async () => {
    await settingsApi.deleteModel('model-1')

    expect(request.delete).toHaveBeenCalledWith('/settings/models/model-1')
    expect(request.post).not.toHaveBeenCalledWith('/settings/models/model-1/archive')
  })
})
