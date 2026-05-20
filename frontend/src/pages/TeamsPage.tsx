import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TeamDetailPanel } from '@/components/teams/TeamDetailPanel'
import { TeamListPanel } from '@/components/teams/TeamListPanel'
import { teamsApi } from '@/api/teams'
import { useAuthStore } from '@/store/authStore'
import type { Team, TeamMember } from '@/types'
import toast from 'react-hot-toast'
import { appConfirm } from '@/store/appConfirmStore'
import { team } from '@/utils/teamsUi'

export default function TeamsPage() {
  const user = useAuthStore((s) => s.user)
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [teamSearch, setTeamSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  useEffect(() => {
    const fetchTeams = async () => {
      setLoading(true)
      try {
        const res = await teamsApi.getTeams({ page: 1, pageSize: 20 })
        setTeams(res.list)
        if (res.list.length > 0) {
          setSelectedTeam((prev) => prev ?? res.list[0])
        }
      } finally {
        setLoading(false)
      }
    }
    void fetchTeams()
  }, [])

  useEffect(() => {
    if (!selectedTeam) return
    teamsApi.getTeamMembers(selectedTeam.id).then(setMembers).catch(() => setMembers([]))
  }, [selectedTeam])

  const totalMembers = useMemo(
    () => teams.reduce((sum, t) => sum + t.memberCount, 0),
    [teams],
  )

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedTeam) return
    const ok = await appConfirm({
      title: '移除该成员？',
      description: '移除后该用户将不再属于此团队。',
      confirmText: '确认移除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    try {
      await teamsApi.removeMember(selectedTeam.id, memberId)
      toast.success('成员已移除')
      setMembers((prev) => prev.filter((m) => m.id !== memberId))
    } catch {
      toast.error('操作失败')
    }
  }

  return (
    <div className={team.page}>
      <div className={team.container}>
        <header className={team.header}>
          <div className="min-w-0">
            <h1 className={team.headerTitle}>团队管理</h1>
            <p className={team.headerSub}>管理团队成员、角色与协作权限</p>
            <div className={team.headerStats}>
              <span>{teams.length} 个团队</span>
              <span aria-hidden>·</span>
              <span>{totalMembers} 名成员</span>
            </div>
          </div>
          <Button
            type="button"
            className="h-11 shrink-0 gap-2 rounded-[13px] px-5 shadow-md transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-lg motion-reduce:transform-none"
          >
            <Plus className="h-4 w-4" />
            创建团队
          </Button>
        </header>

        <div className={team.layout}>
          <TeamListPanel
            teams={teams}
            selectedId={selectedTeam?.id ?? null}
            loading={loading}
            search={teamSearch}
            onSearchChange={setTeamSearch}
            onSelect={setSelectedTeam}
          />
          <TeamDetailPanel
            team={selectedTeam}
            members={members}
            currentUserId={user?.id}
            memberSearch={memberSearch}
            onMemberSearchChange={setMemberSearch}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            onRemoveMember={handleRemoveMember}
          />
        </div>
      </div>
    </div>
  )
}
