import { Search, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Team } from '@/types'
import { cn } from '@/utils/cn'
import { team } from '@/utils/teamsUi'
import { TeamsEmptyState } from './TeamsEmptyState'

export function TeamListPanel(props: {
  teams: Team[]
  selectedId: string | null
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  onSelect: (t: Team) => void
  onCreateClick?: () => void
}) {
  const { teams, selectedId, loading, search, onSearchChange, onSelect, onCreateClick } = props

  const filtered = search.trim()
    ? teams.filter(
        (t) =>
          t.name.toLowerCase().includes(search.trim().toLowerCase()) ||
          (t.description?.toLowerCase().includes(search.trim().toLowerCase()) ?? false),
      )
    : teams

  return (
    <aside className={cn(team.panel, team.listPanel, 'workspace-fade-up-d1')}>
      <div className={team.panelHeader}>
        <div>
          <h2 className={team.panelTitle}>我的团队</h2>
          <p className={team.panelSub}>{teams.length} 个团队</p>
        </div>
      </div>
      <div className="shrink-0 border-b border-[hsl(var(--teams-table-border))] px-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--teams-icon-muted)]" />
          <Input
            placeholder="搜索团队…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn(team.control, 'h-9 w-full pl-9')}
          />
        </div>
      </div>
      <div className={team.scrollBody}>
        {loading ? (
          <p className="py-12 text-center text-sm text-[hsl(var(--teams-text-muted))]">加载中…</p>
        ) : teams.length === 0 ? (
          <TeamsEmptyState variant="no-teams" onAction={onCreateClick} />
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-[hsl(var(--teams-text-muted))]">无匹配团队</p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((t) => {
              const selected = selectedId === t.id
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t)}
                    className={cn(
                      team.teamItem,
                      team.teamItemHover,
                      selected && team.teamItemSelected,
                    )}
                    title={t.name}
                  >
                    <div className={team.teamAvatar}>
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-medium text-[hsl(var(--teams-text-primary))]">
                        {t.name}
                      </p>
                      <p className="text-xs text-[hsl(var(--teams-text-muted))]">
                        {t.memberCount} 名成员
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
