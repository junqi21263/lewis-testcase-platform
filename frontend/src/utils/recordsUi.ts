import type { GenerationStatus } from '@/types'
import { cn } from '@/utils/cn'

/** Friendly AI Workspace — 生成记录页语义 class（依赖 --records-* token） */
export const rec = {
  page: 'records-page min-h-full bg-[hsl(var(--records-page-bg))]',
  container:
    'records-page__container mx-auto flex min-h-0 w-full max-w-[1520px] flex-col gap-5 px-6 pb-24 pt-1 sm:gap-6 sm:px-8',
  headerTitle: 'text-[1.625rem] font-bold tracking-tight text-[hsl(var(--records-text-primary))]',
  headerSub:
    'mt-1.5 max-w-2xl text-sm leading-relaxed text-[hsl(var(--records-text-secondary))]',
  filterPanel:
    'filter-panel rounded-[18px] border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-filter-panel-bg))] p-3 shadow-[var(--records-panel-shadow)] backdrop-blur-lg sm:p-4',
  filterRow: 'filter-panel__row flex flex-wrap items-center gap-x-3 gap-y-2.5',
  filterRowLabel:
    'shrink-0 text-[11px] font-medium uppercase tracking-wide text-[hsl(var(--records-text-muted))]',
  tablePanel:
    'table-panel flex min-h-[min(640px,calc(100dvh-17rem))] flex-col overflow-hidden rounded-[20px] border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-table-panel-bg))] shadow-[var(--records-panel-shadow)] dark:border-white/[0.08]',
  tableToolbar:
    'table-toolbar flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-toolbar-bg))] px-4 py-3 sm:px-5',
  toolbarTitle: 'text-sm font-semibold text-[hsl(var(--records-text-primary))]',
  tableScrollBody:
    'table-scroll-body min-h-0 flex-1 overflow-auto records-scrollbar',
  tableGrid: 'records-table-grid min-w-0',
  tableHead:
    'sticky top-0 z-[2] grid items-center gap-x-2 border-b border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-header-bg))] px-3 py-2.5 text-xs font-medium text-[hsl(var(--records-text-muted))] backdrop-blur-md',
  tableRow:
    'group/row relative grid min-h-[72px] cursor-pointer items-center gap-x-2 border-b border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-row-bg))] px-3 py-2.5 transition-[background-color,opacity] duration-200 last:border-b-0',
  tableRowHover:
    'hover:bg-[hsl(var(--records-table-row-hover-bg))] hover:shadow-[inset_3px_0_0_0_hsl(var(--records-row-accent))]',
  tableRowSelected:
    'bg-[hsl(var(--records-table-row-selected-bg))] shadow-[inset_3px_0_0_0_hsl(var(--records-row-accent))]',
  tableFooter:
    'table-footer flex shrink-0 flex-col gap-3 border-t border-[hsl(var(--records-table-border))] bg-[hsl(var(--records-table-footer-bg))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5',
  control:
    'h-9 rounded-xl border-0 bg-[hsl(var(--records-input-bg))] text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--records-input-border))]',
  controlSm: 'h-8 min-h-8 rounded-lg px-2 text-xs',
  chip: 'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors duration-200',
  chipGhost:
    'bg-[hsl(var(--records-chip-bg))] text-[hsl(var(--records-text-secondary))] ring-[hsl(var(--records-input-border))] hover:bg-[hsl(var(--records-table-row-hover-bg))]',
  chipActive:
    'bg-primary/10 text-primary ring-primary/20 dark:bg-cyan-400/12 dark:text-cyan-100 dark:ring-cyan-400/28',
  appliedChip:
    'inline-flex max-w-[200px] truncate rounded-md bg-[hsl(var(--records-chip-bg))] px-2 py-0.5 text-[11px] text-[hsl(var(--records-text-secondary))] ring-1 ring-inset ring-[hsl(var(--records-input-border))]',
  iconBtn:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[hsl(var(--records-text-muted))] transition-[background-color,color] duration-200 hover:bg-[hsl(var(--records-icon-button-hover-bg))] hover:text-[hsl(var(--records-text-primary))]',
  iconBtnDanger:
    'hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/12',
  batchBar:
    'flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--records-panel-border))] bg-[hsl(var(--records-table-toolbar-bg))] px-3 py-2.5 text-sm',
  batchActions: 'flex flex-wrap items-center justify-end gap-1.5',
} as const

export const recordStatusBadgeClass: Record<GenerationStatus, string> = {
  PENDING:
    'border-amber-200/90 bg-amber-50 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/12 dark:text-amber-200',
  PROCESSING:
    'border-cyan-200/90 bg-cyan-50 text-cyan-800 dark:border-cyan-400/35 dark:bg-cyan-400/12 dark:text-cyan-200',
  SUCCESS:
    'border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/12 dark:text-emerald-200',
  FAILED:
    'border-orange-200/90 bg-orange-50 text-orange-800 dark:border-orange-400/35 dark:bg-orange-400/12 dark:text-orange-200',
  ARCHIVED:
    'border-slate-200/90 bg-slate-100 text-slate-600 dark:border-slate-500/30 dark:bg-slate-500/12 dark:text-slate-300',
  CANCELLED:
    'border-zinc-200/90 bg-zinc-100 text-zinc-600 dark:border-zinc-500/30 dark:bg-zinc-500/12 dark:text-zinc-400',
}

export function recordStatusBadge(st: GenerationStatus) {
  return cn('border font-medium', recordStatusBadgeClass[st])
}
