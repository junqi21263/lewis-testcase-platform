import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { templatesApi } from '@/api/templates'
import type { PromptTemplate, TemplateCategory } from '@/types'
import toast from 'react-hot-toast'

const categoryLabels: Record<TemplateCategory, string> = {
  FUNCTIONAL: '功能测试',
  PERFORMANCE: '性能测试',
  SECURITY: '安全测试',
  API: 'API 测试',
  UI: 'UI 测试',
  CUSTOM: '自定义',
}

const categoryColors: Record<TemplateCategory, string> = {
  FUNCTIONAL: 'bg-blue-100 text-blue-700',
  PERFORMANCE: 'bg-orange-100 text-orange-700',
  SECURITY: 'bg-red-100 text-red-700',
  API: 'bg-purple-100 text-purple-700',
  UI: 'bg-green-100 text-green-700',
  CUSTOM: 'bg-gray-100 text-gray-700',
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<TemplateCategory | ''>('')
  const [loading, setLoading] = useState(false)

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await templatesApi.getTemplates({
        page: 1, pageSize: 50,
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

  useEffect(() => { fetchTemplates() }, [category])

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">模板管理</h1>
          <p className="text-muted-foreground mt-1">管理 AI 提示词模板，提升生成质量</p>
        </div>
        <Button className="gap-2">
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
            onClick={() => setCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${category === '' ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/80'}`}
          >
            全部
          </button>
          {(Object.keys(categoryLabels) as TemplateCategory[]).map((c) => (
            <button
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
            <Card key={tpl.id} className="hover:shadow-md transition-shadow">
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
              <CardContent className="pt-0">
                <pre className="text-xs bg-muted p-3 rounded-md line-clamp-4 font-mono overflow-hidden whitespace-pre-wrap">
                  {tpl.content}
                </pre>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-muted-foreground">使用 {tpl.usageCount} 次</span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="w-7 h-7">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(tpl.id)}
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
    </div>
  )
}
