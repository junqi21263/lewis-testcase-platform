import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search, Copy, Wand2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { templatesApi } from '@/api/templates'
import { useAuthStore } from '@/store/authStore'
import { useGenerateStore } from '@/store/generateStore'
import type { PromptTemplate, TemplateCategory } from '@/types'
import toast from 'react-hot-toast'
import { pushRecentTemplateId } from '@/utils/recentTemplates'

const categoryLabels: Record<TemplateCategory, string> = {
  FUNCTIONAL: '功能测试',
  PERFORMANCE: '性能测试',
  SECURITY: '安全测试',
  API: 'API 测试',
  UI: 'UI 测试',
  CUSTOM: '自定义',
}

const categoryColors: Record<TemplateCategory, string> = {
  FUNCTIONAL: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
  PERFORMANCE: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-200',
  SECURITY: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
  API: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200',
  UI: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200',
  CUSTOM: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
}

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; tpl: PromptTemplate }

const emptyDraft = () => ({
  name: '',
  description: '',
  category: 'FUNCTIONAL' as TemplateCategory,
  content: '',
  isPublic: true,
})

export default function TemplatesPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<TemplateCategory | ''>('')
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await templatesApi.getTemplates({
        page: 1,
        pageSize: 50,
        keyword: keyword || undefined,
        category: category || undefined,
      })
      setTemplates(res.list)
    } catch {
      // 静默处理
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [category])

  const openCreate = () => {
    setDraft(emptyDraft())
    setEditor({ mode: 'create' })
  }

  const openEdit = (tpl: PromptTemplate) => {
    setDraft({
      name: tpl.name,
      description: tpl.description || '',
      category: tpl.category,
      content: tpl.content,
      isPublic: tpl.isPublic,
    })
    setEditor({ mode: 'edit', tpl })
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
    if (!confirm('确认删除该模板？')) return
    try {
      await templatesApi.deleteTemplate(id)
      toast.success('删除成功')
      fetchTemplates()
    } catch {
      toast.error('删除失败')
    }
  }

  const copyContent = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已复制到剪贴板')
    } catch {
      toast.error('复制失败，请手动选择文本复制')
    }
  }

  const applyToGenerate = (tpl: PromptTemplate) => {
    useGenerateStore.getState().setCustomPrompt(tpl.content)
    useGenerateStore.getState().setSelectedTemplateId(tpl.id)
    pushRecentTemplateId(tpl.id)
    toast.success('已应用到生成页，请前往「生成用例」开始生成')
    navigate('/generate')
  }

  const canEdit = (tpl: PromptTemplate) =>
    !!user && (tpl.creatorId === user.id || user.role === 'SUPER_ADMIN')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">模板管理</h1>
          <p className="text-muted-foreground mt-1">管理 AI 提示词模板，提升生成质量</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          新建模板
        </Button>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="搜索模板..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchTemplates()}
            className="w-56"
          />
          <Button variant="outline" size="icon" onClick={fetchTemplates}>
            <Search className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${category === '' ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
          >
            全部
          </button>
          {(Object.keys(categoryLabels) as TemplateCategory[]).map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
            >
              {categoryLabels[c]}
            </button>
          ))}
        </div>
      </div>

      {/* 模板卡片网格 */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">加载中...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>暂无模板，点击「新建模板」创建第一个</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <Card key={tpl.id} className="hover:shadow-md transition-shadow flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-semibold truncate">{tpl.name}</CardTitle>
                  <Badge className={`text-xs flex-shrink-0 ${categoryColors[tpl.category]}`} variant="outline">
                    {categoryLabels[tpl.category]}
                  </Badge>
                </div>
                {tpl.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{tpl.description}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0 flex flex-col flex-1 gap-2">
                <div
                  className="text-xs bg-muted p-3 rounded-md max-h-48 overflow-y-auto font-mono whitespace-pre-wrap select-text cursor-text border border-border/60"
                  title="可选中复制全文"
                >
                  {tpl.content}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copyContent(tpl.content)}>
                    <Copy className="w-3 h-3" />
                    复制全文
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => applyToGenerate(tpl)}>
                    <Wand2 className="w-3 h-3" />
                    去生成
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-xs text-muted-foreground">使用 {tpl.usageCount} 次</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      disabled={!canEdit(tpl)}
                      title={canEdit(tpl) ? '编辑' : '仅创建者或超级管理员可编辑'}
                      onClick={() => canEdit(tpl) && openEdit(tpl)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      disabled={!canEdit(tpl)}
                      title={canEdit(tpl) ? '删除' : '仅创建者或超级管理员可删除'}
                      onClick={() => canEdit(tpl) && handleDelete(tpl.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 新建 / 编辑 */}
      {editor.mode !== 'closed' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={closeEditor}
        >
          <Card
            className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
              <CardTitle className="text-lg">{editor.mode === 'create' ? '新建模板' : '编辑模板'}</CardTitle>
              <Button type="button" variant="ghost" size="icon" onClick={closeEditor} aria-label="关闭">
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="pt-4 overflow-y-auto space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">名称</label>
                <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} maxLength={100} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">描述</label>
                <Input
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="可选"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">分类</label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as TemplateCategory }))}
                >
                  {(Object.keys(categoryLabels) as TemplateCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {categoryLabels[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">提示词内容</label>
                <textarea
                  className="w-full min-h-[220px] p-3 text-sm border rounded-lg bg-background font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring select-text"
                  value={draft.content}
                  onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isPublic}
                  onChange={(e) => setDraft((d) => ({ ...d, isPublic: e.target.checked }))}
                />
                公开（团队可见）
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={closeEditor}>
                  取消
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
