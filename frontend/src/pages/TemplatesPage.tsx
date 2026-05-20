import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { TemplateCard } from '@/components/templates/TemplateCard'
import { TemplateDetailModal } from '@/components/templates/TemplateDetailModal'
import {
  TemplateEditorModal,
  type TemplateDraft,
} from '@/components/templates/TemplateEditorModal'
import { TemplatesEmptyState } from '@/components/templates/TemplatesEmptyState'
import {
  TemplatesToolbar,
  type TemplateSortKey,
  type TemplateViewMode,
} from '@/components/templates/TemplatesToolbar'
import { templatesApi } from '@/api/templates'
import { useAuthStore } from '@/store/authStore'
import { useGenerateStore } from '@/store/generateStore'
import type { PromptTemplate, TemplateCategory } from '@/types'
import toast from 'react-hot-toast'
import { appConfirm } from '@/store/appConfirmStore'
import { copyTextToClipboard } from '@/utils/clipboard'
import { pushRecentTemplateId } from '@/utils/recentTemplates'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { templateCategoryLabels, tpl } from '@/utils/templatesUi'
import { cn } from '@/utils/cn'

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; tpl: PromptTemplate }

const emptyDraft = (): TemplateDraft => ({
  name: '',
  description: '',
  category: 'FUNCTIONAL',
  content: '',
  isPublic: true,
})

