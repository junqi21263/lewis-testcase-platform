import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Save, User, Server, Sparkles, KeyRound, RefreshCw, ClipboardList } from 'lucide-react'
import { AppearanceWeatherSection } from '@/components/settings/AppearanceWeatherSection'
import { CopyableValue } from '@/components/settings/CopyableValue'
import { FileParsingSettingsSection } from '@/components/settings/FileParsingSettingsSection'
import { ModelHubSection } from '@/components/settings/ModelHubSection'
import type { SettingsModelFormDraft } from '@/components/settings/ModelEditorPanel'
import { PasswordChangeModal } from '@/components/settings/PasswordChangeModal'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsNav } from '@/components/settings/SettingsNav'
import { SettingsPageHeader } from '@/components/settings/SettingsPageHeader'
import { SettingsOverviewSection } from '@/components/settings/SettingsOverviewSection'
import { WorkflowDefaultsSection } from '@/components/settings/WorkflowDefaultsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { aiApi } from '@/api/ai'
import { settingsApi, type AIModelAdmin, type RuntimeHints, type MultimodalRuntimeConfig } from '@/api/settings'
import { authApi } from '@/api/auth'
import { adminApi, type AdminAuditLogItem, type AdminInviteCodeItem, type AdminUserItem } from '@/api/admin'
import { useAuthStore } from '@/store/authStore'
import { useGenerateStore } from '@/store/generateStore'
import type { AIModel, UserRole } from '@/types'
import toast from 'react-hot-toast'
import { appConfirm } from '@/store/appConfirmStore'
import { getApiBaseUrl } from '@/utils/apiBaseUrl'
import { loadGenPrefs, saveGenPrefs, type GenPrefs } from '@/utils/genPrefs'
import { passwordPolicyMessage } from '@/utils/passwordPolicy'
import { format } from 'date-fns'
import { preferencesApi, type UserPreferences } from '@/api/preferences'
import { weatherApi, type WeatherCityItem } from '@/api/weather'
import { wallpaperApi } from '@/api/wallpaper'
import { notify } from '@/utils/notify'
import { cn } from '@/utils/cn'
import { set, roleBadgeClass, type SettingsNavItem } from '@/utils/settingsUi'
import { useThemeStore } from '@/store/themeStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { isAvatarHostingPageUrl, resolveAvatarDisplayUrl } from '@/utils/avatarUrl'

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
  if (action === 'SETTINGS_AI_MODEL_CREATE') return '新增模型'
  if (action === 'SETTINGS_AI_MODEL_UPDATE') return '编辑模型'
  if (action === 'SETTINGS_AI_MODEL_DELETE') return '删除模型'
  if (action === 'SETTINGS_AI_MODEL_SET_DEFAULT') return '设为默认模型'
  if (action === 'SETTINGS_MULTIMODAL_CONFIG_UPDATE') return '修改多模态配置'
  if (action === 'INVITE_CODE_CREATE') return '创建邀请码'
  if (action === 'INVITE_CODE_STATUS_UPDATE') return '更新邀请码'
  return action
}

function auditDetail(detail: unknown): Record<string, unknown> {
  return detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {}
}

function auditTargetLabel(log: AdminAuditLogItem): string {
  const d = auditDetail(log.detail)
  if (typeof d.targetName === 'string' && d.targetName.trim()) return d.targetName
  if (typeof d.targetUsername === 'string' && d.targetUsername.trim()) return d.targetUsername
  return log.targetUser.username
}

function formatChangedFields(fields: unknown): string {
  if (!Array.isArray(fields)) return ''
  const list = fields.filter((field): field is string => typeof field === 'string' && field.trim().length > 0)
  if (!list.length) return ''
  return `字段：${list.join('、')}`
}

function formatAuditExtra(action: string, detail: unknown): string {
  const d = auditDetail(detail)
  if (action === 'ADMIN_UPDATE_ROLE' && typeof d.fromRole === 'string' && typeof d.toRole === 'string') {
    return `${roleLabel(d.fromRole as UserRole)} → ${roleLabel(d.toRole as UserRole)}`
  }
  const changed = formatChangedFields(d.changedFields)
  if (changed) {
    const apiKeyHint = d.apiKeyChanged === true ? '，API Key 已更新' : ''
    return `${changed}${apiKeyHint}`
  }
  if (typeof d.modelId === 'string' && d.modelId.trim()) return `模型：${d.modelId}`
  if (typeof d.inviteCodeId === 'string' && d.inviteCodeId.trim()) return `邀请码：${d.inviteCodeId}`
  return ''
}

