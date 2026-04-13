import { request } from '@/utils/request'
import { useAuthStore } from '@/store/authStore'
import type { AuthTokens, LoginPayload, RegisterPayload, User } from '@/types'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'

export const authApi = {
  login: async (payload: LoginPayload) => {
    const { setLoading, setError } = useAuthStore.getState()
    setLoading(true)
    try {
      const result = await request.post<AuthTokens>('/auth/login', {
        email: payload.email.trim(),
        password: payload.password,
      })
      return result
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '登录失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  register: async (payload: RegisterPayload) => {
    const { setLoading, setError } = useAuthStore.getState()
    setLoading(true)
    try {
      const body = {
        email: payload.email.trim(),
        username: payload.username.trim(),
        password: payload.password,
      }
      return await request.post<AuthTokens>('/auth/register', body)
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '注册失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  logout: async () => {
    const { logout } = useAuthStore.getState()
    try {
      await request.post<void>('/auth/logout')
      logout()
    } catch (error) {
      // 忽略错误，因为 JWT 是无状态的
    }
  },

  getProfile: () =>
    request.get<User>('/auth/profile'),

  updateProfile: (data: Partial<Pick<User, 'username' | 'avatar'>>) =>
    request.patch<User>('/auth/profile', data),

  changePassword: async (data: { oldPassword: string; newPassword: string }) => {
    const { setLoading, setError, setSuccessMessage } = useAuthStore.getState()
    setLoading(true)
    try {
      await request.patch<void>('/auth/change-password', data)
      setSuccessMessage('密码修改成功')
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '密码修改失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  forgotPassword: async (email: string) => {
    const { setLoading, setError, setSuccessMessage } = useAuthStore.getState()
    setLoading(true)
    try {
      const result = await request.post<{ resetToken: string }>('/auth/forgot-password', { email })
      setSuccessMessage('密码重置链接已发送到您的邮箱')
      return result
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '发送重置链接失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  resetPassword: async (data: { email: string; token: string; newPassword: string }) => {
    const { setLoading, setError, setSuccessMessage } = useAuthStore.getState()
    setLoading(true)
    try {
      const result = await request.post<{ message: string }>('/auth/reset-password', data)
      setSuccessMessage('密码重置成功！请使用新密码登录')
      return result
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '密码重置失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  verifyEmail: async (data: { email: string; token: string }) => {
    const { setLoading, setError, setSuccessMessage } = useAuthStore.getState()
    setLoading(true)
    try {
      const result = await request.post<{ message: string }>('/auth/verify-email', data)
      setSuccessMessage('邮箱验证成功')
      return result
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '邮箱验证失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },
}
