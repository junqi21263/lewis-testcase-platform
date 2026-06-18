import { useMemo, useState } from 'react'
import { Bot, Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import type { AIModel } from '@/types'
import type { AIModelAdmin } from '@/api/settings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { ModelEditorPanel, type SettingsModelFormDraft } from '@/components/settings/ModelEditorPanel'
import {
  filterSettingsModels,
  getModelIssueTags,
  type SettingsModelFilter,
} from '@/utils/settingsModelPresets'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  admin: boolean
  adminModels: AIModelAdmin[]
  publicModels: AIModel[]
  loading: boolean
  testingModelId: string | null
  showCreate: boolean
  createForm: SettingsModelFormDraft
  editingId: string | null
  editDraft: SettingsModelFormDraft | null
  onRefresh: () => void
  onShowCreateChange: (show: boolean) => void
  onCreateFormChange: (next: SettingsModelFormDraft) => void
  onSubmitCreate: () => void
  onStartEdit: (model: AIModelAdmin) => void
  onEditDraftChange: (next: SettingsModelFormDraft) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onSetDefault: (id: string) => void
  onTest: (id: string) => void
}

const filters: Array<{ id: SettingsModelFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '仅启用' },
  { id: 'default', label: '默认' },
  { id: 'vision', label: '视觉' },
  { id: 'failed', label: '仅失败' },
]

export function ModelHubSection(props: Props) {
  const {
    admin,
    adminModels,
    publicModels,
    loading,
    testingModelId,
    showCreate,
    createForm,
    editingId,
    editDraft,
    onRefresh,
    onShowCreateChange,
    onCreateFormChange,
    onSubmitCreate,
    onStartEdit,
    onEditDraftChange,
    onSaveEdit,
    onCancelEdit,
    onDelete,
    onSetDefault,
    onTest,
  } = props
  const [filter, setFilter] = useState<SettingsModelFilter>('all')
  const visibleAdminModels = useMemo(() => filterSettingsModels(adminModels, filter), [adminModels, filter])

  return (
    <SettingsCard
      id="section-ai-models"
      icon={Bot}
      title="AI 模型中心"
      description={
        admin
          ? '集中管理模型用途、Provider、连通性、视觉能力和默认模型。'
          : '当前账号可查看已启用的模型；配置变更请联系管理员。'
      }
      actions={
        <>
          <Button variant="outline" className={set.btnSecondary} onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          {admin ? (
            <Button className={set.btnPrimary} onClick={() => onShowCreateChange(!showCreate)}>
              <Plus className="h-4 w-4" />
              {showCreate ? '收起新增' : '新增模型'}
            </Button>
          ) : null}
        </>
      }
    >
      {admin ? (
        <div className={set.segment} aria-label="模型筛选">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(set.segmentBtn, filter === item.id && set.segmentBtnActive)}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {admin && showCreate ? (
        <ModelEditorPanel
          title="新增模型"
          mode="create"
          draft={createForm}
          onChange={onCreateFormChange}
          onSave={onSubmitCreate}
          onCancel={() => onShowCreateChange(false)}
        />
      ) : null}

      {admin && visibleAdminModels.length === 0 ? (
        <div className={set.empty}>
          <Bot className={set.emptyIcon} />
          <p className={set.emptyTitle}>暂无匹配模型</p>
          <p className={set.emptySub}>请调整筛选条件或新增模型配置</p>
        </div>
      ) : null}

      <div className={admin ? set.modelList : 'space-y-4'}>
        {admin
          ? visibleAdminModels.map((model) => {
              const issues = getModelIssueTags(model)
              return (
                <div key={model.id} className={set.modelCard}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[hsl(var(--settings-text-primary))]">{model.name}</p>
                        {model.isDefault ? (
                          <Badge className="gap-1 text-xs">
                            <Star className="h-3 w-3" />
                            默认
                          </Badge>
                        ) : null}
                        {!model.isActive ? <span className={cn(set.badge, set.badgeMuted)}>已停用</span> : null}
                        <span className={cn(set.badge, model.hasApiKey ? set.badgeSuccess : set.badgeDanger)}>
                          Key: {model.hasApiKey ? '已配置' : '未配置'}
                        </span>
                        {model.supportsVision ? <span className={cn(set.badge, set.badgeViolet)}>视觉</span> : null}
                        {model.useForDocumentVisionParse ? (
                          <span className={cn(set.badge, set.badgeViolet)}>文档视觉解析</span>
                        ) : null}
                        {model.lastTestAt ? (
                          <span className={cn(set.badge, model.lastTestOk === false ? set.badgeDanger : set.badgeSuccess)}>
                            上次测试
                            {model.lastTestOk === true && model.lastTestLatencyMs != null
                              ? ` 成功 ${model.lastTestLatencyMs}ms`
                              : model.lastTestOk === false
                                ? ' 失败'
                                : ' -'}{' '}
                            · {format(new Date(model.lastTestAt), 'MM-dd HH:mm')}
                          </span>
                        ) : null}
                      </div>
                      {issues.length > 0 ? (
                        <p className="mt-2 text-xs text-[color:var(--settings-badge-danger-text)]">
                          诊断：{issues.join('、')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {model.isActive && !model.isDefault ? (
                        <Button className={set.btnGhost} onClick={() => onSetDefault(model.id)}>
                          设默认
                        </Button>
                      ) : null}
                      <Button
                        className={set.btnGhost}
                        onClick={() => onTest(model.id)}
                        disabled={!model.hasApiKey || testingModelId === model.id}
                        title={!model.hasApiKey ? '请先配置 API Key' : '发送一个小请求测试连通性'}
                      >
                        {testingModelId === model.id ? '测试中...' : '测试'}
                      </Button>
                      <Button className={set.btnGhost} onClick={() => onStartEdit(model)}>
                        编辑
                      </Button>
                      <Button
                        className={set.btnDanger}
                        onClick={() => onDelete(model.id)}
                        title="删除模型配置"
                        aria-label={`删除模型配置：${model.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {editingId === model.id && editDraft ? (
                    <div className="mt-4">
                      <ModelEditorPanel
                        title={`编辑 ${model.name}`}
                        mode="edit"
                        draft={editDraft}
                        onChange={onEditDraftChange}
                        onSave={() => onSaveEdit(model.id)}
                        onCancel={onCancelEdit}
                      />
                    </div>
                  ) : (
                    <div className={cn(set.infoGrid, 'mt-4')}>
                      <div className={set.infoItem}>
                        <p className={set.infoLabel}>Provider</p>
                        <p className={cn(set.infoValue, 'font-sans')}>{model.provider}</p>
                      </div>
                      <div className={set.infoItem}>
                        <p className={set.infoLabel}>Model ID</p>
                        <p className={cn(set.infoValue, 'font-sans')}>{model.modelId}</p>
                      </div>
                      <div className={cn(set.infoItem, 'sm:col-span-2')}>
                        <p className={set.infoLabel}>Base URL</p>
                        <p className={set.infoValue}>{model.baseUrl}</p>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          : publicModels.map((model) => (
              <div key={model.id} className={set.modelCard}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[hsl(var(--settings-text-primary))]">{model.name}</p>
                    <p className={cn(set.hint, 'mt-1')}>
                      {model.provider} · {model.modelId}
                    </p>
                  </div>
                  {model.isDefault ? <span className={cn(set.badge, set.badgeSuccess)}>默认</span> : null}
                </div>
              </div>
            ))}
      </div>
    </SettingsCard>
  )
}