function sortTemplates(list: PromptTemplate[], sort: TemplateSortKey): PromptTemplate[] {
  const copy = [...list]
  if (sort === 'usage') {
    return copy.sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name, 'zh'))
  }
  if (sort === 'name') {
    return copy.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }
  return copy.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export default function TemplatesPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebouncedValue(keyword, 350)
  const [category, setCategory] = useState<TemplateCategory | ''>('')
  const [sort, setSort] = useState<TemplateSortKey>('updated')
  const [viewMode, setViewMode] = useState<TemplateViewMode>('grid')
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [detailTpl, setDetailTpl] = useState<PromptTemplate | null>(null)
  const [contentVisible, setContentVisible] = useState(true)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    setContentVisible(false)
    try {
      const res = await templatesApi.getTemplates({
        page: 1,
        pageSize: 50,
        keyword: debouncedKeyword || undefined,
        category: category || undefined,
      })
      setTemplates(res.list)
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
      requestAnimationFrame(() => setContentVisible(true))
    }
  }, [debouncedKeyword, category])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const sortedTemplates = useMemo(() => sortTemplates(templates, sort), [templates, sort])

  const customCount = useMemo(
    () => templates.filter((t) => t.category === 'CUSTOM').length,
    [templates],
  )

  const hasActiveFilters = !!debouncedKeyword || !!category

  const openCreate = () => {
    setDraft(emptyDraft())
    setEditor({ mode: 'create' })
    setDetailTpl(null)
  }

  const openEdit = (tplItem: PromptTemplate) => {
    setDraft({
      name: tplItem.name,
      description: tplItem.description || '',
      category: tplItem.category,
      content: tplItem.content,
      isPublic: tplItem.isPublic,
    })
    setEditor({ mode: 'edit', tpl: tplItem })
    setDetailTpl(null)
  }

  const closeEditor = () => {
    setEditor({ mode: 'closed' })
  }

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.content.trim()) {
      toast.error('请填写模板名称与提示词内容')
      return
    }
    setSaving(true)
    try {
      if (editor.mode === 'create') {
        await templatesApi.createTemplate({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          category: draft.category,
          content: draft.content,
          isPublic: draft.isPublic,
          variables: [],
        })
        toast.success('创建成功')
      } else if (editor.mode === 'edit') {
        await templatesApi.updateTemplate(editor.tpl.id, {
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          category: draft.category,
          content: draft.content,
          isPublic: draft.isPublic,
        })
        toast.success('保存成功')
      }
      closeEditor()
      fetchTemplates()
    } catch {
      toast.error(editor.mode === 'create' ? '创建失败' : '保存失败（仅创建者或超级管理员可改）')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = await appConfirm({
      title: '删除该模板？',
      description: '删除后无法恢复，使用此模板的生成记录不受影响。',
      confirmText: '确认删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    try {
      await templatesApi.deleteTemplate(id)
      toast.success('删除成功')
      setDetailTpl((d) => (d?.id === id ? null : d))
      fetchTemplates()
    } catch {
      toast.error('删除失败')
    }
  }

  const copyContent = async (text: string) => {
    const ok = await copyTextToClipboard(text)
    if (ok) toast.success('已复制到剪贴板')
    else toast.error('复制失败，请手动选择文本复制')
  }

  const applyToGenerate = (tplItem: PromptTemplate) => {
    useGenerateStore.getState().setCustomPrompt(tplItem.content)
    useGenerateStore.getState().setSelectedTemplateId(tplItem.id)
    pushRecentTemplateId(tplItem.id)
    toast.success('已应用到生成页，请前往「生成用例」开始生成')
    navigate('/generate')
  }

  const canEdit = (tplItem: PromptTemplate) =>
    !!user && (tplItem.creatorId === user.id || user.role === 'SUPER_ADMIN')

  const resetFilters = () => {
    setKeyword('')
    setCategory('')
  }

  const emptyVariant =
    !loading && templates.length === 0
      ? hasActiveFilters
        ? ('no-match' as const)
        : ('empty' as const)
      : null

  return (
    <div className={tpl.page}>
      <div className={cn(tpl.container, 'gap-6 sm:gap-7')}>
        <header className={tpl.header}>
          <div className="min-w-0">
            <h1 className={tpl.headerTitle}>模板管理</h1>
            <p className={tpl.headerSub}>管理 AI 提示词模板，提升生成质量</p>
            <div className={tpl.headerStats}>
              <span>共 {templates.length} 个模板</span>
              {customCount > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span>自定义 {customCount} 个</span>
                </>
              )}
              {category && (
                <>
                  <span aria-hidden>·</span>
                  <span>当前分类：{templateCategoryLabels[category]}</span>
                </>
              )}
            </div>
          </div>
          <Button
            type="button"
            className="h-11 shrink-0 gap-2 rounded-[13px] px-5 shadow-md transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-lg motion-reduce:transform-none motion-reduce:shadow-md"
            onClick={openCreate}
          >
            <Plus className="h-4 w-4" />
            新建模板
          </Button>
        </header>

        <TemplatesToolbar
          keyword={keyword}
          category={category}
          sort={sort}
          viewMode={viewMode}
          onKeywordChange={setKeyword}
          onCategoryChange={setCategory}
          onSortChange={setSort}
          onViewModeChange={setViewMode}
          onReset={resetFilters}
          onSearch={() => void fetchTemplates()}
        />

        <section className={tpl.content}>
          <div className={tpl.summary}>
            <span>
              {loading
                ? '加载中…'
                : hasActiveFilters
                  ? `找到 ${sortedTemplates.length} 个匹配模板`
                  : `显示 ${sortedTemplates.length} 个模板`}
            </span>
          </div>

          {loading && templates.length === 0 ? (
            <div
              className="flex min-h-[280px] items-center justify-center text-sm text-[hsl(var(--templates-text-muted))]"
              role="status"
            >
              加载中…
            </div>
          ) : emptyVariant ? (
            <TemplatesEmptyState
              variant={emptyVariant}
              onCreate={emptyVariant === 'empty' ? openCreate : undefined}
              onClearFilters={emptyVariant === 'no-match' ? resetFilters : undefined}
            />
          ) : (
            <div
              className={cn(
                viewMode === 'grid' ? tpl.grid : tpl.gridCompact,
                !contentVisible && 'opacity-0',
                contentVisible && 'opacity-100',
              )}
            >
              {sortedTemplates.map((tplItem) => (
                <TemplateCard
                  key={tplItem.id}
                  template={tplItem}
                  compact={viewMode === 'compact'}
                  canEdit={canEdit(tplItem)}
                  onCopy={copyContent}
                  onGenerate={applyToGenerate}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onViewDetail={setDetailTpl}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <TemplateEditorModal
        open={editor.mode !== 'closed'}
        mode={editor.mode === 'edit' ? 'edit' : 'create'}
        draft={draft}
        saving={saving}
        onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onClose={closeEditor}
        onSave={() => void handleSave()}
      />

      <TemplateDetailModal
        template={detailTpl}
        canEdit={detailTpl ? canEdit(detailTpl) : false}
        onClose={() => setDetailTpl(null)}
        onCopy={copyContent}
        onGenerate={applyToGenerate}
        onEdit={(t) => {
          setDetailTpl(null)
          openEdit(t)
        }}
      />
    </div>
  )
}
