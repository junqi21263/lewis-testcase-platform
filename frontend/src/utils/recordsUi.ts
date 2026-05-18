import type { GenerationStatus } from '@/types'
import { cn } from '@/utils/cn'

/** Friendly AI Workspace — 生成记录页语义 class（依赖 --records-* token） */
export const rec = {
  page: 'records-page min-h-full bg-[hsl(var(--records-page-bg))]',
  container:
    'records-page__container mx-auto flex min-h-0 w-full max-w-[1520px] flex-col gap-7 px-6 pb-24 pt-1 sm:gap-8 sm:px-8',
  headerTitle: 'text-[1.625rem] font-bold tracking-tight text-[hsl(var(--records-text-primary))]',
  headerSub:
    'mt-1.5 max-w-2xl text-sm leading-relaxed text-[hsl(var(--records-text-secondary))]',
  filterPanel:
    'filter-panel flex flex-col gap-3.5 rounded-[18px] border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-filter-panel-bg))] p-5 shadow-[var(--records-panel-shadow)] backdrop-blur-lg sm:gap-[14px] sm:p-[22px]',
  filterPrimaryRow:
    'filter-primary-row flex flex-wrap items-center gap-x-3 gap-y-3',
  filterSearch:
    'relative min-w-[min(100%,360px)] flex-1 max-w-[480px]',
  filterPrimaryActions: 'flex flex-wrap items-center gap-2.5 sm:ml-auto',
  filterStatusRow:
    'filter-status-row flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-[hsl(var(--records-table-border))]/60 pt-3.5',
  filterAdvancedRow:
    'filter-advanced-row flex flex-wrap items-start gap-x-4 gap-y-3 border-t border-[hsl(var(--records-table-border))]/60 pt-3.5',
  filterGroup: 'flex flex-wrap items-center gap-2.5',
  filterRowLabel:
    'shrink-0 text-xs font-medium text-[hsl(var(--records-text-muted))]',
  tablePanel:
    'table-panel flex min-h-[min(640px,calc(100dvh-18rem))] flex-col overflow-hidden rounded-[20px] border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-table-panel-bg))] shadow-[var(--records-panel-shadow)] dark:border-white/[0.08]',
  tableToolbar:
    'table-toolbar flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-toolbar-bg))] px-5 py-4',
  toolbarTitle: 'text-sm font-semibold text-[hsl(var(--records-text-primary))]',
  tableScrollBody:
    'table-scroll-body min-h-0 flex-1 overflow-auto records-scrollbar px-1 sm:px-2',
  tableGrid: 'records-table-grid min-w-0',
  tableHead:
    'sticky top-0 z-[2] grid items-center gap-x-3 border-b border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-header-bg))] px-4 py-3 text-xs font-medium text-[hsl(var(--records-text-muted))] backdrop-blur-md',
  tableRow:
    'group/row relative grid min-h-[80px] cursor-pointer items-center gap-x-3 border-b border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-row-bg))] px-4 py-3.5 transition-[background-color] duration-200 last:border-b-0',
  tableRowHover: 'hover:bg-[hsl(var(--records-table-row-hover-bg))]',
  tableRowSelected:
    'bg-[hsl(var(--records-table-row-selected-bg))] shadow-[inset_3px_0_0_0_hsl(var(--records-row-accent))]',
  tableTitleCell: 'min-w-0 py-0.5',
  tableTitle: 'truncate text-sm font-medium leading-snug text-[hsl(var(--records-text-primary))]',
  tableSummary:
    'mt-1.5 truncate text-xs leading-relaxed text-[hsl(var(--records-text-muted))]',
  tableFooter:
    'table-footer flex shrink-0 flex-col gap-3 border-t border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-footer-bg))] px-5 py-4 sm:flex-row sm:items-center sm:justify-between',
  control:
    'h-9 min-h-[36px] rounded-xl border-0 bg-[hsl(var(--records-input-bg))] text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--records-input-border))]',
  controlSm: 'h-9 min-h-[36px] rounded-lg px-2.5 text-xs',
  chip:
    'inline-flex h-8 items-center rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-colors duration-200',
  chipGhost:
    'bg-[hsl(var(--records-chip-bg))] text-[hsl(var(--records-text-secondary))] ring-[hsl(var(--records-input-border))] hover:bg-[hsl(var(--records-table-row-hover-bg))]',
  chipActive:
    'bg-primary/[0.08] text-primary ring-primary/18 dark:bg-cyan-400/10 dark:text-cyan-200/90 dark:ring-cyan-400/22',
  appliedChip:
    'inline-flex max-w-[220px] truncate rounded-md bg-[hsl(var(--records-chip-bg))] px-2 py-0.5 text-[11px] text-[hsl(var(--records-text-secondary))] ring-1 ring-inset ring-[hsl(var(--records-input-border))]',
  badge:
    'inline-flex h-[23px] shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none',
  badgeSuccess:
    'border-[color:var(--records-badge-success-border)] bg-[var(--records-badge-success-bg)] text-[color:var(--records-badge-success-text)]',
  badgeWarning:
    'border-[color:var(--records-badge-warning-border)] bg-[var(--records-badge-warning-bg)] text-[color:var(--records-badge-warning-text)]',
  badgeDanger:
    'border-[color:var(--records-badge-danger-border)] bg-[var(--records-badge-danger-bg)] text-[color:var(--records-badge-danger-text)]',
  badgeInfo:
    'border-[color:var(--records-badge-info-border)] bg-[var(--records-badge-info-bg)] text-[color:var(--records-badge-info-text)]',
  badgeMuted:
    'border-[color:var(--records-badge-muted-border)] bg-[var(--records-badge-muted-bg)] text-[color:var(--records-badge-muted-text)]',
  iconBtn:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[color:var(--records-icon-muted)] transition-[background-color,color] duration-200 hover:bg-[hsl(var(--records-icon-button-hover-bg))] hover:text-[color:var(--records-icon-hover)]',
  iconBtnDanger:
    'hover:bg-[rgba(244,63,94,0.12)] hover:text-[color:var(--records-icon-danger)]',
  batchBar:
    'flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-table-toolbar-bg))] px-3 py-2.5 text-sm',
  batchActions: 'flex flex-wrap items-center justify-end gap-2',
} as const

const statusBadgeMap: Record<GenerationStatus, string> = {
  PENDING: rec.badgeWarning,
  PROCESSING: rec.badgeInfo,
  SUCCESS: rec.badgeSuccess,
  FAILED: rec.badgeDanger,
  ARCHIVED: rec.badgeMuted,
  CANCELLED: rec.badgeMuted,
}

/** @deprecated use recordStatusBadge */
export const recordStatusBadgeClass: Record<GenerationStatus, string> = {
  PENDING: statusBadgeMap.PENDING,
  PROCESSING: statusBadgeMap.PROCESSING,
  SUCCESS: statusBadgeMap.SUCCESS,
  FAILED: statusBadgeMap.FAILED,
  ARCHIVED: statusBadgeMap.ARCHIVED,
  CANCELLED: statusBadgeMap.CANCELLED,
}

export function recordStatusBadge(st: GenerationStatus) {
  return cn(rec.badge, statusBadgeMap[st])
}
