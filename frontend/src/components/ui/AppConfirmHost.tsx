import { useAppConfirmStore, resolveAppConfirm } from '@/store/appConfirmStore'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/** 全局 `appConfirm()` 的受控弹窗宿主，挂载在应用根部一次即可 */
export function AppConfirmHost() {
  const open = useAppConfirmStore((s) => s.open)
  const payload = useAppConfirmStore((s) => s.payload)

  return (
    <ConfirmDialog
      open={open}
      title={payload?.title ?? ''}
      description={payload?.description}
      confirmText={payload?.confirmText}
      cancelText={payload?.cancelText}
      confirmVariant={payload?.confirmVariant}
      size={payload?.size}
      onCancel={() => resolveAppConfirm(false)}
      onConfirm={() => {
        resolveAppConfirm(true)
      }}
    />
  )
}
