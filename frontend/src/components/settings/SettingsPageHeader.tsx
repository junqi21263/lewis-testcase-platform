import { Moon, Sparkles, Sun } from 'lucide-react'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  themeLabel: string
  cityLabel: string
  savedHint?: string | null
}

export function SettingsPageHeader({ themeLabel, cityLabel, savedHint }: Props) {
  return (
    <header className={set.header}>
      <div className={set.headerMain}>
        <h1 className={set.headerTitle}>
          <span className={set.headerSpark} aria-hidden>
            <Sparkles className="h-4 w-4" strokeWidth={2} />
          </span>
          系统设置
        </h1>
        <p className={set.headerSub}>
          个人资料、运行环境、AI 模型与外观天气配置
        </p>
      </div>
      <div className={set.headerMeta}>
        <span className={set.headerChip}>
          {themeLabel.includes('深') ? (
            <Moon className="h-3.5 w-3.5 opacity-80" />
          ) : (
            <Sun className="h-3.5 w-3.5 opacity-80" />
          )}
          {themeLabel}
        </span>
        <span className={cn(set.headerChip, 'max-w-[10rem] truncate')} title={cityLabel}>
          {cityLabel}
        </span>
        {savedHint ? <span className={set.headerChip}>{savedHint}</span> : null}
      </div>
    </header>
  )
}
