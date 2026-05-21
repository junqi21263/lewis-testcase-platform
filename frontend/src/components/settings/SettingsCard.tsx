import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  id?: string
  icon?: LucideIcon
  title: string
  description?: string
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}

export function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  actions,
  footer,
  children,
  className,
}: Props) {
  return (
    <section id={id} className={cn(set.card, className)}>
      <header className={set.cardHeader}>
        <div className={set.cardHeaderMain}>
          {Icon ? (
            <span className={set.cardIcon} aria-hidden>
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className={set.cardTitle}>{title}</h2>
            {description ? <p className={set.cardDesc}>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className={set.cardActions}>{actions}</div> : null}
      </header>
      <div className={set.cardBody}>{children}</div>
      {footer ? <footer className={set.cardFooter}>{footer}</footer> : null}
    </section>
  )
}
