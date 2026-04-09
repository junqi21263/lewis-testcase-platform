import { useState, useEffect } from 'react'
import { Save, Plus, Trash2, Bot } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { aiApi } from '@/api/ai'
import type { AIModel } from '@/types'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [models, setModels] = useState<AIModel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    aiApi.getModels().then(setModels).catch(() => setModels([]))
  }, [])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-muted-foreground mt-1">配置 AI 模型、系统参数等</p>
      </div>

      {/* AI 模型配置 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" /> AI 模型配置
              </CardTitle>
              <CardDescription>配置可用的 AI 模型，支持 OpenAI 兼容接口</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> 添加模型
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {models.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>暂无模型配置，请添加 AI 模型</p>
            </div>
          ) : (
            models.map((model) => (
              <div key={model.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{model.name}</p>
                    {model.isDefault && <Badge variant="default" className="text-xs">默认</Badge>}
                  </div>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">提供商</p>
                    <Input value={model.provider} readOnly className="bg-muted text-xs h-8" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Model ID</p>
                    <Input value={model.modelId} readOnly className="bg-muted text-xs h-8" />
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">接口地址（Base URL）</p>
                    <Input value={model.baseUrl} readOnly className="bg-muted text-xs h-8" />
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 系统参数 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">系统参数</CardTitle>
          <CardDescription>配置文件上传、生成等系统级参数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">最大文件大小（MB）</label>
              <Input type="number" defaultValue={10} min={1} max={100} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">默认生成超时（秒）</label>
              <Input type="number" defaultValue={120} min={30} max={600} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-sm font-medium">默认系统提示词前缀</label>
              <textarea
                className="w-full h-24 p-3 text-sm border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                defaultValue="你是一名专业的软件测试工程师，精通各类测试方法和测试用例编写规范。"
              />
            </div>
          </div>
          <Button className="gap-2" disabled={loading} onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); toast.success('设置已保存') }, 500) }}>
            <Save className="w-4 h-4" />
            保存设置
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
