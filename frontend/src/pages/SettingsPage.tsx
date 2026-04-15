import { useCallback, useEffect, useState } from 'react'
import {
  Save,
  Plus,
  Trash2,
  Bot,
  User,
  Server,
  Sparkles,
  KeyRound,
  Star,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { aiApi } from '@/api/ai'
import { settingsApi, type AIModelAdmin, type RuntimeHints } from '@/api/settings'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { useGenerateStore } from '@/store/generateStore'
import type { AIModel, UserRole } from '@/types'
import toast from 'react-hot-toast'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import { loadGenPrefs, saveGenPrefs, type GenPrefs } from '@/utils/genPrefs'
import { passwordPolicyMessage } from '@/utils/passwordPolicy'

function roleLabel(role: UserRole): string {
  const m: Record<UserRole, string> = {
    SUPER_ADMIN: '超级管理员',
    ADMIN: '管理员',
    MEMBER: '成员',
    VIEWER: '访客',
  }
  return m[role] ?? role
}

function isAdminRole(role?: UserRole | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
}

const emptyCreateForm = {
  name: '',
  provider: 'OpenAI',
  modelId: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  maxTokens: 4096,
  temperature: 0.7,
  isDefault: false,
  supportsVision: false,
  useForDocumentVisionParse: false,
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const setAiParams = useGenerateStore((s) => s.setAiParams)

  const [runtime, setRuntime] = useState<RuntimeHints | null>(null)
  const [adminModels, setAdminModels] = useState<AIModelAdmin[]>([])
  const [publicModels, setPublicModels] = useState<AIModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<AIModelAdmin> & { apiKey?: string }>({})

  const [genPrefs, setGenPrefs] = useState<GenPrefs>(() => loadGenPrefs())
  const [prefsSaving, setPrefsSaving] = useState(false)

  const admin = isAdminRole(user?.role)

  const refreshModels = useCallback(async () => {
    setLoadingModels(true)
    try {
      if (admin) {
        const list = await settingsApi.listModelsAdmin()
        setAdminModels(list)
      } else {
        const list = await aiApi.getModels()
        setPublicModels(list)
      }
    } catch {
      toast.error('加载模型列表失败')
    } finally {
      setLoadingModels(false)
    }
  }, [admin])

  useEffect(() => {
    settingsApi.getRuntime().then(setRuntime).catch(() => setRuntime(null))
  }, [])

  useEffect(() => {
    authApi
      .getProfile()
      .then((u) => {
        updateUser(u)
        setUsername(u.username)
        setAvatar(u.avatar ?? '')
      })
      .catch(() => {})
  }, [updateUser])

  useEffect(() => {
    refreshModels()
  }, [refreshModels])

  useEffect(() => {
    setGenPrefs(loadGenPrefs())
  }, [])

  const saveProfile = async () => {
    if (!username.trim()) {
      toast.error('用户名不能为空')
      return
    }
    setProfileSaving(true)
    try {
      const u = await authApi.updateProfile({
        username: username.trim(),
        avatar: avatar.trim() || undefined,
      })
      updateUser(u)
      toast.success('个人资料已更新')
    } catch {
      /* toast by interceptor */
    } finally {
      setProfileSaving(false)
    }
  }

  const savePassword = async () => {
    const policy = passwordPolicyMessage(newPassword)
    if (policy !== true) {
      toast.error(policy)
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setPwdSaving(true)
    try {
      await authApi.changePassword({ oldPassword, newPassword })
      toast.success('密码已更新')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    } catch {
      /* interceptor */
    } finally {
      setPwdSaving(false)
    }
  }

  const saveGenPreferences = () => {
    setPrefsSaving(true)
    try {
      saveGenPrefs(genPrefs)
      setAiParams({
        temperature: genPrefs.defaultTemperature,
        maxTokens: genPrefs.defaultMaxTokens,
      })
      toast.success('生成默认参数已保存（当前页「生成」步骤将使用该默认值）')
    } finally {
      setPrefsSaving(false)
    }
  }

  const submitCreate = async () => {
    if (!createForm.name.trim() || !createForm.apiKey.trim()) {
      toast.error('请填写名称与 API Key')
      return
    }
    try {
      await settingsApi.createModel({
        name: createForm.name.trim(),
        provider: createForm.provider.trim(),
        modelId: createForm.modelId.trim(),
        baseUrl: createForm.baseUrl.trim(),
        apiKey: createForm.apiKey.trim(),
        maxTokens: createForm.maxTokens,
        temperature: createForm.temperature,
        isDefault: createForm.isDefault,
        isActive: true,
        supportsVision: createForm.supportsVision,
        useForDocumentVisionParse: createForm.useForDocumentVisionParse,
      })
      toast.success('模型已添加')
      setCreateForm(emptyCreateForm)
      setShowCreate(false)
      refreshModels()
    } catch {
      /* */
    }
  }

  const startEdit = (m: AIModelAdmin) => {
    setEditingId(m.id)
    setEditDraft({
      name: m.name,
      provider: m.provider,
      modelId: m.modelId,
      baseUrl: m.baseUrl,
      maxTokens: m.maxTokens,
      temperature: m.temperature,
      isActive: m.isActive,
      isDefault: m.isDefault,
      supportsVision: m.supportsVision,
      useForDocumentVisionParse: m.useForDocumentVisionParse,
      apiKey: '',
    })
  }

  const saveEdit = async (id: string) => {
    try {
      await settingsApi.updateModel(id, {
        name: editDraft.name,
        provider: editDraft.provider,
        modelId: editDraft.modelId,
        baseUrl: editDraft.baseUrl,
        maxTokens: editDraft.maxTokens,
        temperature: editDraft.temperature,
        isActive: editDraft.isActive,
        isDefault: editDraft.isDefault,
        supportsVision: editDraft.supportsVision,
        useForDocumentVisionParse: editDraft.useForDocumentVisionParse,
        ...(editDraft.apiKey?.trim() ? { apiKey: editDraft.apiKey.trim() } : {}),
      })
      toast.success('已保存')
      setEditingId(null)
      refreshModels()
    } catch {
      /* */
    }
  }

  const archive = async (id: string) => {
    if (!window.confirm('确定归档该模型？归档后不会在生成页可选。')) return
    try {
      await settingsApi.archiveModel(id)
      toast.success('已归档')
      refreshModels()
    } catch {
      /* */
    }
  }

  const setDefault = async (id: string) => {
    try {
      await settingsApi.setDefaultModel(id)
      toast.success('已设为默认模型')
      refreshModels()
    } catch {
      /* */
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-muted-foreground mt-1">个人资料、运行环境、AI 模型与生成默认参数</p>
      </div>

      {/* 个人资料 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" />
            个人资料
          </CardTitle>
          <CardDescription>修改显示名称与头像链接</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">用户名</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">邮箱</label>
              <Input value={user?.email ?? ''} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium">头像 URL（可选）</label>
              <Input
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="gap-2" onClick={saveProfile} disabled={profileSaving}>
              <Save className="w-4 h-4" />
              保存资料
            </Button>
            {user?.role && (
              <Badge variant="secondary" className="text-xs">
                {roleLabel(user.role)}
              </Badge>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="w-4 h-4" />
                登录密码
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? '收起' : '修改密码'}
              </Button>
            </div>
            {showPassword && (
              <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
                <Input
                  type="password"
                  placeholder="当前密码"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
                <div />
                <Input
                  type="password"
                  placeholder="新密码"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="确认新密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <div className="sm:col-span-2">
                  <Button size="sm" onClick={savePassword} disabled={pwdSaving}>
                    更新密码
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 运行环境 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4" />
            运行环境
          </CardTitle>
          <CardDescription>只读信息，来自服务端环境变量与当前前端配置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">前端 API 基址</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                {getApiBaseUrl()}
              </code>
            </div>
            {runtime && (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">单文件上传上限</p>
                  <p className="font-medium">{runtime.maxUploadMb} MB</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">全局限流</p>
                  <p className="font-medium">
                    {runtime.throttleLimit} 次 / {runtime.throttleTtlSec} 秒
                  </p>
                </div>
                {typeof runtime.visionPdfMinTextChars === 'number' && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">PDF 视觉补充阈值</p>
                    <p className="font-medium text-xs">
                      提取文本少于 {runtime.visionPdfMinTextChars} 字时尝试首页视觉
                      {runtime.visionPdfAlways ? '（已强制对所有 PDF 尝试视觉）' : ''}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            调整上传大小请在部署环境设置 <code className="bg-muted px-1 rounded">MAX_FILE_SIZE</code>（字节）。
          </p>
        </CardContent>
      </Card>

      {/* 生成默认参数（本地） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            生成默认参数
          </CardTitle>
          <CardDescription>保存在本机浏览器，用于「生成测试用例」页的默认温度与 Token 上限</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-md">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">默认 temperature</label>
              <Input
                type="number"
                step="0.05"
                min={0}
                max={2}
                value={genPrefs.defaultTemperature}
                onChange={(e) =>
                  setGenPrefs((p) => ({ ...p, defaultTemperature: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">默认 maxTokens</label>
              <Input
                type="number"
                step={256}
                min={256}
                max={128000}
                value={genPrefs.defaultMaxTokens}
                onChange={(e) =>
                  setGenPrefs((p) => ({ ...p, defaultMaxTokens: Number(e.target.value) }))
                }
              />
            </div>
          </div>
          <Button className="gap-2" onClick={saveGenPreferences} disabled={prefsSaving}>
            <Save className="w-4 h-4" />
            保存生成默认参数
          </Button>
        </CardContent>
      </Card>

      {/* AI 模型 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI 模型配置
              </CardTitle>
              <CardDescription>
                {admin
                  ? '管理员可增删改模型、设置默认；API Key 仅创建/更新时提交，列表中不会回显。'
                  : '当前账号可查看已启用的模型；配置变更请联系管理员。'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={refreshModels} disabled={loadingModels}>
                <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              {admin && (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowCreate((s) => !s)}>
                  <Plus className="w-4 h-4" />
                  {showCreate ? '收起' : '添加模型'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {admin && showCreate && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <p className="text-sm font-medium">新模型</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="显示名称"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
                <Input
                  placeholder="提供商"
                  value={createForm.provider}
                  onChange={(e) => setCreateForm((f) => ({ ...f, provider: e.target.value }))}
                />
                <Input
                  placeholder="Model ID（如 gpt-4o）"
                  value={createForm.modelId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, modelId: e.target.value }))}
                />
                <Input
                  placeholder="Base URL"
                  value={createForm.baseUrl}
                  onChange={(e) => setCreateForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
                <Input
                  className="sm:col-span-2"
                  placeholder="API Key"
                  type="password"
                  autoComplete="off"
                  value={createForm.apiKey}
                  onChange={(e) => setCreateForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
                <Input
                  type="number"
                  placeholder="maxTokens"
                  value={createForm.maxTokens}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))
                  }
                />
                <Input
                  type="number"
                  step="0.05"
                  placeholder="temperature"
                  value={createForm.temperature}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, temperature: Number(e.target.value) }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.isDefault}
                  onChange={(e) => setCreateForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                设为默认模型
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.supportsVision}
                  onChange={(e) => setCreateForm((f) => ({ ...f, supportsVision: e.target.checked }))}
                />
                支持视觉（多模态 image_url，用于上传图/PDF 解析）
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.useForDocumentVisionParse}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, useForDocumentVisionParse: e.target.checked }))
                  }
                />
                作为「文档视觉解析」专用模型（全局仅选一个；与生成用例的默认模型可不同）
              </label>
              <Button size="sm" onClick={submitCreate}>
                创建
              </Button>
            </div>
          )}

          {admin && adminModels.length === 0 && !showCreate && (
            <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>暂无模型，请点击「添加模型」</p>
            </div>
          )}

          {admin &&
            adminModels.map((model) => (
              <div key={model.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{model.name}</p>
                    {model.isDefault && (
                      <Badge className="text-xs gap-0.5">
                        <Star className="w-3 h-3" />
                        默认
                      </Badge>
                    )}
                    {!model.isActive && (
                      <Badge variant="secondary" className="text-xs">
                        已归档
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Key: {model.hasApiKey ? '已配置' : '未配置'}
                    </Badge>
                    {model.supportsVision && (
                      <Badge variant="secondary" className="text-xs">
                        视觉
                      </Badge>
                    )}
                    {model.useForDocumentVisionParse && (
                      <Badge className="text-xs bg-violet-600 text-white hover:bg-violet-600">
                        文档视觉解析
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {admin && model.isActive && !model.isDefault && (
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setDefault(model.id)}>
                        设默认
                      </Button>
                    )}
                    {admin && (
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => startEdit(model)}>
                        编辑
                      </Button>
                    )}
                    {admin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => archive(model.id)}
                        disabled={!model.isActive}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {editingId === model.id ? (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t">
                    <Input
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                    <Input
                      value={editDraft.provider}
                      onChange={(e) => setEditDraft((d) => ({ ...d, provider: e.target.value }))}
                    />
                    <Input
                      value={editDraft.modelId}
                      onChange={(e) => setEditDraft((d) => ({ ...d, modelId: e.target.value }))}
                    />
                    <Input
                      value={editDraft.baseUrl}
                      onChange={(e) => setEditDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                    />
                    <Input
                      type="number"
                      value={editDraft.maxTokens}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, maxTokens: Number(e.target.value) }))
                      }
                    />
                    <Input
                      type="number"
                      step="0.05"
                      value={editDraft.temperature}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, temperature: Number(e.target.value) }))
                      }
                    />
                    <Input
                      className="sm:col-span-2"
                      type="password"
                      placeholder="新 API Key（留空不修改）"
                      value={editDraft.apiKey}
                      onChange={(e) => setEditDraft((d) => ({ ...d, apiKey: e.target.value }))}
                    />
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={editDraft.isActive}
                        onChange={(e) => setEditDraft((d) => ({ ...d, isActive: e.target.checked }))}
                      />
                      启用
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={editDraft.isDefault}
                        onChange={(e) => setEditDraft((d) => ({ ...d, isDefault: e.target.checked }))}
                      />
                      设为默认
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={!!editDraft.supportsVision}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, supportsVision: e.target.checked }))
                        }
                      />
                      支持视觉（多模态）
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={!!editDraft.useForDocumentVisionParse}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            useForDocumentVisionParse: e.target.checked,
                          }))
                        }
                      />
                      文档视觉解析专用（全局仅一个）
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <Button size="sm" onClick={() => saveEdit(model.id)}>
                        保存
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">提供商</p>
                      <p>{model.provider}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Model ID</p>
                      <p className="break-all">{model.modelId}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground mb-1">Base URL</p>
                      <p className="break-all text-xs">{model.baseUrl}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {!admin &&
            (publicModels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                暂无可用模型
              </div>
            ) : (
              publicModels.map((model) => (
                <div key={model.id} className="p-4 border rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{model.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {model.provider} · {model.modelId}
                    </p>
                  </div>
                  {model.isDefault && <Badge>默认</Badge>}
                </div>
              ))
            ))}
        </CardContent>
      </Card>
    </div>
  )
}
