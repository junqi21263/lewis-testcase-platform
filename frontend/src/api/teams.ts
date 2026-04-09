import { request } from '@/utils/request'
import type { Team, TeamMember, PaginatedData, PaginationParams } from '@/types'

export const teamsApi = {
  getTeams: (params?: PaginationParams) =>
    request.get<PaginatedData<Team>>('/teams', { params }),

  getTeamById: (id: string) =>
    request.get<Team>(`/teams/${id}`),

  createTeam: (data: { name: string; description?: string }) =>
    request.post<Team>('/teams', data),

  updateTeam: (id: string, data: Partial<Team>) =>
    request.patch<Team>(`/teams/${id}`, data),

  deleteTeam: (id: string) =>
    request.delete<void>(`/teams/${id}`),

  getTeamMembers: (teamId: string) =>
    request.get<TeamMember[]>(`/teams/${teamId}/members`),

  inviteMember: (teamId: string, data: { email: string; role: string }) =>
    request.post<TeamMember>(`/teams/${teamId}/members/invite`, data),

  removeMember: (teamId: string, memberId: string) =>
    request.delete<void>(`/teams/${teamId}/members/${memberId}`),

  updateMemberRole: (teamId: string, memberId: string, role: string) =>
    request.patch<TeamMember>(`/teams/${teamId}/members/${memberId}`, { role }),
}
