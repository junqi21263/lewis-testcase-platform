import { request } from '@/utils/request'
import { useAuthStore } from '@/store/authStore'
import type { AuthTokens, LoginPayload, RegisterPayload, RegisterOtpMeta, User } from '@/types'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'

export const authApi = {
  login: async (payload: LoginPayload) => {
    const { setLoading, setError } = useAuthStore.getState()
    setLoading(true)
    try {
      const result = await request.post<AuthTokens>('/auth/login', {
        username: payload.username.trim(),
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

  /** 注册第一步：发送邮箱验证码（此时后端不落库 users） */
  sendRegisterCode: async (payload: RegisterPayload) => {
    const { setLoading, setError } = useAuthStore.getState()
    setLoading(true)
    try {
      const body = {
        email: payload.email.trim().toLowerCase(),
        username: payload.username.trim(),
        password: payload.password,
      }
      return await request.post<RegisterOtpMeta>('/auth/register/send-code', body)
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '发送验证码失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  /** 注册第二步：校验验证码并创建账号，返回 token */
  confirmRegister: async (data: { email: string; code: string }) => {
    const { setLoading, setError } = useAuthStore.getState()
    setLoading(true)
    try {
      return await request.post<AuthTokens>('/auth/register/confirm', {
        email: data.email.trim().toLowerCase(),
        code: data.code.trim(),
      })
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '验证失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  resendRegisterCode: async (email: string) => {
    const { setLoading, setError, setSuccessMessage } = useAuthStore.getState()
    setLoading(true)
    try {
      const meta = await request.post<RegisterOtpMeta | Record<string, never>>(
        '/auth/register/resend-code',
        { email: email.trim().toLowerCase() },
      )
      if (meta && 'mailConfigured' in meta && meta.mailConfigured === false && meta.mailIssues?.length) {
        setSuccessMessage(`发信未就绪：${meta.mailIssues.join('；')}`)
      } else {
        setSuccessMessage('若该邮箱有待验证注册，您将收到新的验证码')
      }
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '重发失败，请重试'))
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

  getProfile: () => request.get<User>('/auth/profile'),

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
      const result = await request.post<Record<string, never>>('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      })
      setSuccessMessage('若该邮箱已注册，您将收到验证码邮件')
      return result
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '发送验证码失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },

  resetPassword: async (data: { email: string; code: string; newPassword: string }) => {
    const { setLoading, setError, setSuccessMessage } = useAuthStore.getState()
    setLoading(true)
    try {
      const result = await request.post<Record<string, never>>('/auth/reset-password', {
        email: data.email.trim().toLowerCase(),
        code: data.code.trim(),
        newPassword: data.newPassword,
      })
      setSuccessMessage('密码重置成功！请使用新密码登录')
      return result
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, '密码重置失败，请重试'))
      throw error
    } finally {
      setLoading(false)
    }
  },
}
