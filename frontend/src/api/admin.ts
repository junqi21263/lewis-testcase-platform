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

export type AdminAuditLogItem = {
  id: string
  action: string
  detail: unknown
  ip: string | null
  createdAt: string
  operator: { id: string; username: string }
  targetUser: { id: string; username: string }
}

export type AdminInviteCodeItem = {
  id: string
  status: 'ACTIVE' | 'DISABLED'
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  lastUsedAt: string | null
  remark: string | null
  codeFingerprint: string
  createdAt: string
  createdBy: { id: string; username: string } | null
}

export type AdminInviteCodeCreated = AdminInviteCodeItem & {
  code: string
}

export const adminApi = {
  listUsers: (params: { keyword?: string; page?: number; pageSize?: number }) =>
    request.get<{ total: number; list: AdminUserItem[] }>('/admin/users', { params }),

  listAuditLogs: (params: { page?: number; pageSize?: number }) =>
    request.get<{ total: number; list: AdminAuditLogItem[] }>('/admin/audit-logs', { params }),

  listInviteCodes: (params: { page?: number; pageSize?: number }) =>
    request.get<{ total: number; list: AdminInviteCodeItem[] }>('/admin/invite-codes', { params }),

  createInviteCode: (body: { code?: string; maxUses?: number; expiresAt?: string; remark?: string }) =>
    request.post<AdminInviteCodeCreated>('/admin/invite-codes', body),

  updateInviteCodeStatus: (id: string, body: { status: 'ACTIVE' | 'DISABLED' }) =>
    request.patch<AdminInviteCodeItem>(`/admin/invite-codes/${id}/status`, body),

  resetUserPassword: (id: string, body: { newPassword: string }) =>
    request.post<{ ok: true }>(`/admin/users/${id}/reset-password`, body),

  updateUserRole: (id: string, body: { role: UserRole }) =>
    request.patch<{ ok: true }>(`/admin/users/${id}/role`, body),
}
