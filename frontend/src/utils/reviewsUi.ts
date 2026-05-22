import type { CaseReviewStatus, RecordReviewStatus } from '@/types/reviews'
import { cn } from '@/utils/cn'

/** 评审中心语义 class（--review-* token，深浅模式） */
export const rev = {
  page: 'review-page min-h-full bg-[hsl(var(--review-page-bg))]',
  shell:
    'review-shell mx-auto flex h-[calc(100dvh-4.5rem)] min-h-[520px] w-full max-w-[1600px] flex-col gap-4 px-4 pb-6 pt-1 sm:px-6 lg:h-[calc(100dvh-5rem)]',
  header:
    'flex shrink-0 flex-wrap items-start justify-between gap-4 rounded-[18px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] px-5 py-4 shadow-[var(--review-panel-shadow)]',
  headerTitle: 'text-lg font-bold tracking-tight text-[hsl(var(--review-text-primary))]',
  headerMeta: 'text-xs text-[hsl(var(--review-text-muted))]',
  workspace:
    'flex min-h-0 flex-1 flex-col gap-4 lg:flex-row',
  listPanel:
    'flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-[18px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] shadow-[var(--review-panel-shadow)] lg:w-[min(380px,34%)]',
  listToolbar:
    'shrink-0 border-b border-[hsl(var(--review-border))] px-3 py-3',
  listScroll: 'min-h-0 flex-1 overflow-y-auto review-scrollbar px-2 py-2',
  detailPanel:
    'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] shadow-[var(--review-panel-shadow)]',
  detailToolbar:
    'flex shrink-0 flex-wrap items-center gap-2 border-b border-[hsl(var(--review-border))] px-4 py-3',
  detailBody: 'min-h-0 flex-1 overflow-y-auto review-scrollbar px-4 py-4',
  caseRow:
    'mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-200',
  caseRowIdle:
    'border-transparent bg-transparent hover:bg-[hsl(var(--review-row-hover-bg))]',
  caseRowActive:
    'border-[hsl(var(--review-row-accent))]/35 bg-[hsl(var(--review-row-active-bg))] shadow-[inset_3px_0_0_0_hsl(var(--review-row-accent))]',
  chip:
    'inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-medium ring-1 ring-inset transition-colors',
  chipGhost:
    'bg-[hsl(var(--review-chip-bg))] text-[hsl(var(--review-text-secondary))] ring-[hsl(var(--review-border))]',
  chipActive:
    'bg-primary/[0.08] text-primary ring-primary/20 dark:bg-cyan-400/10 dark:text-cyan-200/90',
  input:
    'w-full rounded-xl border-0 bg-[hsl(var(--review-input-bg))] px-3 py-2 text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--review-border))] text-[hsl(var(--review-text-primary))] placeholder:text-[hsl(var(--review-text-muted))]',
  sidePanel:
    'absolute inset-y-0 right-0 z-20 flex h-full w-full max-w-md flex-col border-l border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] shadow-2xl',
  sidePanelBackdrop: 'absolute inset-0 z-10 bg-black/35 backdrop-blur-[1px]',
  bulkBar:
    'flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-toolbar-bg))] px-3 py-2 text-sm',
} as const

const caseStatusLabels: Record<CaseReviewStatus, string> = {
  draft: '草稿',
  pending_review: '待评审',
  approved: '已通过',
  changes_requested: '待修改',
  rejected: '已驳回',
}

const recordStatusLabels: Record<RecordReviewStatus, string> = {
  pending_review: '待评审',
  in_review: '评审中',
  approved: '已通过',
  changes_requested: '待修改',
  rejected: '已驳回',
}

const caseBadgeClass: Record<CaseReviewStatus, string> = {
  draft: 'border-slate-300/50 bg-slate-100 text-slate-600 dark:bg-white/8 dark:text-slate-300',
  pending_review:
    'border-amber-300/40 bg-amber-50 text-amber-800 dark:bg-amber-500/12 dark:text-amber-200',
  approved:
    'border-emerald-300/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/12 dark:text-emerald-200',
  changes_requested:
    'border-orange-300/40 bg-orange-50 text-orange-800 dark:bg-orange-500/12 dark:text-orange-200',
  rejected:
    'border-rose-300/40 bg-rose-50 text-rose-800 dark:bg-rose-500/12 dark:text-rose-200',
}

const recordBadgeClass: Record<RecordReviewStatus, string> = {
  pending_review: caseBadgeClass.pending_review,
  in_review:
    'border-sky-300/40 bg-sky-50 text-sky-800 dark:bg-sky-500/12 dark:text-sky-200',
  approved: caseBadgeClass.approved,
  changes_requested: caseBadgeClass.changes_requested,
  rejected: caseBadgeClass.rejected,
}

export function caseReviewStatusLabel(s: CaseReviewStatus): string {
  return caseStatusLabels[s] ?? s
}

export function recordReviewStatusLabel(s: RecordReviewStatus): string {
  return recordStatusLabels[s] ?? s
}

export function caseReviewBadgeClass(s: CaseReviewStatus): string {
  return cn(
    'inline-flex h-[22px] shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold leading-none',
    caseBadgeClass[s] ?? caseBadgeClass.pending_review,
  )
}

export function recordReviewBadgeClass(s: RecordReviewStatus): string {
  return cn(
    'inline-flex h-[22px] shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold leading-none',
    recordBadgeClass[s] ?? recordBadgeClass.pending_review,
  )
}

export const CASE_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const

export const CASE_TYPES = [
  'FUNCTIONAL',
  'PERFORMANCE',
  'SECURITY',
  'COMPATIBILITY',
  'REGRESSION',
] as const

export const CASE_TYPE_LABELS: Record<string, string> = {
  FUNCTIONAL: '功能',
  PERFORMANCE: '性能',
  SECURITY: '安全',
  COMPATIBILITY: '兼容',
  REGRESSION: '回归',
}
