import { cn } from '@/utils/cn'

export const usage = {
  page: 'usage-page min-h-full bg-[hsl(var(--usage-page-bg))]',
  container:
    'usage-page__container mx-auto flex w-full max-w-[1520px] flex-col gap-6 px-6 pb-24 pt-1 sm:gap-7 sm:px-8',
  header:
    'page-header workspace-fade-up flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
  headerTitle:
    'text-[1.625rem] font-bold tracking-tight text-[hsl(var(--usage-text-primary))]',
  headerSub:
    'mt-1.5 text-sm leading-relaxed text-[hsl(var(--usage-text-secondary))]',
  headerActions: 'flex shrink-0 flex-wrap items-center gap-2',
  summaryGrid:
    'usage-summary-grid workspace-fade-up-d1 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4',
  analyticsGrid:
    'usage-analytics-grid workspace-fade-up-d2 grid grid-cols-1 gap-5 lg:grid-cols-2',
  panel:
    'flex flex-col overflow-hidden rounded-[20px] border border-[hsl(var(--usage-panel-border))] bg-[hsl(var(--usage-panel-bg))] shadow-[var(--usage-panel-shadow)]',
  panelHeader:
    'flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--usage-table-border))] px-5 py-4',
  panelTitle: 'text-sm font-semibold text-[hsl(var(--usage-text-primary))]',
  panelSub: 'text-xs text-[hsl(var(--usage-text-muted))]',
  scrollBody: 'usage-scrollbar min-h-0 flex-1 overflow-y-auto',
  metricCard:
    'relative overflow-hidden rounded-[20px] border border-[hsl(var(--usage-metric-border))] bg-[hsl(var(--usage-metric-bg))] p-5 shadow-[var(--usage-panel-shadow)]',
  metricIcon:
    'mb-3 flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset',
  metricLabel: 'text-xs font-medium text-[hsl(var(--usage-text-muted))]',
  metricValue:
    'mt-1 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums text-[hsl(var(--usage-text-primary))] sm:text-[2rem]',
  metricSub: 'mt-2 space-y-0.5 text-xs tabular-nums text-[hsl(var(--usage-text-muted))]',
  control:
    'h-9 rounded-xl border-0 bg-[hsl(var(--usage-input-bg))] text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--usage-input-border))] placeholder:text-[hsl(var(--usage-text-muted))]',
  chip:
    'inline-flex max-w-[140px] truncate rounded-md bg-[hsl(var(--usage-chip-bg))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--usage-text-secondary))] ring-1 ring-inset ring-[hsl(var(--usage-input-border))]',
  badge: 'inline-flex h-[22px] items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none',
  badgeSuccess:
    'border-[color:var(--usage-badge-success-border)] bg-[var(--usage-badge-success-bg)] text-[color:var(--usage-badge-success-text)]',
  badgeDanger:
    'border-[color:var(--usage-badge-danger-border)] bg-[var(--usage-badge-danger-bg)] text-[color:var(--usage-badge-danger-text)]',
  tableHead:
    'sticky top-0 z-[1] grid min-w-[720px] grid-cols-[minmax(130px,1.1fr)_minmax(90px,0.8fr)_minmax(100px,0.9fr)_72px_72px_minmax(80px,0.7fr)_72px] items-center gap-2 border-b border-[hsl(var(--usage-table-border))] bg-[hsl(var(--usage-table-header-bg))] px-4 py-3 text-xs font-medium text-[hsl(var(--usage-text-muted))] backdrop-blur-md',
  tableRow:
    'grid min-w-[720px] grid-cols-[minmax(130px,1.1fr)_minmax(90px,0.8fr)_minmax(100px,0.9fr)_72px_72px_minmax(80px,0.7fr)_72px] items-center gap-2 border-b border-[hsl(var(--usage-table-border))] bg-[hsl(var(--usage-table-row-bg))] px-4 py-3.5 text-sm transition-colors duration-200 last:border-b-0 hover:bg-[hsl(var(--usage-table-row-hover-bg))]',
  tableFooter:
    'flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[hsl(var(--usage-table-border))] px-5 py-4',
  barTrack: 'h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--usage-chart-bar-bg))]',
  barFill: 'h-full rounded-full bg-[hsl(var(--usage-chart-bar-fill))] transition-[width] duration-500 ease-out',
} as const

export function usageStatusBadge(success: boolean) {
  return cn(usage.badge, success ? usage.badgeSuccess : usage.badgeDanger)
}

export function usageCallTypeLabel(cacheHit: boolean) {
  return cacheHit ? '缓存命中' : '实时调用'
}
