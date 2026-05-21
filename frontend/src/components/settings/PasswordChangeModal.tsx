import * as Dialog from '@radix-ui/react-dialog'
import { Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/utils/cn'
import { set } from '@/utils/settingsUi'

type Props = {
  open: boolean
  oldPassword: string
  newPassword: string
  confirmPassword: string
  saving: boolean
  onOldChange: (v: string) => void
  onNewChange: (v: string) => void
  onConfirmChange: (v: string) => void
  onClose: () => void
  onSave: () => void
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className={set.formRow}>
      <label className={set.label}>{label}</label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          className={cn(set.control, 'pr-10')}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
        />
        <button
          type="button"
          className={cn(set.iconBtn, 'absolute right-1 top-1/2 -translate-y-1/2')}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? '隐藏密码' : '显示密码'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export function PasswordChangeModal(props: Props) {
  const {
    open,
    oldPassword,
    newPassword,
    confirmPassword,
    saving,
    onOldChange,
    onNewChange,
    onConfirmChange,
    onClose,
    onSave,
  } = props
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-confirm-dialog-overlay fixed inset-0 z-[140] motion-reduce:!animate-none" />
        <Dialog.Content
          aria-modal
          role="dialog"
          className="ui-confirm-dialog-layer fixed inset-0 z-[141] outline-none motion-reduce:!animate-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            closeRef.current?.focus()
          }}
          onEscapeKeyDown={onClose}
        >
          <div className="ui-settings-form-panel pointer-events-auto">
            <header className="ui-settings-form-panel__header flex shrink-0 items-center justify-between gap-3 border-b border-[hsl(var(--settings-card-border))] px-6 py-4">
              <Dialog.Title className="text-lg font-bold text-[hsl(var(--settings-text-primary))]">
                修改密码
              </Dialog.Title>
              <button ref={closeRef} type="button" className={set.iconBtn} onClick={onClose} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </header>
            <Dialog.Description className="sr-only">修改登录密码</Dialog.Description>
            <div className="ui-settings-form-panel__body settings-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                <PasswordField
                  label="当前密码"
                  value={oldPassword}
                  onChange={onOldChange}
                  placeholder="输入当前密码"
                />
                <PasswordField
                  label="新密码"
                  value={newPassword}
                  onChange={onNewChange}
                  placeholder="至少 8 位，含字母与数字"
                />
                <PasswordField
                  label="确认新密码"
                  value={confirmPassword}
                  onChange={onConfirmChange}
                  placeholder="再次输入新密码"
                />
              </div>
            </div>
            <footer className="ui-settings-form-panel__footer flex shrink-0 flex-wrap justify-end gap-2 border-t border-[hsl(var(--settings-card-border))] px-6 py-4">
              <Button variant="outline" className={set.btnSecondary} onClick={onClose} disabled={saving}>
                取消
              </Button>
              <Button className={set.btnPrimary} onClick={onSave} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
