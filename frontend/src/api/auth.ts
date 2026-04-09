import { request } from '@/utils/request'
import type { AuthTokens, LoginPayload, RegisterPayload, User } from '@/types'

export const authApi = {
  login: (payload: LoginPayload) =>
    request.post<AuthTokens>('/auth/login', payload),

  register: (payload: RegisterPayload) =>
    request.post<AuthTokens>('/auth/register', payload),

  logout: () =>
    request.post<void>('/auth/logout'),

  getProfile: () =>
    request.get<User>('/auth/profile'),

  updateProfile: (data: Partial<Pick<User, 'username' | 'avatar'>>) =>
    request.patch<User>('/auth/profile', data),

  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    request.post<void>('/auth/change-password', data),
}
