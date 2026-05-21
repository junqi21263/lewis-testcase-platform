import { CloudSun, Image as ImageIcon } from 'lucide-react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import type { UserPreferences } from '@/api/preferences'
import type { WeatherCityItem } from '@/api/weather'
import { useThemeStore } from '@/store/themeStore'
import { cn } from '@/utils/cn'
import {
  loadAppearanceUiPrefs,
  saveAppearanceUiPrefs,
  type MotionLevel,
  type SettingsAppearanceUiPrefs,
  type WeatherEffectMode,
} from '@/utils/settingsAppearancePrefs'
import { set } from '@/utils/settingsUi'
import {
  weatherConditionLabel,
  type WeatherCondition,
} from '@/utils/weatherCondition'
import { SettingsCard } from './SettingsCard'
import { useEffect, useState } from 'react'

type Props = {
  userPrefs: UserPreferences | null
  userPrefsSaving: boolean
  cityQuery: string
  cityResults: WeatherCityItem[]
  citySearching: boolean
  onCityQueryChange: (q: string) => void
  onSearchCities: () => void
  onPickCity: (c: WeatherCityItem) => void
  onSaveUserPreferences: (patch: Partial<UserPreferences>) => void
  onRotateWallpaper: () => void
}

const CONDITIONS: WeatherCondition[] = [
  'sunny',
  'night',
  'cloudy',
  'rain',
  'thunder',
  'fog',
  'snow',
  'default',
]

function SegmentGroup<T extends string>({
  value,
  options,
  labels,
  onChange,
  disabled,
}: {
  value: T
  options: T[]
  labels: Record<T, string>
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className={set.segment} role="group">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          className={cn(
            set.segmentBtn,
            value === opt && set.segmentBtnActive,
          )}
          onClick={() => onChange(opt)}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  )
}

