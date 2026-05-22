import type { CaseReviewStatus, RecordReviewStatus } from '@/types/reviews'
import { cn } from '@/utils/cn'

/** 评审中心语义 class（--review-* token，深浅模式） */
export const rev = {
  page:
    'review-page -mx-5 -mb-6 -mt-6 flex h-[calc(100dvh-7.25rem)] max-h-[calc(100dvh-7.25rem)] min-h-0 flex-col overflow-hidden bg-[hsl(var(--review-page-bg))] sm:-mx-7 sm:-mb-7 sm:-my-7 lg:-mx-8 lg:-mb-8 lg:-my-8',
  shell:
    'review-shell mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 pb-4 pt-1 sm:px-5',
  header:
    'review-header flex shrink-0 flex-wrap items-start justify-between gap-4 rounded-[18px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] px-5 py-4 shadow-[var(--review-panel-shadow)]',
  headerTitle: 'text-lg font-bold tracking-tight text-[hsl(var(--review-text-primary))]',
  headerMeta: 'text-xs text-[hsl(var(--review-text-muted))]',
  workspace: 'review-workspace flex min-h-0 flex-1 flex-col gap-4 lg:flex-row',
  listPanel:
    'review-list-panel flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-[18px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] shadow-[var(--review-panel-shadow)] lg:w-[min(400px,36%)]',
  listToolbar:
    'list-toolbar shrink-0 space-y-4 border-b border-[hsl(var(--review-divider))] px-5 py-4',
  listToolbarSection: 'space-y-3',
  listBulkZone:
    'shrink-0 space-y-3 border-b border-[hsl(var(--review-divider))] bg-[hsl(var(--review-toolbar-bg))] px-5 py-3',
  listListHeader:
    'flex shrink-0 items-center gap-2 border-b border-[hsl(var(--review-divider))] px-5 py-2.5',
  listScroll: 'list-scroll-body min-h-0 flex-1 overflow-y-auto review-scrollbar px-3 py-3',
  detailPanel:
    'review-detail-panel relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] shadow-[var(--review-panel-shadow)]',
  detailToolbar:
    'detail-header flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-[hsl(var(--review-divider))] px-5 py-4',
  detailBody:
    'detail-scroll-body min-h-0 flex-1 overflow-y-auto review-scrollbar px-5 py-5 pb-36',
  detailStickyFooter:
    'detail-sticky-footer shrink-0 border-t border-[hsl(var(--review-sticky-footer-border))] bg-[hsl(var(--review-sticky-footer-bg))] px-5 py-3.5 backdrop-blur-md',
  commentSection:
    'mt-8 rounded-[16px] border border-[hsl(var(--review-border))] bg-[hsl(var(--review-comment-bg))] p-5',
  caseRow:
    'mb-2 w-full rounded-[14px] border text-left transition-[background-color,border-color,box-shadow,transform] duration-200 motion-safe:hover:translate-y-[-1px]',
  caseRowIdle:
    'border-[hsl(var(--review-border))] bg-[hsl(var(--review-card-bg))] hover:border-[hsl(var(--review-row-accent))]/20 hover:bg-[hsl(var(--review-card-hover-bg))]',
  caseRowChecked:
    'border-[hsl(var(--review-row-accent))]/22 bg-[hsl(var(--review-row-checked-bg))]',
  caseRowActive:
    'border-[hsl(var(--review-border))] bg-[hsl(var(--review-card-selected-bg))] shadow-[inset_3px_0_0_0_hsl(var(--review-row-accent))]',
  caseRowInner: 'flex items-start gap-3 px-4 py-3.5',
  caseTitle: 'line-clamp-2 text-sm font-semibold leading-snug text-[hsl(var(--review-text-primary))]',
  caseMeta: 'mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[hsl(var(--review-text-muted))]',
  caseMetaPill:
    'inline-flex h-5 items-center rounded-md bg-[hsl(var(--review-chip-bg))] px-1.5 font-medium text-[hsl(var(--review-text-secondary))]',
  chip:
    'inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-medium ring-1 ring-inset transition-[background-color,color,box-shadow] duration-200',
  chipGhost:
    'bg-[hsl(var(--review-chip-bg))] text-[hsl(var(--review-text-secondary))] ring-[hsl(var(--review-border))]',
  chipActive:
    'bg-primary/[0.08] text-primary ring-primary/20 dark:bg-cyan-400/10 dark:text-cyan-200/90',
  input:
    'w-full rounded-xl border border-[hsl(var(--review-input-border))] bg-[hsl(var(--review-input-bg))] px-3 py-2.5 text-sm text-[hsl(var(--review-text-primary))] shadow-sm transition-[box-shadow,ring-color] duration-200 placeholder:text-[hsl(var(--review-text-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--review-input-focus))]/35',
  textarea:
    'w-full resize-none rounded-xl border border-[hsl(var(--review-input-border))] bg-[hsl(var(--review-input-bg))] px-3 py-2.5 text-sm leading-relaxed text-[hsl(var(--review-text-primary))] shadow-sm transition-[box-shadow,ring-color] duration-200 placeholder:text-[hsl(var(--review-text-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--review-input-focus))]/35 min-h-[88px] max-h-[220px] overflow-y-auto review-scrollbar',
  fieldCard:
    'relative rounded-[14px] border border-[hsl(var(--review-border))] bg-[hsl(var(--review-card-bg))] p-4',
  fieldSection: 'flex flex-col gap-5',
  fieldSectionHeader: 'mb-3 flex items-center justify-between gap-3',
  fieldSectionTitle: 'text-xs font-semibold uppercase tracking-wide text-[hsl(var(--review-text-secondary))]',
  iconBtn:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--review-text-muted))] transition-[background-color,color,opacity] duration-200 hover:bg-[hsl(var(--review-chip-bg))] hover:text-[hsl(var(--review-text-primary))] disabled:opacity-40',
  iconBtnDanger:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--review-btn-danger-text))] transition-[background-color,opacity] duration-200 hover:bg-[hsl(var(--review-btn-danger-bg))] disabled:opacity-40',
  actionGroup: 'flex flex-wrap items-center gap-2',
  actionDivider: 'hidden h-6 w-px bg-[hsl(var(--review-divider))] sm:block',
  btnPrimary:
    'h-9 gap-1.5 rounded-lg bg-primary px-3 text-primary-foreground shadow-sm transition-[filter,opacity] duration-200 hover:brightness-105',
  btnSecondary:
    'h-9 gap-1.5 rounded-lg border border-[hsl(var(--review-border))] bg-[hsl(var(--review-panel-bg))] px-3 text-[hsl(var(--review-text-primary))] shadow-sm transition-[background-color,border-color] duration-200 hover:bg-[hsl(var(--review-chip-bg))]',
  btnDanger:
    'h-9 gap-1.5 rounded-lg border border-[hsl(var(--review-btn-danger-border))] bg-[hsl(var(--review-btn-danger-bg))] px-3 text-[hsl(var(--review-btn-danger-text))] shadow-sm transition-[background-color,opacity] duration-200 hover:opacity-90',
  btnGhost:
    'h-9 gap-1.5 rounded-lg px-3 text-[hsl(var(--review-text-secondary))] transition-[background-color,color] duration-200 hover:bg-[hsl(var(--review-chip-bg))] hover:text-[hsl(var(--review-text-primary))]',
  sidePanel:
    'absolute inset-y-0 right-0 z-20 flex h-full w-full max-w-md flex-col border-l border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] shadow-2xl',
  sidePanelBackdrop: 'absolute inset-0 z-10 bg-black/35 backdrop-blur-[1px]',
  bulkBar:
    'review-bulk-enter flex flex-col gap-3 rounded-[14px] border border-[hsl(var(--review-panel-border))] bg-[hsl(var(--review-panel-bg))] px-4 py-3 shadow-[var(--review-panel-shadow)]',
  bulkBarMeta: 'flex items-center justify-between gap-3',
  bulkBarActions: 'flex flex-wrap items-center justify-end gap-2',
  select:
    'h-9 max-w-full rounded-lg border border-[hsl(var(--review-input-border))] bg-[hsl(var(--review-input-bg))] px-2.5 text-xs text-[hsl(var(--review-text-primary))]',
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
  draft:
    'border-[hsl(var(--review-border))] bg-[hsl(var(--review-chip-bg))] text-[hsl(var(--review-text-secondary))]',
  pending_review:
    'border-[hsl(var(--review-badge-warning-border))] bg-[hsl(var(--review-badge-warning-bg))] text-[hsl(var(--review-badge-warning-text))]',
  approved:
    'border-[hsl(var(--review-badge-success-border))] bg-[hsl(var(--review-badge-success-bg))] text-[hsl(var(--review-badge-success-text))]',
  changes_requested:
    'border-[hsl(var(--review-badge-warning-border))] bg-[hsl(var(--review-badge-warning-bg))] text-[hsl(var(--review-badge-warning-text))]',
  rejected:
    'border-[hsl(var(--review-badge-danger-border))] bg-[hsl(var(--review-badge-danger-bg))] text-[hsl(var(--review-badge-danger-text))]',
}

const recordBadgeClass: Record<RecordReviewStatus, string> = {
  pending_review: caseBadgeClass.pending_review,
  in_review:
    'border-[hsl(var(--review-badge-info-border))] bg-[hsl(var(--review-badge-info-bg))] text-[hsl(var(--review-badge-info-text))]',
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
