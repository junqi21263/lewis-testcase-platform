import type { UserRole } from '@/types'
import { cn } from '@/utils/cn'

/** Friendly AI Workspace — 系统设置页语义 class（依赖 --settings-* token） */
export const set = {
  page: 'settings-page min-h-full bg-[hsl(var(--settings-page-bg))]',
  container:
    'settings-page__container mx-auto flex w-full max-w-[1320px] flex-col px-6 pb-24 pt-1 sm:px-8',
  header:
    'settings-page-header workspace-fade-up mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-end lg:justify-between',
  headerMain: 'min-w-0 flex-1',
  headerTitle:
    'flex items-center gap-2.5 text-[1.625rem] font-bold tracking-tight text-[hsl(var(--settings-text-primary))]',
  headerSpark:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary dark:bg-cyan-400/12 dark:text-cyan-300',
  headerSub:
    'mt-1.5 max-w-2xl text-sm leading-relaxed text-[hsl(var(--settings-text-secondary))]',
  headerMeta:
    'flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--settings-text-muted))] lg:justify-end',
  headerChip:
    'inline-flex h-7 items-center gap-1.5 rounded-full border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-card-bg))]/80 px-2.5 font-medium text-[hsl(var(--settings-text-secondary))] shadow-[var(--settings-card-shadow)] backdrop-blur-md',
  layout:
    'settings-layout workspace-fade-up-d1 grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(200px,220px)_minmax(0,1fr)] lg:gap-8',
  navWrap: 'min-w-0 lg:sticky lg:top-4 lg:self-start',
  navMobile:
    'settings-nav-mobile flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden',
  navDesktop: 'settings-nav-desktop hidden flex-col gap-1 lg:flex',
  navBtn:
    'inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl border border-transparent px-3.5 py-2 text-left text-sm font-medium text-[hsl(var(--settings-text-secondary))] transition-[background-color,border-color,color,box-shadow] duration-200 motion-reduce:transition-none',
  navBtnActive:
    'border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-nav-active-bg))] text-[hsl(var(--settings-text-primary))] shadow-[var(--settings-card-shadow)]',
  navBtnHover: 'hover:bg-[hsl(var(--settings-card-hover-bg))] hover:text-[hsl(var(--settings-text-primary))]',
  content: 'settings-content workspace-fade-up-d2 flex min-w-0 flex-col gap-6 sm:gap-7',
  card:
    'settings-card scroll-mt-24 rounded-[20px] border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-card-bg))] shadow-[var(--settings-card-shadow)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 hover:border-[hsl(var(--settings-card-border-hover))] hover:shadow-[var(--settings-card-shadow-hover)] motion-reduce:transition-none',
  cardHeader:
    'flex flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--settings-card-border))]/70 px-6 py-5',
  cardHeaderMain: 'flex min-w-0 flex-1 items-start gap-3',
  cardIcon:
    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary dark:bg-cyan-400/12 dark:text-cyan-300',
  cardTitle: 'text-base font-bold tracking-tight text-[hsl(var(--settings-text-primary))] sm:text-[1.0625rem]',
  cardDesc: 'mt-1 text-sm leading-relaxed text-[hsl(var(--settings-text-secondary))]',
  cardActions: 'flex shrink-0 flex-wrap items-center gap-2',
  cardBody: 'space-y-5 px-6 py-5',
  cardFooter:
    'flex flex-wrap items-center justify-start gap-3 border-t border-[hsl(var(--settings-card-border))]/70 px-6 py-4',
  formGrid: 'grid gap-4 sm:grid-cols-2',
  formRow: 'space-y-1.5 min-w-0',
  label: 'text-sm font-medium text-[hsl(var(--settings-text-primary))]',
  hint: 'text-xs leading-relaxed text-[hsl(var(--settings-text-secondary))]',
  control:
    'h-10 w-full min-w-0 rounded-xl border-0 bg-[hsl(var(--settings-input-bg))] px-3 text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--settings-input-border))] text-[hsl(var(--settings-text-primary))] placeholder:text-[hsl(var(--settings-text-muted))] transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--settings-input-focus))]/35 motion-reduce:transition-none',
  controlMono:
    'font-mono text-xs [overflow-wrap:anywhere] break-all',
  select:
    'h-10 w-full min-w-0 appearance-none rounded-xl border-0 bg-[hsl(var(--settings-select-bg))] px-3 text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--settings-input-border))] text-[hsl(var(--settings-text-primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--settings-input-focus))]/35',
  textarea:
    'min-h-[88px] w-full resize-y rounded-xl border-0 bg-[hsl(var(--settings-textarea-bg))] px-3 py-2.5 text-sm ring-1 ring-inset ring-[hsl(var(--settings-input-border))]',
  infoGrid: 'grid gap-3 sm:grid-cols-2 sm:items-start',
  infoItem:
    'min-w-0 rounded-xl border border-[hsl(var(--settings-card-border))]/80 bg-[hsl(var(--settings-info-bg))] px-4 py-3',
  infoLabel: 'text-xs font-medium text-[hsl(var(--settings-text-muted))]',
  infoValue:
    'mt-1 font-mono text-sm leading-snug text-[hsl(var(--settings-text-primary))] [overflow-wrap:anywhere] break-all',
  infoPill:
    'inline-flex items-center gap-2 rounded-full border border-[hsl(var(--settings-badge-info-border))] bg-[var(--settings-badge-info-bg)] px-3 py-1.5 text-xs text-[color:var(--settings-badge-info-text)]',
  toggleRow:
    'flex items-center justify-between gap-4 rounded-xl border border-[hsl(var(--settings-card-border))]/60 bg-[hsl(var(--settings-info-bg))]/60 px-4 py-3',
  toggleLabel: 'text-sm font-medium text-[hsl(var(--settings-text-primary))]',
  toggleHint: 'mt-0.5 text-xs text-[hsl(var(--settings-text-secondary))]',
  statusChip:
    'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none',
  badge:
    'inline-flex h-[22px] shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none',
  badgeRole:
    'border-[color:var(--settings-badge-violet-border)] bg-[var(--settings-badge-violet-bg)] text-[color:var(--settings-badge-violet-text)]',
  badgeMuted:
    'border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))] text-[hsl(var(--settings-text-secondary))]',
  badgeSuccess:
    'border-[color:var(--settings-badge-success-border)] bg-[var(--settings-badge-success-bg)] text-[color:var(--settings-badge-success-text)]',
  badgeDanger:
    'border-[color:var(--settings-badge-danger-border)] bg-[var(--settings-badge-danger-bg)] text-[color:var(--settings-badge-danger-text)]',
  badgeViolet:
    'border-[color:var(--settings-badge-violet-border)] bg-[var(--settings-badge-violet-bg)] text-[color:var(--settings-badge-violet-text)]',
  btnPrimary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[opacity,transform] duration-200 hover:opacity-95 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100',
  btnSecondary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-button-secondary-bg))] px-4 text-sm font-medium text-[hsl(var(--settings-text-primary))] shadow-sm transition-[background-color,border-color] duration-200 hover:bg-[hsl(var(--settings-card-hover-bg))] disabled:opacity-50',
  btnGhost:
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-[hsl(var(--settings-text-secondary))] transition-colors hover:bg-[hsl(var(--settings-card-hover-bg))] hover:text-[hsl(var(--settings-text-primary))] disabled:opacity-40',
  btnDanger:
    'inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-[color:var(--settings-badge-danger-text)] transition-colors hover:bg-[var(--settings-badge-danger-bg)]',
  iconBtn:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[color:var(--settings-icon-muted)] transition-[background-color,color] duration-200 hover:bg-[hsl(var(--settings-card-hover-bg))] hover:text-[color:var(--settings-icon-hover)]',
  empty:
    'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-empty-bg))] px-6 py-10 text-center',
  emptyIcon: 'h-9 w-9 text-[hsl(var(--settings-text-muted))] opacity-60',
  emptyTitle: 'text-sm font-medium text-[hsl(var(--settings-text-primary))]',
  emptySub: 'text-xs text-[hsl(var(--settings-text-secondary))]',
  modelList: 'settings-scrollbar max-h-[min(520px,55vh)] space-y-4 overflow-y-auto pr-1',
  modelCard:
    'rounded-[18px] border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))]/50 p-4 sm:p-5',
  segment:
    'inline-flex flex-wrap gap-1 rounded-xl border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))] p-1',
  segmentBtn:
    'rounded-lg px-3 py-1.5 text-xs font-medium text-[hsl(var(--settings-text-secondary))] transition-colors hover:text-[hsl(var(--settings-text-primary))]',
  segmentBtnActive:
    'bg-[hsl(var(--settings-card-bg))] text-[hsl(var(--settings-text-primary))] shadow-sm ring-1 ring-inset ring-[hsl(var(--settings-card-border))]',
  sliderRow: 'flex items-center gap-4',
  slider: 'h-2 flex-1 cursor-pointer accent-primary',
  auditList: 'settings-scrollbar max-h-80 space-y-2 overflow-y-auto pr-1',
  auditItem:
    'space-y-1 rounded-xl border border-[hsl(var(--settings-card-border))]/70 bg-[hsl(var(--settings-info-bg))]/40 p-3 text-xs',
  auditTime: 'font-mono tabular-nums text-[hsl(var(--settings-text-muted))]',
  adminList: 'settings-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1',
  adminUserBtn:
    'w-full rounded-xl border border-transparent p-2.5 text-left transition-colors',
  adminUserBtnActive:
    'border-primary/30 bg-primary/[0.08] dark:border-cyan-400/25 dark:bg-cyan-400/10',
  adminUserBtnIdle: 'bg-[hsl(var(--settings-info-bg))]/50 hover:bg-[hsl(var(--settings-card-hover-bg))]',
  cityList:
    'divide-y divide-[hsl(var(--settings-card-border))]/60 overflow-hidden rounded-xl border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))]/40',
  cityBtn:
    'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[hsl(var(--settings-card-hover-bg))]',
} as const

export function roleBadgeClass(_role: UserRole): string {
  return cn(set.badge, set.badgeRole)
}

export type SettingsNavItem = {
  id: string
  label: string
  show?: boolean
}

export const SETTINGS_SECTIONS: SettingsNavItem[] = [
  { id: 'section-profile', label: '个人资料' },
  { id: 'section-runtime', label: '运行环境' },
  { id: 'section-multimodal', label: '多模态配置', show: false },
  { id: 'section-gen-prefs', label: '生成默认' },
  { id: 'appearance-weather', label: '外观天气' },
  { id: 'section-ai-models', label: 'AI 模型' },
  { id: 'section-super-admin', label: '管理工具', show: false },
  { id: 'section-audit', label: '审计日志', show: false },
]