export function AppearanceWeatherSection(props: Props) {
  const {
    userPrefs,
    userPrefsSaving,
    cityQuery,
    cityResults,
    citySearching,
    onCityQueryChange,
    onSearchCities,
    onPickCity,
    onSaveUserPreferences,
    onRotateWallpaper,
  } = props

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [uiPrefs, setUiPrefs] = useState<SettingsAppearanceUiPrefs>(() => loadAppearanceUiPrefs())

  useEffect(() => {
    const onUpdate = () => setUiPrefs(loadAppearanceUiPrefs())
    window.addEventListener('settings-appearance-ui-updated', onUpdate)
    return () => window.removeEventListener('settings-appearance-ui-updated', onUpdate)
  }, [])

  const patchUi = (p: Partial<SettingsAppearanceUiPrefs>) => {
    setUiPrefs(saveAppearanceUiPrefs(p))
  }

  const themeMode = theme

  return (
    <SettingsCard
      id="appearance-weather"
      icon={ImageIcon}
      title="外观与天气"
      description="主题、动态壁纸、天气氛围与 Header 天气展示（城市需手动选择）"
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <p className={set.label}>主题模式</p>
          <SegmentGroup
            value={themeMode}
            options={['light', 'dark'] as const}
            labels={{ light: '浅色模式', dark: '深色模式' }}
            onChange={(v) => setTheme(v)}
          />
          <p className={set.hint}>深浅切换与右上角开关同步；跟随系统可在浏览器或 OS 中设置后刷新页面。</p>
        </div>

        <Separator className="bg-[hsl(var(--settings-card-border))]/60" />

        <div className={set.toggleRow}>
          <div>
            <p className={set.toggleLabel}>动态壁纸（网页背景）</p>
            <p className={set.toggleHint}>开启后加载 Bing 每日壁纸；下方频率控制自动更换</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="settings-checkbox h-4 w-4 rounded"
              checked={!!userPrefs?.wallpaperEnabled}
              onChange={(e) => onSaveUserPreferences({ wallpaperEnabled: e.target.checked })}
              disabled={userPrefsSaving}
            />
            开启
          </label>
        </div>

        <div className={set.formGrid}>
          <div className={set.formRow}>
            <label className={set.label}>壁纸更换频率</label>
            <select
              className={set.select}
              value={String(userPrefs?.wallpaperIntervalSec ?? 0)}
              onChange={(e) =>
                onSaveUserPreferences({ wallpaperIntervalSec: Number(e.target.value) })
              }
              disabled={userPrefsSaving}
            >
              <option value="0">每次进入（手动触发）</option>
              <option value={String(3600)}>每小时</option>
              <option value={String(24 * 3600)}>每日一次</option>
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              variant="outline"
              className={set.btnSecondary}
              onClick={onRotateWallpaper}
              disabled={userPrefsSaving}
            >
              换一张
            </Button>
            {userPrefs?.wallpaperLastAt ? (
              <span className={set.hint}>
                上次：{format(new Date(userPrefs.wallpaperLastAt), 'yyyy-MM-dd HH:mm')}
              </span>
            ) : null}
          </div>
        </div>

        <Separator className="bg-[hsl(var(--settings-card-border))]/60" />

        <div className="space-y-3">
          <p className={set.label}>天气动效氛围</p>
          <SegmentGroup<WeatherEffectMode>
            value={uiPrefs.weatherEffectMode}
            options={['follow', 'manual', 'off']}
            labels={{ follow: '跟随当前城市', manual: '手动选择', off: '关闭动效' }}
            onChange={(v) => patchUi({ weatherEffectMode: v })}
          />
          {uiPrefs.weatherEffectMode === 'manual' ? (
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    set.statusChip,
                    uiPrefs.manualWeatherCondition === c
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : set.badgeMuted,
                  )}
                  onClick={() => patchUi({ manualWeatherCondition: c })}
                >
                  {weatherConditionLabel(c)}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <p className={set.label}>动效强度</p>
          <SegmentGroup<MotionLevel>
            value={uiPrefs.motionLevel}
            options={['low', 'medium', 'high']}
            labels={{ low: '低', medium: '中', high: '高' }}
            onChange={(v) => patchUi({ motionLevel: v })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={cn(set.toggleRow, 'flex-col items-stretch sm:flex-row sm:items-center')}>
            <span className={set.toggleLabel}>可读性保护 · 背景遮罩</span>
            <input
              type="checkbox"
              className="settings-checkbox h-4 w-4"
              checked={uiPrefs.readabilityMask}
              onChange={(e) => patchUi({ readabilityMask: e.target.checked })}
            />
          </label>
          <label className={cn(set.toggleRow, 'flex-col items-stretch sm:flex-row sm:items-center')}>
            <span className={set.toggleLabel}>降低壁纸亮度</span>
            <input
              type="checkbox"
              className="settings-checkbox h-4 w-4"
              checked={uiPrefs.reduceWallpaperBrightness}
              onChange={(e) => patchUi({ reduceWallpaperBrightness: e.target.checked })}
            />
          </label>
          <label className={cn(set.toggleRow, 'flex-col items-stretch sm:flex-row sm:items-center')}>
            <span className={set.toggleLabel}>降低动效透明度</span>
            <input
              type="checkbox"
              className="settings-checkbox h-4 w-4"
              checked={uiPrefs.reduceMotionOpacity}
              onChange={(e) => patchUi({ reduceMotionOpacity: e.target.checked })}
            />
          </label>
          <label className={cn(set.toggleRow, 'flex-col items-stretch sm:flex-row sm:items-center')}>
            <span className={set.toggleLabel}>省电 / 低动效</span>
            <input
              type="checkbox"
              className="settings-checkbox h-4 w-4"
              checked={uiPrefs.lowPowerMode}
              onChange={(e) => patchUi({ lowPowerMode: e.target.checked })}
            />
          </label>
        </div>
        <p className={set.hint}>系统开启「减少动态效果」时将自动降级为静态渐变背景。</p>

        <Separator className="bg-[hsl(var(--settings-card-border))]/60" />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CloudSun className="h-[18px] w-[18px] text-[hsl(var(--settings-text-secondary))]" />
            <p className={set.label}>天气城市</p>
          </div>
          <p className={set.hint}>
            当前：{userPrefs?.weatherCityName ? userPrefs.weatherCityName : '未设置'}
            {userPrefs?.weatherCityAdm1 ? ` · ${userPrefs.weatherCityAdm1}` : ''}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className={set.control}
              value={cityQuery}
              onChange={(e) => onCityQueryChange(e.target.value)}
              placeholder="搜索城市（如：北京、上海、深圳）"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onSearchCities()
                }
              }}
            />
            <Button
              variant="outline"
              className={cn(set.btnSecondary, 'shrink-0')}
              onClick={onSearchCities}
              disabled={citySearching || userPrefsSaving}
            >
              {citySearching ? '搜索中…' : '搜索'}
            </Button>
          </div>
          {cityResults.length > 0 ? (
            <div className={set.cityList}>
              {cityResults.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={set.cityBtn}
                  onClick={() => onPickCity(c)}
                >
                  <span className="min-w-0 truncate">
                    {c.name}
                    {c.adm1 ? ` · ${c.adm1}` : ''}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-[hsl(var(--settings-text-muted))]">
                    {c.id}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </SettingsCard>
  )
}
