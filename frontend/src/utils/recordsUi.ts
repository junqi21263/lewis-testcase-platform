import type { GenerationStatus } from '@/types'
import { cn } from '@/utils/cn'

/** Friendly AI Workspace — 生成记录页面板与表格语义 class */
export const rec = {
  page: 'min-h-full bg-workspace-page',
  container: 'mx-auto min-w-0 w-full max-w-[1520px] px-6 pb-24 pt-1 sm:px-8',
  headerTitle: 'text-[1.625rem] font-bold tracking-tight text-workspace-text-primary',
  headerSub: 'mt-1.5 max-w-2xl text-sm leading-relaxed text-workspace-text-secondary',
  panel:
    'rounded-[20px] border border-workspace-panel-border/70 bg-workspace-panel/90 shadow-[0_22px_56px_-40px_rgba(59,130,246,0.18)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-workspace-panel/78 dark:shadow-[0_26px_64px_-40px_rgba(0,0,0,0.65)]',
  filterPanel:
    'rounded-[18px] border border-workspace-panel-border/65 bg-workspace-panel-muted/75 p-3 shadow-[0_12px_32px_-28px_rgba(59,130,246,0.14)] backdrop-blur-lg dark:border-white/[0.07] dark:bg-workspace-panel-muted/55 sm:p-4',
  tablePanel:
    'overflow-hidden rounded-[20px] border border-workspace-panel-border/70 bg-workspace-list-panel/95 dark:border-white/[0.08] dark:bg-workspace-list-panel/88',
  tablePanelInner: 'p-4 sm:p-6',
  tableHead:
    'sticky top-0 z-[1] grid gap-2 border-b border-workspace-panel-border/60 bg-workspace-panel-muted/95 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-workspace-text-muted backdrop-blur-md dark:border-white/[0.06] dark:bg-workspace-panel-muted/90',
  tableRow:
    'group/row relative grid min-h-[68px] cursor-pointer items-center gap-2 border-b border-workspace-panel-border/45 px-3 py-2.5 transition-[background-color,opacity] duration-200 last:border-b-0 dark:border-white/[0.04]',
  tableRowHover:
    'hover:bg-[hsl(var(--records-row-hover-bg))] hover:shadow-[inset_3px_0_0_0_hsl(var(--records-row-accent))]',
  tableRowSelected:
    'bg-[hsl(var(--records-row-selected-bg))] shadow-[inset_3px_0_0_0_hsl(var(--records-row-accent))]',
  tableRowFocus: 'ring-0 outline-none',
  control:
    'h-9 rounded-xl border-0 bg-workspace-panel/90 text-sm shadow-sm ring-1 ring-inset ring-workspace-panel-border/80 backdrop-blur-sm dark:bg-white/[0.04] dark:ring-white/10',
  controlSm: 'h-8 rounded-lg text-xs',
  chip:
    'rounded-full border-0 px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors duration-200',
  chipGhost:
    'bg-workspace-panel/70 text-workspace-text-secondary ring-workspace-panel-border/70 hover:bg-workspace-panel-muted dark:bg-white/[0.04] dark:ring-white/10',
  chipActive:
    'bg-primary/12 text-primary ring-primary/25 dark:bg-cyan-400/14 dark:text-cyan-100 dark:ring-cyan-400/30',
  iconBtn:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-workspace-icon transition-[background-color,opacity,color] duration-200 hover:bg-workspace-panel-muted/90 dark:hover:bg-white/[0.06]',
  iconBtnDanger: 'hover:bg-destructive/10 hover:text-destructive dark:hover:bg-red-500/12',
  batchBar:
    'flex flex-wrap items-center gap-2 rounded-xl border border-workspace-panel-border/60 bg-workspace-panel-muted/80 px-3 py-2.5 text-sm backdrop-blur-md dark:border-white/[0.07] dark:bg-workspace-panel-muted/50',
  paginationFooter:
    'mt-0 flex flex-col gap-3 border-t border-workspace-panel-border/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]',
  filterSummary: 'text-xs text-workspace-text-muted',
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
