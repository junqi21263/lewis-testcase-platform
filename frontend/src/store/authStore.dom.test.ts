import { describe, it, expect, beforeEach } from 'vitest'
import type { User } from '@/types'
import { useAuthStore } from './authStore'

const baseUser: User = {
  id: '1',
  username: 'u',
  email: 'e@x.com',
  role: 'MEMBER',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.persist.rehydrate()
    useAuthStore.getState().logout()
  })

  it('setAuth stores user and token', () => {
    useAuthStore.getState().setAuth({ ...baseUser }, 'tok', true)
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(true)
    expect(s.token).toBe('tok')
    expect(s.user?.username).toBe('u')
    expect(s.rememberMe).toBe(true)
  })

  it('logout clears session', () => {
    useAuthStore.getState().setAuth({ ...baseUser }, 'tok')
    useAuthStore.getState().logout()
    const s = useAuthStore.getState()
    expect(s.isAuthenticated).toBe(false)
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
  })

  it('updateUser merges partial user', () => {
    useAuthStore.getState().setAuth({ ...baseUser, username: 'old' }, 't')
    useAuthStore.getState().updateUser({ username: 'new' })
    expect(useAuthStore.getState().user?.username).toBe('new')
    expect(useAuthStore.getState().user?.email).toBe('e@x.com')
  })
})
