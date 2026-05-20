import { useMemo } from 'react'
import { Crown, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import type { Team, TeamMember } from '@/types'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import { team, teamRoleBadge, teamRoleLabels } from '@/utils/teamsUi'
import { TeamsEmptyState } from './TeamsEmptyState'

export function TeamDetailPanel(props: {
  team: Team | null
  members: TeamMember[]
  currentUserId?: string
  memberSearch: string
  onMemberSearchChange: (v: string) => void
  roleFilter: string
  onRoleFilterChange: (v: string) => void
  onInviteClick?: () => void
  onRemoveMember: (memberId: string) => void
}) {
  const {
    team: selected,
    members,
    currentUserId,
    memberSearch,
    onMemberSearchChange,
    roleFilter,
    onRoleFilterChange,
    onInviteClick,
    onRemoveMember,
  } = props

  const adminCount = useMemo(
    () => members.filter((m) => m.role === 'ADMIN' || m.role === 'SUPER_ADMIN').length,
    [members],
  )

  const filteredMembers = useMemo(() => {
    let list = members
    if (roleFilter) list = list.filter((m) => m.role === roleFilter)
    const q = memberSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (m) =>
          m.user.username.toLowerCase().includes(q) ||
          m.user.email.toLowerCase().includes(q),
      )
    }
    return list
  }, [members, memberSearch, roleFilter])

  if (!selected) {
    return (
      <section className={cn(team.panel, team.detailPanel, 'workspace-fade-up-d2')}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-sm text-[hsl(var(--teams-text-muted))]">请从左侧选择一个团队查看详情</p>
        </div>
      </section>
    )
  }

  return (
    <section className={cn(team.panel, team.detailPanel, 'workspace-fade-up-d2')}>
      <header className={team.panelHeader}>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-[hsl(var(--teams-text-primary))]">
            {selected.name}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-sm text-[hsl(var(--teams-text-secondary))]">
            {selected.description || '暂无描述'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5 rounded-xl border-[hsl(var(--teams-input-border))]"
          onClick={onInviteClick}
        >
          <UserPlus className="h-4 w-4" />
          邀请成员
        </Button>
      </header>

      <div className="shrink-0 border-b border-[hsl(var(--teams-table-border))] px-5 py-4">
        <div className={team.metricGrid}>
          <div className={team.metricCard}>
            <p className={team.metricLabel}>成员数</p>
            <p className={team.metricValue}>{selected.memberCount}</p>
          </div>
          <div className={team.metricCard}>
            <p className={team.metricLabel}>管理员</p>
            <p className={team.metricValue}>{adminCount}</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 space-y-3 border-b border-[hsl(var(--teams-table-border))] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={team.sectionTitle}>成员</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="搜索成员…"
                value={memberSearch}
                onChange={(e) => onMemberSearchChange(e.target.value)}
                className={cn(team.control, 'h-9 w-[min(100%,200px)]')}
              />
              <select
                value={roleFilter}
                onChange={(e) => onRoleFilterChange(e.target.value)}
                className={cn(team.control, 'h-9 px-2.5 text-xs')}
                aria-label="按角色筛选"
              >
                <option value="">全部角色</option>
                {(Object.keys(teamRoleLabels) as Array<keyof typeof teamRoleLabels>).map((r) => (
                  <option key={r} value={r}>
                    {teamRoleLabels[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className={cn(team.scrollBody, 'px-0 py-0')}>
          {members.length === 0 ? (
            <div className="p-4">
              <TeamsEmptyState variant="no-members" onAction={onInviteClick} compact />
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="py-12 text-center text-sm text-[hsl(var(--teams-text-muted))]">
              无匹配成员
            </p>
          ) : (
            <div className={team.tableWrap}>
              <div className={team.tableHead} role="row">
                <span>成员</span>
                <span className="hidden min-[900px]:inline">邮箱</span>
                <span>角色</span>
                <span className="text-right">操作</span>
              </div>
              {filteredMembers.map((member) => {
                const isSelf = currentUserId === member.userId
                const isOwner =
                  member.role === 'SUPER_ADMIN' || member.userId === selected.ownerId
                return (
                  <div
                    key={member.id}
                    className={cn(team.tableRow, team.tableRowHover, 'group/row')}
                    role="row"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs bg-[hsl(var(--teams-metric-bg))] text-[hsl(var(--teams-text-secondary))]">
                          {member.user.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-medium text-[hsl(var(--teams-text-primary))]">
                            {member.user.username}
                          </p>
                          {isSelf && (
                            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary dark:bg-cyan-400/12 dark:text-cyan-200">
                              你
                            </span>
                          )}
                          {isOwner && (
                            <Crown
                              className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-300"
                              aria-label="管理员"
                            />
                          )}
                        </div>
                        <p className="truncate text-xs text-[hsl(var(--teams-text-muted))] min-[900px]:hidden">
                          {member.user.email}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[hsl(var(--teams-text-muted))] min-[900px]:hidden">
                          {formatDate(member.joinedAt, 'yyyy-MM-dd')}
                        </p>
                      </div>
                    </div>
                    <p className="hidden truncate text-xs text-[hsl(var(--teams-text-secondary))] min-[900px]:block">
                      {member.user.email}
                    </p>
                    <span className={teamRoleBadge(member.role)}>{teamRoleLabels[member.role]}</span>
                    <div className="flex justify-end">
                      {member.role !== 'SUPER_ADMIN' && (
                        <button
                          type="button"
                          className={cn(team.iconBtn, team.iconBtnDanger)}
                          title="移除成员"
                          onClick={() => onRemoveMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[hsl(var(--teams-table-border))] px-5 py-4">
          <h3 className={team.sectionTitle}>待处理邀请</h3>
          <TeamsEmptyState variant="no-invites" compact />
        </div>
      </div>
    </section>
  )
}
