import { useEffect } from 'react'
import { cn } from '@/utils/cn'
import { set, type SettingsNavItem } from '@/utils/settingsUi'

type Props = {
  items: SettingsNavItem[]
  activeId: string
  onSelect: (id: string) => void
}

export function SettingsNav({ items, activeId, onSelect }: Props) {
  const visible = items.filter((i) => i.show !== false)

  useEffect(() => {
    const onScroll = () => {
      const offsets = visible.map((item) => {
        const el = document.getElementById(item.id)
        if (!el) return { id: item.id, top: Infinity }
        return { id: item.id, top: Math.abs(el.getBoundingClientRect().top - 120) }
      })
      const nearest = offsets.reduce((a, b) => (a.top < b.top ? a : b))
      if (nearest.top < 280) onSelect(nearest.id)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [visible, onSelect])

  const navBtn = (item: SettingsNavItem, className?: string) => (
    <button
      key={item.id}
      type="button"
      className={cn(
        set.navBtn,
        set.navBtnHover,
        activeId === item.id && set.navBtnActive,
        className,
      )}
      onClick={() => {
        onSelect(item.id)
        document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
    >
      {item.label}
    </button>
  )

  return (
    <nav className={set.navWrap} aria-label="设置分区">
      <div className={set.navMobile}>
        {visible.map((item) => navBtn(item, 'shrink-0'))}
      </div>
      <div className={set.navDesktop}>{visible.map((item) => navBtn(item, 'w-full'))}</div>
      <label className="sr-only" htmlFor="settings-nav-select">
        设置分区
      </label>
      <select
        id="settings-nav-select"
        className={cn(set.select, 'mt-2 lg:hidden')}
        value={activeId}
        onChange={(e) => {
          onSelect(e.target.value)
          document.getElementById(e.target.value)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
      >
        {visible.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </nav>
  )
}
