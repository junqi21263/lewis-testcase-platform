import type { UserRole } from '@/types'
import { cn } from '@/utils/cn'

export const team = {
  page: 'team-page min-h-full bg-[hsl(var(--teams-page-bg))]',
  container:
    'team-page__container mx-auto flex w-full max-w-[1520px] flex-col px-6 pb-24 pt-1 sm:px-8',
  header:
    'page-header workspace-fade-up mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between',
  headerTitle:
    'text-[1.625rem] font-bold tracking-tight text-[hsl(var(--teams-text-primary))]',
  headerSub:
    'mt-1.5 max-w-xl text-sm leading-relaxed text-[hsl(var(--teams-text-secondary))]',
  headerStats:
    'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--teams-text-muted))]',
  layout:
    'team-layout grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,34%)_1fr] lg:gap-6',
  panel:
    'flex min-h-[min(560px,calc(100dvh-16rem))] flex-col overflow-hidden rounded-[20px] border border-[hsl(var(--teams-panel-border))] bg-[hsl(var(--teams-panel-bg))] shadow-[var(--teams-panel-shadow)]',
  listPanel: 'bg-[hsl(var(--teams-list-bg))]/80',
  detailPanel: 'bg-[hsl(var(--teams-detail-bg))]',
  panelHeader:
    'flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--teams-table-border))] px-5 py-4',
  panelTitle: 'text-sm font-semibold text-[hsl(var(--teams-text-primary))]',
  panelSub: 'text-xs text-[hsl(var(--teams-text-muted))]',
  scrollBody: 'teams-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4',
  teamItem:
    'group/team relative flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200',
  teamItemHover: 'hover:bg-[hsl(var(--teams-item-hover-bg))]',
  teamItemSelected:
    'border-[hsl(var(--teams-panel-border))] bg-[hsl(var(--teams-item-selected-bg))] shadow-[inset_3px_0_0_0_hsl(var(--teams-item-accent))]',
  teamAvatar:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-cyan-400/12 dark:text-cyan-300',
  metricGrid: 'grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4',
  metricCard:
    'rounded-xl border border-[hsl(var(--teams-panel-border))] bg-[hsl(var(--teams-metric-bg))] px-4 py-3',
  metricLabel: 'text-xs text-[hsl(var(--teams-text-muted))]',
  metricValue: 'mt-1 text-lg font-semibold tabular-nums text-[hsl(var(--teams-text-primary))]',
  control:
    'h-9 rounded-xl border-0 bg-[hsl(var(--teams-input-bg))] text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--teams-input-border))] placeholder:text-[hsl(var(--teams-text-muted))]',
  tableWrap: 'min-w-0 overflow-x-auto',
  tableHead:
    'grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_auto_auto] items-center gap-3 border-b border-[hsl(var(--teams-table-border))] bg-[hsl(var(--teams-table-header-bg))] px-4 py-2.5 text-xs font-medium text-[hsl(var(--teams-text-muted))] min-[900px]:grid-cols-[minmax(160px,1.4fr)_minmax(140px,1.2fr)_100px_80px]',
  tableRow:
    'group/row grid grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_auto_auto] items-center gap-3 border-b border-[hsl(var(--teams-table-border))] bg-[hsl(var(--teams-table-row-bg))] px-4 py-3 transition-colors duration-200 last:border-b-0 min-[900px]:grid-cols-[minmax(160px,1.4fr)_minmax(140px,1.2fr)_100px_80px]',
  tableRowHover: 'hover:bg-[hsl(var(--teams-table-row-hover-bg))]',
  badge: 'inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none',
  iconBtn:
    'inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[color:var(--teams-icon-muted)] opacity-0 transition-[opacity,background-color,color] duration-200 group-hover/row:opacity-100 hover:bg-[hsl(var(--teams-item-hover-bg))] hover:text-[color:var(--teams-icon-hover)] disabled:pointer-events-none disabled:opacity-30',
  iconBtnVisible:
    'inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[color:var(--teams-icon-muted)] transition-[background-color,color] duration-200 hover:bg-[hsl(var(--teams-item-hover-bg))] hover:text-[color:var(--teams-icon-hover)]',
  iconBtnDanger:
    'hover:bg-[rgba(244,63,94,0.1)] hover:text-[color:var(--teams-icon-danger)]',
  sectionTitle:
    'mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--teams-text-muted))]',
} as const

const roleBadgeMap: Record<UserRole, string> = {
  SUPER_ADMIN: cn(
    team.badge,
    'border-[color:var(--teams-badge-super-border)] bg-[var(--teams-badge-super-bg)] text-[color:var(--teams-badge-super-text)]',
  ),
  ADMIN: cn(
    team.badge,
    'border-[color:var(--teams-badge-admin-border)] bg-[var(--teams-badge-admin-bg)] text-[color:var(--teams-badge-admin-text)]',
  ),
  MEMBER: cn(
    team.badge,
    'border-[color:var(--teams-badge-member-border)] bg-[var(--teams-badge-member-bg)] text-[color:var(--teams-badge-member-text)]',
  ),
  VIEWER: cn(
    team.badge,
    'border-[color:var(--teams-badge-viewer-border)] bg-[var(--teams-badge-viewer-bg)] text-[color:var(--teams-badge-viewer-text)]',
  ),
}

export const teamRoleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  MEMBER: '成员',
  VIEWER: '观察者',
}

export function teamRoleBadge(role: UserRole) {
  return roleBadgeMap[role] ?? roleBadgeMap.MEMBER
}
