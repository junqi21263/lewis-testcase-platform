import { Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SETTINGS_PROVIDER_PRESETS,
  getProviderPreset,
  type ProviderPreset,
} from '@/utils/settingsModelPresets'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

export type SettingsModelFormDraft = {
  name: string
  provider: string
  modelId: string
  baseUrl: string
  apiKey?: string
  maxTokens: number
  temperature: number
  isDefault: boolean
  isActive?: boolean
  supportsVision: boolean
  useForDocumentVisionParse: boolean
}

type Props = {
  title: string
  mode: 'create' | 'edit'
  draft: SettingsModelFormDraft
  onChange: (next: SettingsModelFormDraft) => void
  onSave: () => void
  onCancel: () => void
}

function applyPreset(draft: SettingsModelFormDraft, preset: ProviderPreset): SettingsModelFormDraft {
  return {
    ...draft,
    provider: preset.provider,
    modelId: preset.modelId,
    baseUrl: preset.baseUrl,
    maxTokens: preset.maxTokens,
    temperature: preset.temperature,
    supportsVision: preset.supportsVision,
  }
}

export function ModelEditorPanel({ title, mode, draft, onChange, onSave, onCancel }: Props) {
  return (
    <div className="space-y-4 rounded-[18px] border border-[hsl(var(--settings-card-border))] bg-[hsl(var(--settings-info-bg))]/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={set.label}>{title}</p>
          <p className={set.hint}>
            {mode === 'create' ? '选择 Provider 预设可快速填充 OpenAI 兼容网关参数。' : 'API Key 留空时不会覆盖已有密钥。'}
          </p>
        </div>
        <Button className={set.btnGhost} onClick={onCancel}>
          <X className="h-4 w-4" />
          取消
        </Button>
      </div>

      {mode === 'create' ? (
        <div className={set.formRow}>
          <label htmlFor="settings-provider-preset" className={set.label}>
            Provider 预设
          </label>
          <select
            id="settings-provider-preset"
            aria-label="Provider 预设"
            className={set.select}
            defaultValue=""
            onChange={(e) => {
              const preset = getProviderPreset(e.target.value)
              if (preset) onChange(applyPreset(draft, preset))
            }}
          >
            <option value="">选择预设...</option>
            {SETTINGS_PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className={set.formGrid}>
        <div className={set.formRow}>
          <label htmlFor={`${mode}-model-name`} className={set.label}>
            显示名称
          </label>
          <Input
            id={`${mode}-model-name`}
            className={set.control}
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </div>
        <div className={set.formRow}>
          <label htmlFor={`${mode}-model-provider`} className={set.label}>
            Provider
          </label>
          <Input
            id={`${mode}-model-provider`}
            className={set.control}
            value={draft.provider}
            onChange={(e) => onChange({ ...draft, provider: e.target.value })}
          />
        </div>
        <div className={set.formRow}>
          <label htmlFor={`${mode}-model-id`} className={set.label}>
            Model ID
          </label>
          <Input
            id={`${mode}-model-id`}
            aria-label="Model ID"
            className={set.control}
            value={draft.modelId}
            onChange={(e) => onChange({ ...draft, modelId: e.target.value })}
          />
        </div>
        <div className={set.formRow}>
          <label htmlFor={`${mode}-base-url`} className={set.label}>
            Base URL
          </label>
          <Input
            id={`${mode}-base-url`}
            aria-label="Base URL"
            className={set.control}
            value={draft.baseUrl}
            onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
          />
        </div>
        <div className={cn(set.formRow, 'sm:col-span-2')}>
          <label htmlFor={`${mode}-api-key`} className={set.label}>
            API Key
          </label>
          <Input
            id={`${mode}-api-key`}
            className={set.control}
            type="password"
            autoComplete="off"
            value={draft.apiKey ?? ''}
            placeholder={mode === 'edit' ? '留空不修改' : ''}
            onChange={(e) => onChange({ ...draft, apiKey: e.target.value })}
          />
        </div>
        <div className={set.formRow}>
          <label htmlFor={`${mode}-max-tokens`} className={set.label}>
            maxTokens
          </label>
          <Input
            id={`${mode}-max-tokens`}
            className={set.control}
            type="number"
            value={draft.maxTokens}
            onChange={(e) => onChange({ ...draft, maxTokens: Number(e.target.value) })}
          />
        </div>
        <div className={set.formRow}>
          <label htmlFor={`${mode}-temperature`} className={set.label}>
            temperature
          </label>
          <Input
            id={`${mode}-temperature`}
            className={set.control}
            type="number"
            step="0.05"
            value={draft.temperature}
            onChange={(e) => onChange({ ...draft, temperature: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className={set.toggleRow}>
          <span className={set.toggleLabel}>设为默认模型</span>
          <input
            type="checkbox"
            className="settings-checkbox h-4 w-4"
            checked={draft.isDefault}
            onChange={(e) => onChange({ ...draft, isDefault: e.target.checked })}
          />
        </label>
        <label className={set.toggleRow}>
          <span className={set.toggleLabel}>支持视觉</span>
          <input
            type="checkbox"
            className="settings-checkbox h-4 w-4"
            checked={draft.supportsVision}
            onChange={(e) => onChange({ ...draft, supportsVision: e.target.checked })}
          />
        </label>
        <label className={cn(set.toggleRow, 'sm:col-span-2')}>
          <span>
            <span className={set.toggleLabel}>文档视觉解析专用</span>
            <span className={set.toggleHint}>全局仅一个，建议选择视觉能力稳定的模型。</span>
          </span>
          <input
            type="checkbox"
            className="settings-checkbox h-4 w-4"
            checked={draft.useForDocumentVisionParse}
            onChange={(e) => onChange({ ...draft, useForDocumentVisionParse: e.target.checked })}
          />
        </label>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button className={set.btnSecondary} onClick={onCancel}>
          取消
        </Button>
        <Button className={set.btnPrimary} onClick={onSave}>
          <Save className="h-4 w-4" />
          保存
        </Button>
      </div>
    </div>
  )
}
