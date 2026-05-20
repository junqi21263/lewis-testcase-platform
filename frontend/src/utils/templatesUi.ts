import type { TemplateCategory } from '@/types'
import { cn } from '@/utils/cn'

/** Friendly AI Workspace — 模板管理页语义 class（依赖 --templates-* token） */
export const tpl = {
  page: 'templates-page min-h-full bg-[hsl(var(--templates-page-bg))]',
  container:
    'templates-page__container mx-auto flex w-full max-w-[1520px] flex-col px-6 pb-24 pt-1 sm:px-8',
  header: 'page-header templates-fade-up mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between',
  headerTitle:
    'text-[1.625rem] font-bold tracking-tight text-[hsl(var(--templates-text-primary))]',
  headerSub:
    'mt-1.5 max-w-xl text-sm leading-relaxed text-[hsl(var(--templates-text-secondary))]',
  headerStats:
    'mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--templates-text-muted))]',
  toolbar:
    'template-toolbar templates-fade-up-d1 mb-5 flex flex-col gap-3.5 rounded-[18px] border border-[hsl(var(--templates-panel-border))] bg-[hsl(var(--templates-toolbar-bg))]/90 p-4 shadow-[var(--templates-panel-shadow)] backdrop-blur-xl sm:mb-6 sm:gap-4 sm:p-[18px]',
  toolbarRow: 'flex flex-wrap items-center gap-3',
  toolbarSearch:
    'relative w-full min-w-[min(100%,280px)] sm:max-w-[420px] sm:flex-1 lg:max-w-[460px]',
  toolbarFilters:
    'flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5',
  toolbarActions: 'flex shrink-0 flex-wrap items-center gap-2 sm:ml-auto',
  content: 'template-content templates-fade-up-d2 flex flex-col gap-4',
  summary:
    'flex flex-wrap items-center justify-between gap-2 text-xs text-[hsl(var(--templates-text-muted))]',
  grid:
    'template-grid grid grid-cols-1 gap-5 transition-opacity duration-200 motion-reduce:transition-none sm:gap-6 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3',
  gridCompact:
    'template-grid template-grid--compact flex flex-col gap-3 transition-opacity duration-200 motion-reduce:transition-none',
  control:
    'h-9 min-h-[34px] rounded-xl border-0 bg-[hsl(var(--templates-input-bg))] text-sm shadow-sm ring-1 ring-inset ring-[hsl(var(--templates-input-border))] placeholder:text-[hsl(var(--templates-text-muted))]',
  chip:
    'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-medium ring-1 ring-inset transition-[background-color,color,box-shadow] duration-200',
  chipGhost:
    'bg-[hsl(var(--templates-chip-bg))] text-[hsl(var(--templates-text-secondary))] ring-[hsl(var(--templates-input-border))] hover:bg-[hsl(var(--templates-card-hover-bg))]',
  chipActive:
    'bg-primary/[0.08] text-primary ring-primary/20 dark:bg-cyan-400/10 dark:text-cyan-200/90 dark:ring-cyan-400/24',
  card:
    'template-card group/card flex h-full min-h-[320px] min-w-0 flex-col rounded-[20px] border border-[hsl(var(--templates-card-border))] bg-[hsl(var(--templates-card-bg))] p-5 shadow-[var(--templates-card-shadow)] transition-[background-color,border-color,box-shadow] duration-200 hover:border-primary/20 hover:bg-[hsl(var(--templates-card-hover-bg))] hover:shadow-[var(--templates-panel-shadow)] motion-reduce:transition-none sm:p-[22px]',
  cardCompact:
    'template-card template-card--compact group/card flex min-w-0 flex-col gap-3 rounded-[18px] border border-[hsl(var(--templates-card-border))] bg-[hsl(var(--templates-card-bg))] p-4 shadow-[var(--templates-card-shadow)] transition-[background-color,border-color] duration-200 hover:border-primary/20 hover:bg-[hsl(var(--templates-card-hover-bg))] sm:flex-row sm:items-stretch sm:p-5',
  preview:
    'template-preview relative min-h-0 overflow-hidden rounded-xl border border-[hsl(var(--templates-preview-border))] bg-[hsl(var(--templates-preview-bg))] font-mono text-[0.8125rem] leading-[1.55] text-[hsl(var(--templates-preview-text))]',
  previewInner:
    'template-preview__inner max-h-[9.5rem] overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-3.5 py-3 select-text',
  previewExpanded: 'template-preview__inner max-h-[min(280px,40vh)] overflow-y-auto templates-scrollbar',
  previewFade:
    'pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[hsl(var(--templates-preview-bg))] to-transparent',
  badge:
    'inline-flex h-[22px] shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold leading-none',
  iconBtn:
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[color:var(--templates-icon-muted)] transition-[background-color,color] duration-200 hover:bg-[hsl(var(--templates-chip-bg))] hover:text-[color:var(--templates-icon-hover)] disabled:pointer-events-none disabled:opacity-40',
  iconBtnDanger:
    'hover:bg-[rgba(244,63,94,0.1)] hover:text-[color:var(--templates-icon-danger)]',
} as const

const categoryBadgeMap: Record<TemplateCategory, string> = {
  FUNCTIONAL: cn(
    tpl.badge,
    'border-[color:var(--templates-badge-functional-border)] bg-[var(--templates-badge-functional-bg)] text-[color:var(--templates-badge-functional-text)]',
  ),
  PERFORMANCE: cn(
    tpl.badge,
    'border-[color:var(--templates-badge-performance-border)] bg-[var(--templates-badge-performance-bg)] text-[color:var(--templates-badge-performance-text)]',
  ),
  SECURITY: cn(
    tpl.badge,
    'border-[color:var(--templates-badge-security-border)] bg-[var(--templates-badge-security-bg)] text-[color:var(--templates-badge-security-text)]',
  ),
  API: cn(
    tpl.badge,
    'border-[color:var(--templates-badge-api-border)] bg-[var(--templates-badge-api-bg)] text-[color:var(--templates-badge-api-text)]',
  ),
  UI: cn(
    tpl.badge,
    'border-[color:var(--templates-badge-ui-border)] bg-[var(--templates-badge-ui-bg)] text-[color:var(--templates-badge-ui-text)]',
  ),
  CUSTOM: cn(
    tpl.badge,
    'border-[color:var(--templates-badge-custom-border)] bg-[var(--templates-badge-custom-bg)] text-[color:var(--templates-badge-custom-text)]',
  ),
}

export function templateCategoryBadgeClass(category: TemplateCategory): string {
  return categoryBadgeMap[category] ?? categoryBadgeMap.CUSTOM
}

export const templateCategoryLabels: Record<TemplateCategory, string> = {
  FUNCTIONAL: '功能测试',
  PERFORMANCE: '性能测试',
  SECURITY: '安全测试',
  API: 'API 测试',
  UI: 'UI 测试',
  CUSTOM: '自定义',
}

export const PREVIEW_LINE_COUNT = 6

export function truncatePreviewLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return { text, truncated: false }
  return { text: lines.slice(0, maxLines).join('\n'), truncated: true }
}
