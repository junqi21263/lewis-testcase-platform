import { useEffect, useState } from 'react'
import { Plus, Users, Trash2, UserPlus, Crown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { teamsApi } from '@/api/teams'
import type { Team, TeamMember } from '@/types'
import toast from 'react-hot-toast'

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true)
      try {
        const res = await teamsApi.getTeams({ page: 1, pageSize: 20 })
        setTeams(res.list)
        if (res.list.length > 0 && !selectedTeam) {
          setSelectedTeam(res.list[0])
        }
      } finally {
        setLoading(false)
      }
    }
    fetchTeams()
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    teamsApi.getTeamMembers(selectedTeam.id).then(setMembers).catch(() => setMembers([]))
  }, [selectedTeam])

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedTeam || !confirm('确认移除该成员？')) return
    try {
      await teamsApi.removeMember(selectedTeam.id, memberId)
      toast.success('成员已移除')
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch {
      toast.error('操作失败')
    }
  }

  const roleLabels: Record<string, string> = { SUPER_ADMIN: '超级管理员', ADMIN: '管理员', MEMBER: '成员', VIEWER: '观察者' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">团队管理</h1>
          <p className="text-muted-foreground mt-1">管理团队成员和权限</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          创建团队
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 团队列表 */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">我的团队</h2>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">加载中...</div>
          ) : teams.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                <Users className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">暂无团队</p>
              </CardContent>
            </Card>
          ) : (
            teams.map((team) => (
              <Card
                key={team.id}
                className={`cursor-pointer transition-colors hover:shadow-md ${selectedTeam?.id === team.id ? 'border-primary ring-1 ring-primary/30' : ''}`}
                onClick={() => setSelectedTeam(team)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{team.name}</p>
                      <p className="text-xs text-muted-foreground">{team.memberCount} 名成员</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* 成员列表 */}
        <div className="lg:col-span-2">
          {selectedTeam ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedTeam.name}</CardTitle>
                    <CardDescription>{selectedTeam.description || '暂无描述'}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1">
                    <UserPlus className="w-4 h-4" />
                    邀请成员
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">暂无成员</div>
                ) : (
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className="text-xs">
                              {member.user.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium">{member.user.username}</p>
                              {member.role === 'SUPER_ADMIN' || member.role === 'ADMIN' ? (
                                <Crown className="w-3.5 h-3.5 text-yellow-500" />
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">{member.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {roleLabels[member.role] || member.role}
                          </Badge>
                          {member.role !== 'SUPER_ADMIN' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[200px] text-muted-foreground text-sm">
              请选择一个团队查看成员
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
