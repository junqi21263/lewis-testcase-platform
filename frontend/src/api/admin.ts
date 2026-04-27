import { request } from '@/utils/request'
import type { UserRole } from '@/types'

export type AdminUserItem = {
  id: string
  email: string
  username: string
  role: UserRole
  teamId?: string | null
  emailVerified: boolean
  createdAt: string
  updatedAt: string
}

export const adminApi = {
  listUsers: (params: { keyword?: string; page?: number; pageSize?: number }) =>
    request.get<{ total: number; list: AdminUserItem[] }>('/admin/users', { params }),

  resetUserPassword: (id: string, body: { newPassword: string }) =>
    request.post<{ ok: true }>(`/admin/users/${id}/reset-password`, body),

  updateUserRole: (id: string, body: { role: UserRole }) =>
    request.patch<{ ok: true }>(`/admin/users/${id}/role`, body),
}

