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
  ClipboardList,
  Image as ImageIcon,
  CloudSun,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { aiApi } from '@/api/ai'
import { settingsApi, type AIModelAdmin, type RuntimeHints } from '@/api/settings'
import { authApi } from '@/api/auth'
import { adminApi, type AdminAuditLogItem, type AdminUserItem } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useGenerateStore } from '@/store/generateStore'
import type { AIModel, UserRole } from '@/types'
import toast from 'react-hot-toast'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import { loadGenPrefs, saveGenPrefs, type GenPrefs } from '@/utils/genPrefs'
import { passwordPolicyMessage } from '@/utils/passwordPolicy'
import { format } from 'date-fns'
import { preferencesApi, type UserPreferences } from '@/api/preferences'
import { weatherApi, type WeatherCityItem } from '@/api/weather'
import { wallpaperApi } from '@/api/wallpaper'
import { notify } from '@/utils/notify'

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

function auditActionLabel(action: string): string {
  if (action === 'ADMIN_RESET_PASSWORD') return '重置密码'
  if (action === 'ADMIN_UPDATE_ROLE') return '修改角色'
  return action
}

function formatAuditExtra(action: string, detail: unknown): string {
  if (!detail || typeof detail !== 'object') return ''
  const d = detail as Record<string, unknown>
  if (
    action === 'ADMIN_UPDATE_ROLE' &&
    typeof d.fromRole === 'string' &&
    typeof d.toRole === 'string'
  ) {
    return `${roleLabel(d.fromRole as UserRole)} → ${roleLabel(d.toRole as UserRole)}`
  }
  return ''
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
  const [testingModelId, setTestingModelId] = useState<string | null>(null)

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

  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null)
  const [userPrefsSaving, setUserPrefsSaving] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState<WeatherCityItem[]>([])
  const [citySearching, setCitySearching] = useState(false)

  const admin = isAdminRole(user?.role)
  const superAdmin = user?.role === 'SUPER_ADMIN'

  const [adminKeyword, setAdminKeyword] = useState('')
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([])
  const [adminLoadingUsers, setAdminLoadingUsers] = useState(false)
  const [adminSelectedUser, setAdminSelectedUser] = useState<AdminUserItem | null>(null)
  const [adminNewPwd, setAdminNewPwd] = useState('')
  const [adminOpLoading, setAdminOpLoading] = useState(false)

  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogItem[]>([])
  const [adminAuditLoading, setAdminAuditLoading] = useState(false)

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

  useEffect(() => {
    preferencesApi
      .getMy()
      .then(setUserPrefs)
      .catch(() => setUserPrefs(null))
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

  const saveUserPreferences = async (patch: Partial<UserPreferences>) => {
    setUserPrefsSaving(true)
    try {
      const next = await preferencesApi.updateMy(patch)
      setUserPrefs(next)
      notify.success('已保存')
    } catch {
      /* toast by interceptor */
    } finally {
      setUserPrefsSaving(false)
    }
  }

  const searchCities = async (q: string) => {
    const query = q.trim()
    if (!query) {
      setCityResults([])
      return
    }
    setCitySearching(true)
    try {
      const list = await weatherApi.cities(query)
      setCityResults(list)
    } catch {
      /* */
    } finally {
      setCitySearching(false)
    }
  }

  const pickCity = async (c: WeatherCityItem) => {
    await saveUserPreferences({
      weatherCityId: c.id,
      weatherCityName: c.name,
      weatherCityAdm1: c.adm1,
      weatherCityCountry: c.country,
    })
    setCityResults([])
    setCityQuery('')
  }

  const rotateWallpaperNow = async () => {
    try {
      await wallpaperApi.next({ force: true })
      notify.success('已请求更换壁纸（若已开启动态壁纸，将在页面背景生效）')
    } catch {
      /* */
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

  const testModel = async (id: string) => {
    setTestingModelId(id)
    try {
      const res = await aiApi.testModel({ modelConfigId: id })
      toast.success(`连通性 OK：${res.modelName}（${res.latencyMs}ms）`)
      await refreshModels()
    } catch {
      await refreshModels()
      /* toast by interceptor */
    } finally {
      setTestingModelId(null)
    }
  }

  const refreshAdminUsers = useCallback(async () => {
    if (!superAdmin) return
    setAdminLoadingUsers(true)
    try {
      const res = await adminApi.listUsers({ keyword: adminKeyword.trim() || undefined, page: 1, pageSize: 20 })
      setAdminUsers(res.list)
      if (adminSelectedUser) {
        const next = res.list.find((u) => u.id === adminSelectedUser.id) ?? null
        setAdminSelectedUser(next)
      }
    } catch {
      toast.error('加载用户列表失败')
    } finally {
      setAdminLoadingUsers(false)
    }
  }, [adminKeyword, adminSelectedUser, superAdmin])

  const refreshAuditLogs = useCallback(async () => {
    if (!superAdmin) return
    setAdminAuditLoading(true)
    try {
      const res = await adminApi.listAuditLogs({ page: 1, pageSize: 30 })
      setAdminAuditLogs(res.list)
    } catch {
      toast.error('加载运维审计日志失败')
    } finally {
      setAdminAuditLoading(false)
    }
  }, [superAdmin])

  useEffect(() => {
    if (!superAdmin) return
    void refreshAuditLogs()
  }, [superAdmin, refreshAuditLogs])

  const resetSelectedUserPassword = async () => {
    if (!superAdmin) return
    if (!adminSelectedUser) {
      toast.error('请先选择用户')
      return
    }
    if (!adminNewPwd.trim()) {
      toast.error('请输入新密码')
      return
    }
    setAdminOpLoading(true)
    try {
      await adminApi.resetUserPassword(adminSelectedUser.id, { newPassword: adminNewPwd })
      toast.success('密码已重置')
      setAdminNewPwd('')
      await refreshAuditLogs()
    } catch {
      /* toast by interceptor */
    } finally {
      setAdminOpLoading(false)
    }
  }

  const updateSelectedUserRole = async (role: UserRole) => {
    if (!superAdmin) return
    if (!adminSelectedUser) return
    setAdminOpLoading(true)
    try {
      await adminApi.updateUserRole(adminSelectedUser.id, { role })
      toast.success('角色已更新')
      await refreshAdminUsers()
      await refreshAuditLogs()
    } catch {
      /* toast by interceptor */
    } finally {
      setAdminOpLoading(false)
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

      {/* 外观与天气（云端偏好） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            外观与天气
          </CardTitle>
          <CardDescription>保存在账号下，用于动态壁纸与 Header 天气展示（城市需手动选择）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">动态壁纸（网页背景）</p>
                <p className="text-xs text-muted-foreground">
                  开启后会在页面背景加载 Bing 每日壁纸；默认每次进入换一张
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!userPrefs?.wallpaperEnabled}
                  onChange={(e) => saveUserPreferences({ wallpaperEnabled: e.target.checked })}
                  disabled={userPrefsSaving}
                />
                开启
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">更换频率</label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={String(userPrefs?.wallpaperIntervalSec ?? 0)}
                  onChange={(e) => saveUserPreferences({ wallpaperIntervalSec: Number(e.target.value) })}
                  disabled={userPrefsSaving}
                >
                  <option value="0">每次进入（手动触发）</option>
                  <option value={String(3600)}>每小时</option>
                  <option value={String(24 * 3600)}>每日</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" onClick={rotateWallpaperNow} disabled={userPrefsSaving}>
                  换一张
                </Button>
                {userPrefs?.wallpaperLastAt && (
                  <span className="text-xs text-muted-foreground">
                    上次：{format(new Date(userPrefs.wallpaperLastAt), 'yyyy-MM-dd HH:mm')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CloudSun className="w-4 h-4" />
              天气（手动城市）
            </div>
            <div className="text-xs text-muted-foreground">
              当前城市：{userPrefs?.weatherCityName ? `${userPrefs.weatherCityName}` : '未设置'}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="搜索城市（如：北京、上海、深圳）"
              />
              <Button
                variant="outline"
                onClick={() => searchCities(cityQuery)}
                disabled={citySearching || userPrefsSaving}
              >
                {citySearching ? '搜索中...' : '搜索'}
              </Button>
            </div>

            {cityResults.length > 0 && (
              <div className="border rounded-md divide-y overflow-hidden">
                {cityResults.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2"
                    onClick={() => pickCity(c)}
                  >
                    <span className="truncate">
                      {c.name}
                      {c.adm1 ? ` · ${c.adm1}` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
                    {model.lastTestAt != null && (
                      <Badge
                        variant="outline"
                        className={`text-xs max-w-[min(100%,22rem)] truncate font-normal ${
                          model.lastTestOk === false ? 'border-destructive/60 text-destructive' : ''
                        }`}
                        title={
                          model.lastTestOk === false && model.lastTestError
                            ? model.lastTestError
                            : undefined
                        }
                      >
                        上次测试{' '}
                        {model.lastTestOk === true && model.lastTestLatencyMs != null
                          ? `成功 ${model.lastTestLatencyMs}ms`
                          : model.lastTestOk === false
                            ? '失败'
                            : '—'}{' '}
                        · {format(new Date(model.lastTestAt), 'MM-dd HH:mm')}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => testModel(model.id)}
                        disabled={!model.hasApiKey || testingModelId === model.id}
                        title={!model.hasApiKey ? '请先配置 API Key' : '发送一个小请求测试连通性'}
                      >
                        {testingModelId === model.id ? '测试中…' : '测试'}
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

      {/* 超级管理员：用户运维 */}
      {superAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              超级管理员工具
            </CardTitle>
            <CardDescription>用户查询、重置密码、修改角色（仅超级管理员可见）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="搜索邮箱或用户名（最多展示 20 条）"
                value={adminKeyword}
                onChange={(e) => setAdminKeyword(e.target.value)}
              />
              <Button variant="outline" onClick={refreshAdminUsers} disabled={adminLoadingUsers}>
                <RefreshCw className={`w-4 h-4 ${adminLoadingUsers ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border rounded-lg p-3 max-h-72 overflow-y-auto">
                {adminUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无数据，请搜索或刷新</p>
                ) : (
                  <div className="space-y-2">
                    {adminUsers.map((u) => {
                      const active = adminSelectedUser?.id === u.id
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setAdminSelectedUser(u)}
                          className={`w-full text-left p-2 rounded border transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{u.username}</p>
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            </div>
                            <Badge variant="secondary" className="text-xs">{roleLabel(u.role)}</Badge>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border rounded-lg p-3 space-y-3">
                {!adminSelectedUser ? (
                  <p className="text-sm text-muted-foreground">选择左侧用户后，可重置密码或修改角色</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{adminSelectedUser.username}</p>
                      <p className="text-xs text-muted-foreground">{adminSelectedUser.email}</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <label className="text-sm font-medium">修改角色</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
                          value={adminSelectedUser.role}
                          onChange={(e) => updateSelectedUserRole(e.target.value as UserRole)}
                          disabled={adminOpLoading}
                        >
                          {(['SUPER_ADMIN', 'ADMIN', 'MEMBER', 'VIEWER'] as UserRole[]).map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        角色有层级：SUPER_ADMIN {'>'} ADMIN {'>'} MEMBER {'>'} VIEWER
                      </p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <label className="text-sm font-medium">重置密码</label>
                      <Input
                        type="password"
                        placeholder="新密码（建议至少 8 位）"
                        value={adminNewPwd}
                        onChange={(e) => setAdminNewPwd(e.target.value)}
                        disabled={adminOpLoading}
                      />
                      <Button onClick={resetSelectedUserPassword} disabled={adminOpLoading}>
                        重置密码
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {passwordPolicyMessage(adminNewPwd || '') === true
                          ? '密码强度 OK'
                          : passwordPolicyMessage(adminNewPwd || '')}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {superAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  运维审计日志
                </CardTitle>
                <CardDescription>仅记录操作类型与目标用户，不记录密码内容</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => void refreshAuditLogs()} disabled={adminAuditLoading}>
                <RefreshCw className={`w-3.5 h-3.5 ${adminAuditLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {adminAuditLogs.length === 0 && !adminAuditLoading ? (
              <p className="text-sm text-muted-foreground">暂无审计记录</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {adminAuditLogs.map((log) => {
                  const extra = formatAuditExtra(log.action, log.detail)
                  return (
                    <div key={log.id} className="text-xs border rounded-md p-2 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                        </span>
                        <Badge variant="outline">{auditActionLabel(log.action)}</Badge>
                      </div>
                      <p className="break-words">
                        <span className="text-muted-foreground">操作者：</span>
                        {log.operator.username}
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-muted-foreground">目标：</span>
                        {log.targetUser.username}
                        {extra ? <span className="ml-1 text-muted-foreground">（{extra}）</span> : null}
                      </p>
                      {log.ip ? <p className="text-muted-foreground">IP：{log.ip}</p> : null}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
