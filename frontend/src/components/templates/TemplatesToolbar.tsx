import { useState } from 'react'
import {
  Filter,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TemplateCategory } from '@/types'
import { cn } from '@/utils/cn'
import { templateCategoryLabels, tpl } from '@/utils/templatesUi'

export type TemplateSortKey = 'updated' | 'usage' | 'name'
export type TemplateViewMode = 'grid' | 'compact'

const sortLabels: Record<TemplateSortKey, string> = {
  updated: '最近更新',
  usage: '使用次数',
  name: '名称',
}

export function TemplatesToolbar(props: {
  keyword: string
  category: TemplateCategory | ''
  sort: TemplateSortKey
  viewMode: TemplateViewMode
  onKeywordChange: (v: string) => void
  onCategoryChange: (c: TemplateCategory | '') => void
  onSortChange: (s: TemplateSortKey) => void
  onViewModeChange: (m: TemplateViewMode) => void
  onReset: () => void
  onSearch?: () => void
}) {
  const {
    keyword,
    category,
    sort,
    viewMode,
    onKeywordChange,
    onCategoryChange,
    onSortChange,
    onViewModeChange,
    onReset,
    onSearch,
  } = props
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const categories: (TemplateCategory | '')[] = ['', ...(Object.keys(templateCategoryLabels) as TemplateCategory[])]

  const filterChips = (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {categories.map((c) => {
        const active = category === c
        const label = c === '' ? '全部' : templateCategoryLabels[c]
        return (
          <button
            key={c || 'all'}
            type="button"
            onClick={() => onCategoryChange(c)}
            className={cn(tpl.chip, active ? tpl.chipActive : tpl.chipGhost)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )

  const hasFilters = !!keyword || !!category

  return (
    <section className={tpl.toolbar} aria-label="模板筛选">
      <div className={tpl.toolbarRow}>
        <div className={tpl.toolbarSearch}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--templates-icon-muted)]" />
          <Input
            placeholder="搜索模板名称、描述、分类或提示词内容..."
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch?.()}
            className={cn(tpl.control, 'h-9 w-full pl-9 pr-9')}
          />
          {keyword && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[color:var(--templates-icon-muted)] hover:text-[color:var(--templates-icon-hover)]"
              onClick={() => onKeywordChange('')}
              aria-label="清空搜索"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="hidden min-w-0 flex-1 lg:flex">{filterChips}</div>

        <button
          type="button"
          className={cn(tpl.chip, tpl.chipGhost, 'lg:hidden')}
          onClick={() => setMobileFiltersOpen((v) => !v)}
        >
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          筛选
          {category && (
            <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">1</span>
          )}
        </button>

        <div className={tpl.toolbarActions}>
          <label className="sr-only" htmlFor="template-sort">
            排序
          </label>
          <select
            id="template-sort"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as TemplateSortKey)}
            className={cn(tpl.control, 'h-9 min-w-[7.5rem] px-2.5 text-xs')}
          >
            {(Object.keys(sortLabels) as TemplateSortKey[]).map((k) => (
              <option key={k} value={k}>
                {sortLabels[k]}
              </option>
            ))}
          </select>

          <div className="flex rounded-xl ring-1 ring-inset ring-[hsl(var(--templates-input-border))]">
            <button
              type="button"
              title="卡片视图"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-l-xl transition-colors',
                viewMode === 'grid'
                  ? 'bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200'
                  : 'text-[color:var(--templates-icon-muted)] hover:bg-[hsl(var(--templates-chip-bg))]',
              )}
              onClick={() => onViewModeChange('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="紧凑列表"
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-r-xl transition-colors',
                viewMode === 'compact'
                  ? 'bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200'
                  : 'text-[color:var(--templates-icon-muted)] hover:bg-[hsl(var(--templates-chip-bg))]',
              )}
              onClick={() => onViewModeChange('compact')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1 rounded-xl text-xs text-[hsl(var(--templates-text-muted))]"
              onClick={onReset}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              清空
            </Button>
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="flex flex-col gap-2 border-t border-[hsl(var(--templates-panel-border))]/70 pt-3 lg:hidden">
          <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--templates-text-muted))]">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            分类
          </div>
          {filterChips}
        </div>
      )}
    </section>
  )
}
