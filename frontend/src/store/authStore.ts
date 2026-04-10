import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  rememberMe: boolean
  loading: boolean
  error: string | null
  successMessage: string | null
  setAuth: (user: User, token: string, rememberMe?: boolean) => void
  updateUser: (user: Partial<User>) => void
  logout: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSuccessMessage: (message: string | null) => void
}

/** 认证状态 Store，持久化到 localStorage */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      rememberMe: false,
      loading: false,
      error: null,
      successMessage: null,

      setAuth: (user, token, rememberMe = false) => {
        set({ user, token, isAuthenticated: true, rememberMe, loading: false, error: null, successMessage: null })
      },

      updateUser: (partial) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...partial } : null,
        }))
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false, rememberMe: false, loading: false, error: null, successMessage: null })
      },

      setLoading: (loading) => {
        set({ loading })
      },

      setError: (error) => {
        set({ error, loading: false, successMessage: null })
      },

      setSuccessMessage: (message) => {
        set({ successMessage: message, loading: false, error: null })
      },
    }),
    {
      name: 'auth-storage',
      // 只持久化 token 和 user，isAuthenticated 由此派生
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated, rememberMe: state.rememberMe }),
    },
  ),
)