const emptyCreateForm: SettingsModelFormDraft = {
  name: '',
  provider: 'OpenAI',
  modelId: 'gpt-4o',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  maxTokens: 32768,
  temperature: 0.7,
  isDefault: false,
  supportsVision: false,
  useForDocumentVisionParse: false,
}

export default function SettingsPage() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const updateUser = useAuthStore((s) => s.updateUser)
  const setAiParams = useGenerateStore((s) => s.setAiParams)

  const [runtime, setRuntime] = useState<RuntimeHints | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [multimodalConfig, setMultimodalConfig] = useState<MultimodalRuntimeConfig | null>(null)
  const [multimodalSaving, setMultimodalSaving] = useState(false)
  const [adminModels, setAdminModels] = useState<AIModelAdmin[]>([])
  const [publicModels, setPublicModels] = useState<AIModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [testingModelId, setTestingModelId] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('section-profile')
  const theme = useThemeStore((s) => s.theme)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreateForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<SettingsModelFormDraft | null>(null)

  const [genPrefs, setGenPrefs] = useState<GenPrefs>(() => loadGenPrefs())
  const [prefsSaving, setPrefsSaving] = useState(false)

  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null)
  const [userPrefsSaving, setUserPrefsSaving] = useState(false)
  const [cityQuery, setCityQuery] = useState('')
  const [cityResults, setCityResults] = useState<WeatherCityItem[]>([])
  const [citySearching, setCitySearching] = useState(false)

  const admin = isAdminRole(user?.role)
  const superAdmin = user?.role === 'SUPER_ADMIN'
  const avatarPreviewSrc = resolveAvatarDisplayUrl(avatar || user?.avatar)
  const avatarInitials = (username || user?.username || 'U').slice(0, 2).toUpperCase()

  const [adminKeyword, setAdminKeyword] = useState('')
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([])
  const [adminLoadingUsers, setAdminLoadingUsers] = useState(false)
  const [adminSelectedUser, setAdminSelectedUser] = useState<AdminUserItem | null>(null)
  const [adminNewPwd, setAdminNewPwd] = useState('')
  const [adminOpLoading, setAdminOpLoading] = useState(false)

  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogItem[]>([])
  const [adminAuditLoading, setAdminAuditLoading] = useState(false)
  const [inviteCodes, setInviteCodes] = useState<AdminInviteCodeItem[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteCreating, setInviteCreating] = useState(false)
  const [inviteDraft, setInviteDraft] = useState({ code: '', maxUses: '', expiresAt: '', remark: '' })
  const [lastCreatedInviteCode, setLastCreatedInviteCode] = useState('')

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

  const refreshRuntime = useCallback(async () => {
    setRuntimeLoading(true)
    try {
      const next = await settingsApi.getRuntime()
      setRuntime(next)
    } catch {
      setRuntime(null)
    } finally {
      setRuntimeLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshRuntime()
    settingsApi
      .getMultimodalConfig()
      .then(setMultimodalConfig)
      .catch(() => setMultimodalConfig(null))
  }, [refreshRuntime])

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

  useEffect(() => {
    if (location.hash !== '#appearance-weather') return
    // Wait a tick for layout; then scroll into view.
    const t = window.setTimeout(() => {
      const el = document.getElementById('appearance-weather')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
    return () => window.clearTimeout(t)
  }, [location.hash])

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
      setPasswordModalOpen(false)
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

  const saveMultimodalConfig = async () => {
    if (!multimodalConfig) return
    setMultimodalSaving(true)
    try {
      const next = await settingsApi.updateMultimodalConfig(multimodalConfig)
      setMultimodalConfig(next)
      toast.success('多模态配置已保存并实时生效')
    } finally {
      setMultimodalSaving(false)
    }
  }

  const saveUserPreferences = async (patch: Partial<UserPreferences>) => {
    setUserPrefsSaving(true)
    try {
      const next = await preferencesApi.updateMy(patch)
      setUserPrefs(next)
      notify.success('已保存')
      window.dispatchEvent(new Event('user-preferences-updated'))
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
    if (query.length < 2) {
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

  useEffect(() => {
    const q = cityQuery.trim()
    if (!q || q.length < 2) {
      setCityResults([])
      return
    }
    const t = window.setTimeout(() => {
      searchCities(q).catch(() => {})
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityQuery])

  const rotateWallpaperNow = async () => {
    try {
      const res = await wallpaperApi.next({ force: true })
      if (res?.url) {
        window.dispatchEvent(
          new CustomEvent('wallpaper-url-updated', {
            detail: { url: res.url },
          }),
        )
      }
      const next = await preferencesApi.getMy()
      setUserPrefs(next)
      notify.success('壁纸已更新')
      window.dispatchEvent(new Event('user-preferences-updated'))
    } catch {
      /* */
    }
  }

  const submitCreate = async () => {
    const apiKey = createForm.apiKey ?? ''
    if (!createForm.name.trim() || !apiKey.trim()) {
      toast.error('请填写名称与 API Key')
      return
    }
    try {
      await settingsApi.createModel({
        name: createForm.name.trim(),
        provider: createForm.provider.trim(),
        modelId: createForm.modelId.trim(),
        baseUrl: createForm.baseUrl.trim(),
        apiKey: apiKey.trim(),
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
    if (!editDraft) return
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
      setEditDraft(null)
      refreshModels()
    } catch {
      /* */
    }
  }

  const deleteModel = async (id: string) => {
    const ok = await appConfirm({
      title: '删除该模型配置？',
      description: '删除后将从模型列表移除；如果该模型已被历史数据引用，系统会阻止删除。',
      confirmText: '确认删除',
      confirmVariant: 'destructive',
    })
    if (!ok) return
    try {
      await settingsApi.deleteModel(id)
      toast.success('已删除模型配置')
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
      const res = await adminApi.listUsers({
        keyword: adminKeyword.trim() || undefined,
        page: 1,
        pageSize: 20,
      })
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

  const refreshInviteCodes = useCallback(async () => {
    if (!superAdmin) return
    setInviteLoading(true)
    try {
      const res = await adminApi.listInviteCodes({ page: 1, pageSize: 20 })
      setInviteCodes(res.list)
    } catch {
      toast.error('加载邀请码列表失败')
    } finally {
      setInviteLoading(false)
    }
  }, [superAdmin])

  useEffect(() => {
    if (!superAdmin) return
    void refreshAuditLogs()
    void refreshInviteCodes()
  }, [superAdmin, refreshAuditLogs, refreshInviteCodes])

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
      await adminApi.resetUserPassword(adminSelectedUser.id, {
        newPassword: adminNewPwd,
      })
      toast.success('密码已重置')
      setAdminNewPwd('')
      await refreshAuditLogs()
    } catch {
      /* toast by interceptor */
    } finally {
      setAdminOpLoading(false)
    }
  }

  const navItems: SettingsNavItem[] = useMemo(
    () => [
      { id: 'section-overview', label: '总览' },
      { id: 'section-profile', label: '个人资料' },
      { id: 'section-runtime', label: '运行环境' },
      { id: 'section-file-parsing', label: '文件解析' },
      ...(admin ? [{ id: 'section-multimodal', label: '多模态配置' }] : []),
      { id: 'section-workflow-defaults', label: '工作流默认' },
      { id: 'appearance-weather', label: '外观天气' },
      { id: 'section-ai-models', label: 'AI 模型' },
      ...(superAdmin ? [{ id: 'section-super-admin', label: '管理工具' }] : []),
      ...(superAdmin ? [{ id: 'section-invite-codes', label: '邀请码' }] : []),
      ...(superAdmin ? [{ id: 'section-audit', label: '审计日志' }] : []),
    ],
    [admin, superAdmin],
  )

  const themeLabel = theme === 'dark' ? '深色模式' : '浅色模式'
  const cityHeaderLabel = userPrefs?.weatherCityName
    ? `${userPrefs.weatherCityName}${userPrefs.weatherCityAdm1 ? ` · ${userPrefs.weatherCityAdm1}` : ''}`
    : '天气城市未设置'

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

  const createInviteCode = async () => {
    if (!superAdmin) return
    setInviteCreating(true)
    try {
      const maxUses = inviteDraft.maxUses.trim() ? Number(inviteDraft.maxUses) : undefined
      if (maxUses !== undefined && (!Number.isInteger(maxUses) || maxUses < 1)) {
        toast.error('最大使用次数必须是正整数')
        return
      }
      const res = await adminApi.createInviteCode({
        code: inviteDraft.code.trim() || undefined,
        maxUses,
        expiresAt: inviteDraft.expiresAt.trim() || undefined,
        remark: inviteDraft.remark.trim() || undefined,
      })
      setLastCreatedInviteCode(res.code)
      setInviteDraft({ code: '', maxUses: '', expiresAt: '', remark: '' })
      toast.success('邀请码已创建，请立即复制保存')
      await refreshInviteCodes()
      await refreshAuditLogs()
    } catch {
      /* toast by interceptor */
    } finally {
      setInviteCreating(false)
    }
  }

  const setInviteCodeStatus = async (item: AdminInviteCodeItem, status: 'ACTIVE' | 'DISABLED') => {
    if (!superAdmin) return
    setInviteLoading(true)
    try {
      await adminApi.updateInviteCodeStatus(item.id, { status })
      toast.success(status === 'ACTIVE' ? '邀请码已启用' : '邀请码已停用')
      await refreshInviteCodes()
      await refreshAuditLogs()
    } catch {
      /* toast by interceptor */
    } finally {
      setInviteLoading(false)
    }
  }

  return (
    <div className={set.page}>
      <div className={set.container}>
        <SettingsPageHeader themeLabel={themeLabel} cityLabel={cityHeaderLabel} />

        <div className={set.layout}>
          <SettingsNav items={navItems} activeId={activeSection} onSelect={setActiveSection} />

          <div className={set.content}>
            <SettingsOverviewSection
              runtime={runtime}
              models={adminModels}
              loading={runtimeLoading}
              onRefresh={refreshRuntime}
            />

            <SettingsCard
              id="section-profile"
              icon={User}
              title="个人资料"
              description="修改显示名称与头像链接"
              footer={
                <div className="flex w-full flex-wrap items-center gap-3">
                  <Button className={set.btnPrimary} onClick={saveProfile} disabled={profileSaving}>
                    <Save className="h-4 w-4" />
                    保存资料
                  </Button>
                  {user?.role ? (
                    <span className={cn(roleBadgeClass(user.role), 'inline-flex h-10 items-center px-3')}>
                      {roleLabel(user.role)}
                    </span>
                  ) : null}
                </div>
              }
            >
              <div className={set.formGrid}>
                <div className={set.formRow}>
                  <label className={set.label}>用户名</label>
                  <Input className={set.control} value={username} onChange={(e) => setUsername(e.target.value)} />
                </div>
                <div className={set.formRow}>
                  <label className={set.label}>邮箱</label>
                  <Input className={cn(set.control, 'opacity-90')} value={user?.email ?? ''} readOnly />
                </div>
                <div className={cn(set.formRow, 'sm:col-span-2')}>
                  <label className={set.label}>头像 URL（可选）</label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Avatar className="h-14 w-14 shrink-0 ring-2 ring-[hsl(var(--settings-card-border))]">
                      <AvatarImage src={avatarPreviewSrc} alt="" referrerPolicy="no-referrer" />
                      <AvatarFallback className="text-sm">{avatarInitials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Input
                        className={cn(set.control, 'font-mono text-xs')}
                        value={avatar}
                        onChange={(e) => setAvatar(e.target.value)}
                        placeholder="https://i.ibb.co/.../avatar.png"
                      />
                      <p className={set.hint}>
                        请使用图片直链（如 ImgBB 的「直接链接」）。页面链接（ibb.co/xxx）保存时会自动解析。
                        {isAvatarHostingPageUrl(avatar) && !avatarPreviewSrc
                          ? ' 当前为页面链接，保存后将尝试解析。'
                          : null}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <Separator className="bg-[hsl(var(--settings-card-border))]/60" />
              <div className={set.toggleRow}>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[hsl(var(--settings-text-secondary))]" />
                  <div>
                    <p className={set.toggleLabel}>登录密码</p>
                    <p className={set.toggleHint}>定期更新密码以保障账号安全</p>
                  </div>
                </div>
                <Button variant="outline" className={set.btnSecondary} onClick={() => setPasswordModalOpen(true)}>
                  修改密码
                </Button>
              </div>
            </SettingsCard>

            <PasswordChangeModal
              open={passwordModalOpen}
              oldPassword={oldPassword}
              newPassword={newPassword}
              confirmPassword={confirmPassword}
              saving={pwdSaving}
              onOldChange={setOldPassword}
              onNewChange={setNewPassword}
              onConfirmChange={setConfirmPassword}
              onClose={() => setPasswordModalOpen(false)}
              onSave={savePassword}
            />

            <SettingsCard
              id="section-runtime"
              icon={Server}
              title="运行环境"
              description="只读信息，来自服务端环境变量与当前前端配置"
              actions={
                <Button
                  variant="outline"
                  className={set.btnSecondary}
                  onClick={refreshRuntime}
                  disabled={runtimeLoading}
                >
                  <RefreshCw className={cn('h-4 w-4', runtimeLoading ? 'animate-spin' : '')} />
                  刷新
                </Button>
              }
            >
              <p className={set.infoPill}>此区域为运行环境只读信息，需在服务端配置中修改。</p>
              <div className={set.infoGrid}>
                <div className={set.infoItem}>
                  <p className={set.infoLabel}>前端 API 基址</p>
                  <CopyableValue value={getApiBaseUrl()} />
                </div>
                {runtime ? (
                  <>
                    <div className={set.infoItem}>
                      <p className={set.infoLabel}>单文件上传上限</p>
                      <p className={set.infoValue}>{runtime.maxUploadMb} MB</p>
                    </div>
                    <div className={set.infoItem}>
                      <p className={set.infoLabel}>全局限流</p>
                      <p className={set.infoValue}>
                        {runtime.throttleLimit} 次 / {runtime.throttleTtlSec} 秒
                      </p>
                    </div>
                    <div className={set.infoItem}>
                      <p className={set.infoLabel}>Redis 运行态</p>
                      <p className={cn(set.infoValue, runtime.redis?.ready ? 'text-emerald-300' : 'text-amber-300')}>
                        {runtime.redis?.ready ? '已连接' : runtime.redis?.urlConfigured ? '未连接' : '未配置'}
                      </p>
                    </div>
                    <div className={set.infoItem}>
                      <p className={set.infoLabel}>文件解析 Worker</p>
                      <p className={cn(set.infoValue, 'font-sans text-sm')}>
                        {runtime.workers?.fileParseEnabled ? '已启用' : '已关闭'} · 并发{' '}
                        {runtime.workers?.fileParseMaxConcurrent ?? '-'} · 间隔{' '}
                        {runtime.workers?.fileParseIntervalMs ?? '-'}ms
                      </p>
                    </div>
                    <div className={cn(set.infoItem, 'sm:col-span-2')}>
                      <p className={set.infoLabel}>Redis 队列</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {(runtime.queues ?? []).map((queue) => (
                          <div
                            key={queue.name}
                            className="rounded-md border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))]/60 px-3 py-2"
                          >
                            <p className="truncate font-mono text-[11px] text-[hsl(var(--settings-text-muted))]">
                              {queue.name}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-[hsl(var(--settings-text-primary))]">
                              {queue.pending}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={cn(set.infoItem, 'sm:col-span-2')}>
                      <p className={set.infoLabel}>流式输出恢复</p>
                      <p className={cn(set.infoValue, 'break-all font-mono text-xs')}>
                        {runtime.streamRecovery?.enabled ? 'enabled' : 'fallback'} ·{' '}
                        {runtime.streamRecovery?.snapshotEndpoint ?? '/api/ai/streams/:recordId/snapshot'}
                      </p>
                    </div>
                    {typeof runtime.visionPdfMinTextChars === 'number' ? (
                      <div className={cn(set.infoItem, 'sm:col-span-2')}>
                        <p className={set.infoLabel}>PDF 视觉补充阈值</p>
                        <p className={cn(set.infoValue, 'font-sans text-sm')}>
                          提取文本少于 {runtime.visionPdfMinTextChars} 字时尝试首页视觉
                          {runtime.visionPdfAlways ? '（已强制对所有 PDF 尝试视觉）' : ''}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
              <p className={set.hint}>
                调整上传大小请在部署环境设置{' '}
                <code className="rounded bg-[hsl(var(--settings-info-bg))] px-1.5 py-0.5 font-mono text-xs">
                  MAX_FILE_SIZE
                </code>{' '}
                （字节）。
              </p>
            </SettingsCard>

            <FileParsingSettingsSection runtime={runtime} />

            {admin && multimodalConfig ? (
              <SettingsCard
                id="section-multimodal"
                icon={Sparkles}
                title="多模态配置"
                description="全局多模态开关、并发、缓存和成本阈值（实时生效，无需重启）"
                footer={
                  <Button className={set.btnPrimary} onClick={saveMultimodalConfig} disabled={multimodalSaving}>
                    <Save className="h-4 w-4" />
                    保存多模态配置
                  </Button>
                }
              >
                <div className="flex flex-wrap gap-2">
                  {multimodalConfig.multimodalEnabled ? (
                    <span className={cn(set.statusChip, set.badgeSuccess)}>多模态已启用</span>
                  ) : (
                    <span className={cn(set.statusChip, set.badgeMuted)}>多模态已关闭</span>
                  )}
                  <span className={cn(set.statusChip, set.badgeMuted)}>
                    自动降级
                    {multimodalConfig.autoDowngradeWhenOverBudget ? '开启' : '关闭'}
                  </span>
                  <span className={cn(set.statusChip, set.badgeMuted)}>缓存 {multimodalConfig.cacheTtlDays} 天</span>
                </div>
                <div className={set.formGrid}>
                  <label className={cn(set.toggleRow, 'sm:col-span-1')}>
                    <span className={set.toggleLabel}>启用多模态理解</span>
                    <input
                      type="checkbox"
                      className="settings-checkbox h-4 w-4"
                      checked={multimodalConfig.multimodalEnabled}
                      onChange={(e) =>
                        setMultimodalConfig((prev) => (prev ? { ...prev, multimodalEnabled: e.target.checked } : prev))
                      }
                    />
                  </label>
                  <label className={set.toggleRow}>
                    <span className={set.toggleLabel}>超阈值自动降级</span>
                    <input
                      type="checkbox"
                      className="settings-checkbox h-4 w-4"
                      checked={multimodalConfig.autoDowngradeWhenOverBudget}
                      onChange={(e) =>
                        setMultimodalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                autoDowngradeWhenOverBudget: e.target.checked,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>
                  <div className={set.formRow}>
                    <label className={set.label}>默认多模态模型</label>
                    <Input
                      className={set.control}
                      value={multimodalConfig.multimodalDefaultModel}
                      onChange={(e) =>
                        setMultimodalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                multimodalDefaultModel: e.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className={set.formRow}>
                    <label className={set.label}>默认纯文本模型</label>
                    <Input
                      className={set.control}
                      value={multimodalConfig.textFallbackModel}
                      onChange={(e) =>
                        setMultimodalConfig((prev) => (prev ? { ...prev, textFallbackModel: e.target.value } : prev))
                      }
                    />
                  </div>
                  <div className={set.formRow}>
                    <label className={set.label}>最大并发处理数</label>
                    <Input
                      className={set.control}
                      type="number"
                      min={1}
                      max={20}
                      value={multimodalConfig.maxConcurrentTasks}
                      onChange={(e) =>
                        setMultimodalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                maxConcurrentTasks: Number(e.target.value),
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className={set.formRow}>
                    <label className={set.label}>缓存天数</label>
                    <Input
                      className={set.control}
                      type="number"
                      min={1}
                      max={30}
                      value={multimodalConfig.cacheTtlDays}
                      onChange={(e) =>
                        setMultimodalConfig((prev) => (prev ? { ...prev, cacheTtlDays: Number(e.target.value) } : prev))
                      }
                    />
                  </div>
                  <div className={cn(set.formRow, 'sm:col-span-2')}>
                    <label className={set.label}>月度费用预警阈值（CNY）</label>
                    <Input
                      className={set.control}
                      type="number"
                      min={0}
                      step="0.01"
                      value={multimodalConfig.monthlyCostAlertCny}
                      onChange={(e) =>
                        setMultimodalConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                monthlyCostAlertCny: Number(e.target.value),
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </div>
              </SettingsCard>
            ) : null}

            <WorkflowDefaultsSection
              genPrefs={genPrefs}
              saving={prefsSaving}
              onChange={setGenPrefs}
              onSave={saveGenPreferences}
            />

            <AppearanceWeatherSection
              userPrefs={userPrefs}
              userPrefsSaving={userPrefsSaving}
              cityQuery={cityQuery}
              cityResults={cityResults}
              citySearching={citySearching}
              onCityQueryChange={setCityQuery}
              onSearchCities={() => void searchCities(cityQuery)}
              onPickCity={pickCity}
              onSaveUserPreferences={saveUserPreferences}
              onRotateWallpaper={rotateWallpaperNow}
            />

            <ModelHubSection
              admin={admin}
              adminModels={adminModels}
              publicModels={publicModels}
              loading={loadingModels}
              testingModelId={testingModelId}
              showCreate={showCreate}
              createForm={createForm}
              editingId={editingId}
              editDraft={editDraft}
              onRefresh={refreshModels}
              onShowCreateChange={setShowCreate}
              onCreateFormChange={setCreateForm}
              onSubmitCreate={submitCreate}
              onStartEdit={startEdit}
              onEditDraftChange={setEditDraft}
              onSaveEdit={saveEdit}
              onCancelEdit={() => {
                setEditingId(null)
                setEditDraft(null)
              }}
              onDelete={deleteModel}
              onSetDefault={setDefault}
              onTest={testModel}
            />

            {superAdmin ? (
              <SettingsCard
                id="section-super-admin"
                icon={KeyRound}
                title="超级管理员工具"
                description="用户查询、重置密码、修改角色（仅超级管理员可见）"
              >
                <div className="flex gap-2">
                  <Input
                    className={cn(set.control, 'flex-1')}
                    placeholder="搜索邮箱或用户名（最多展示 20 条）"
                    value={adminKeyword}
                    onChange={(e) => setAdminKeyword(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    className={set.btnSecondary}
                    onClick={refreshAdminUsers}
                    disabled={adminLoadingUsers}
                  >
                    <RefreshCw className={cn('h-4 w-4', adminLoadingUsers && 'animate-spin')} />
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className={cn(set.adminList, 'rounded-[18px] border border-[hsl(var(--settings-card-border))] p-3')}
                  >
                    {adminUsers.length === 0 ? (
                      <div className={set.empty}>
                        <p className={set.emptyTitle}>暂无数据</p>
                        <p className={set.emptySub}>请搜索或刷新用户列表</p>
                      </div>
                    ) : (
                      adminUsers.map((u) => {
                        const active = adminSelectedUser?.id === u.id
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setAdminSelectedUser(u)}
                            className={cn(set.adminUserBtn, active ? set.adminUserBtnActive : set.adminUserBtnIdle)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[hsl(var(--settings-text-primary))]">
                                  {u.username}
                                </p>
                                <p className="truncate text-xs text-[hsl(var(--settings-text-muted))]">{u.email}</p>
                              </div>
                              <span className={roleBadgeClass(u.role)}>{roleLabel(u.role)}</span>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                  <div className={cn(set.modelCard, 'min-h-[12rem]')}>
                    {!adminSelectedUser ? (
                      <div className={set.empty}>
                        <p className={set.emptySub}>选择左侧用户后，可重置密码或修改角色</p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className={set.label}>{adminSelectedUser.username}</p>
                          <p className={set.hint}>{adminSelectedUser.email}</p>
                        </div>
                        <Separator className="my-3 bg-[hsl(var(--settings-card-border))]/60" />
                        <div className={set.formRow}>
                          <label className={set.label}>修改角色</label>
                          <select
                            className={set.select}
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
                          <p className={set.hint}>角色层级：SUPER_ADMIN &gt; ADMIN &gt; MEMBER &gt; VIEWER</p>
                        </div>
                        <Separator className="my-3 bg-[hsl(var(--settings-card-border))]/60" />
                        <div className={set.formRow}>
                          <label className={set.label}>重置密码</label>
                          <Input
                            className={set.control}
                            type="password"
                            placeholder="新密码（建议至少 8 位）"
                            value={adminNewPwd}
                            onChange={(e) => setAdminNewPwd(e.target.value)}
                            disabled={adminOpLoading}
                          />
                          <Button
                            className={set.btnPrimary}
                            onClick={resetSelectedUserPassword}
                            disabled={adminOpLoading}
                          >
                            重置密码
                          </Button>
                          <p className={set.hint}>
                            {passwordPolicyMessage(adminNewPwd || '') === true
                              ? '密码强度 OK'
                              : passwordPolicyMessage(adminNewPwd || '')}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </SettingsCard>
            ) : null}

            {superAdmin ? (
              <SettingsCard
                id="section-invite-codes"
                icon={KeyRound}
                title="注册邀请码"
                description="管理灰度注册入口；历史邀请码只显示指纹，不回显明文"
                actions={
                  <Button
                    variant="outline"
                    className={set.btnSecondary}
                    onClick={() => void refreshInviteCodes()}
                    disabled={inviteLoading}
                  >
                    <RefreshCw className={cn('h-4 w-4', inviteLoading && 'animate-spin')} />
                    刷新
                  </Button>
                }
              >
                <div className={cn(set.modelCard, 'space-y-3')}>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className={set.formRow}>
                      <label className={set.label}>邀请码</label>
                      <Input
                        className={set.control}
                        placeholder="留空自动生成"
                        value={inviteDraft.code}
                        onChange={(e) => setInviteDraft((prev) => ({ ...prev, code: e.target.value }))}
                      />
                    </div>
                    <div className={set.formRow}>
                      <label className={set.label}>最大使用次数</label>
                      <Input
                        className={set.control}
                        inputMode="numeric"
                        placeholder="不限"
                        value={inviteDraft.maxUses}
                        onChange={(e) => setInviteDraft((prev) => ({ ...prev, maxUses: e.target.value }))}
                      />
                    </div>
                    <div className={set.formRow}>
                      <label className={set.label}>过期时间</label>
                      <Input
                        className={set.control}
                        type="datetime-local"
                        value={inviteDraft.expiresAt}
                        onChange={(e) => setInviteDraft((prev) => ({ ...prev, expiresAt: e.target.value }))}
                      />
                    </div>
                    <div className={set.formRow}>
                      <label className={set.label}>备注</label>
                      <Input
                        className={set.control}
                        placeholder="例如：朋友灰度测试"
                        value={inviteDraft.remark}
                        onChange={(e) => setInviteDraft((prev) => ({ ...prev, remark: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button className={set.btnPrimary} onClick={createInviteCode} disabled={inviteCreating}>
                      创建邀请码
                    </Button>
                    {lastCreatedInviteCode ? (
                      <div className="rounded-[14px] border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                        新邀请码：<span className="font-mono font-semibold">{lastCreatedInviteCode}</span>
                        <span className="ml-2 text-emerald-100/70">仅显示一次，请保存后分享</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={set.auditList}>
                  {inviteCodes.length === 0 && !inviteLoading ? (
                    <div className={set.empty}>
                      <KeyRound className={set.emptyIcon} />
                      <p className={set.emptyTitle}>暂无邀请码</p>
                      <p className={set.emptySub}>创建后即可开放邀请注册</p>
                    </div>
                  ) : (
                    inviteCodes.map((item) => {
                      const active = item.status === 'ACTIVE'
                      const usage =
                        item.maxUses === null ? `${item.usedCount} / 不限` : `${item.usedCount} / ${item.maxUses}`
                      return (
                        <div key={item.id} className={set.auditItem}>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-[hsl(var(--settings-text-primary))]">
                                指纹 #{item.codeFingerprint}
                              </p>
                              <p className="text-xs text-[hsl(var(--settings-text-muted))]">
                                使用次数：{usage}
                                {item.expiresAt ? ` · 过期：${format(new Date(item.expiresAt), 'yyyy-MM-dd HH:mm')}` : ' · 不限期'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(set.badge, active ? set.badgeSuccess : set.badgeMuted)}>
                                {active ? '启用中' : '已停用'}
                              </span>
                              <Button
                                variant="outline"
                                className={set.btnSecondary}
                                onClick={() => void setInviteCodeStatus(item, active ? 'DISABLED' : 'ACTIVE')}
                                disabled={inviteLoading}
                              >
                                {active ? '停用' : '启用'}
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-[hsl(var(--settings-text-muted))]">
                            创建人：{item.createdBy?.username ?? '系统'} · 创建时间：
                            {format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}
                            {item.lastUsedAt ? ` · 最近使用：${format(new Date(item.lastUsedAt), 'yyyy-MM-dd HH:mm')}` : ''}
                          </p>
                          {item.remark ? (
                            <p className="text-xs text-[hsl(var(--settings-text-muted))]">备注：{item.remark}</p>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </SettingsCard>
            ) : null}

            {superAdmin ? (
              <SettingsCard
                id="section-audit"
                icon={ClipboardList}
                title="运维审计日志"
                description="记录系统设置与管理员操作，不记录密码、API Key 等敏感内容"
                actions={
                  <Button
                    variant="outline"
                    className={set.btnSecondary}
                    onClick={() => void refreshAuditLogs()}
                    disabled={adminAuditLoading}
                  >
                    <RefreshCw className={cn('h-4 w-4', adminAuditLoading && 'animate-spin')} />
                    刷新
                  </Button>
                }
              >
                {adminAuditLogs.length === 0 && !adminAuditLoading ? (
                  <div className={set.empty}>
                    <ClipboardList className={set.emptyIcon} />
                    <p className={set.emptyTitle}>暂无审计记录</p>
                    <p className={set.emptySub}>管理员操作将显示在此处</p>
                  </div>
                ) : (
                  <div className={set.auditList}>
                    {adminAuditLogs.map((log) => {
                      const extra = formatAuditExtra(log.action, log.detail)
                      return (
                        <div key={log.id} className={set.auditItem}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={set.auditTime}>
                              {format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                            </span>
                            <span className={cn(set.badge, set.badgeMuted)}>{auditActionLabel(log.action)}</span>
                          </div>
                          <p className="break-words text-[hsl(var(--settings-text-primary))]">
                            <span className="text-[hsl(var(--settings-text-muted))]">操作者：</span>
                            {log.operator.username}
                            <span className="mx-1 text-[hsl(var(--settings-text-muted))]">→</span>
                            <span className="text-[hsl(var(--settings-text-muted))]">目标：</span>
                            {auditTargetLabel(log)}
                            {extra ? (
                              <span className="ml-1 text-[hsl(var(--settings-text-muted))]">（{extra}）</span>
                            ) : null}
                          </p>
                          {log.ip ? <p className="text-[hsl(var(--settings-text-muted))]">IP：{log.ip}</p> : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </SettingsCard>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
