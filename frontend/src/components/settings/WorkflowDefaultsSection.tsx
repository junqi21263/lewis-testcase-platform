import { Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsCard } from '@/components/settings/SettingsCard'
import type { GenPrefs } from '@/utils/genPrefs'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  genPrefs: GenPrefs
  saving: boolean
  onChange: (next: GenPrefs) => void
  onSave: () => void
}

export function WorkflowDefaultsSection({ genPrefs, saving, onChange, onSave }: Props) {
  return (
    <SettingsCard
      id="section-workflow-defaults"
      icon={Sparkles}
      title="工作流默认值"
      description="控制用例生成、AI 输出长度和默认发散程度；后续可扩展到需求分析与交叉评审"
      footer={
        <Button variant="outline" className={set.btnSecondary} onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4" />
          保存工作流默认值
        </Button>
      }
    >
      <div className={set.formGrid}>
        <div className={set.formRow}>
          <label className={set.label}>用例生成 temperature</label>
          <p className={set.hint}>越高越发散，建议 0.3-1.0</p>
          <div className={set.sliderRow}>
            <input
              type="range"
              className={set.slider}
              min={0}
              max={2}
              step={0.05}
              value={genPrefs.defaultTemperature}
              onChange={(e) => onChange({ ...genPrefs, defaultTemperature: Number(e.target.value) })}
            />
            <Input
              className={cn(set.control, 'w-24 shrink-0')}
              type="number"
              step="0.05"
              min={0}
              max={2}
              value={genPrefs.defaultTemperature}
              onChange={(e) => onChange({ ...genPrefs, defaultTemperature: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className={set.formRow}>
          <label className={set.label}>用例生成 maxTokens</label>
          <p className={set.hint}>长输出建议配置到模型允许的最大值，并配合分批生成</p>
          <Input
            className={set.control}
            type="number"
            step={256}
            min={256}
            max={128000}
            value={genPrefs.defaultMaxTokens}
            onChange={(e) => onChange({ ...genPrefs, defaultMaxTokens: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className={set.infoItem}>
        <p className={set.infoLabel}>截断处理建议</p>
        <p className={cn(set.infoValue, 'font-sans text-sm')}>
          如果模型仍提示达到最大 Token，请优先提高模型配置 maxTokens，其次使用分批生成或缩小单次范围。
        </p>
      </div>
    </SettingsCard>
  )
}
