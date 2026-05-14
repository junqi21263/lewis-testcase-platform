import toast from 'react-hot-toast'
import { copyTextToClipboard } from '@/utils/clipboard'

function trimLong(s: string, max = 140): { short: string; long?: string } {
  const t = s.trim()
  if (t.length <= max) return { short: t }
  return { short: `${t.slice(0, max)}…`, long: t }
}

export const notify = {
  success: (message: string) =>
    toast.success(message, {
      duration: 3500,
      className: 'ui-toast',
      ariaProps: { role: 'status', 'aria-live': 'polite' },
    }),
  info: (message: string) =>
    toast(message, {
      duration: 4000,
      className: 'ui-toast',
      ariaProps: { role: 'status', 'aria-live': 'polite' },
    }),
  warn: (message: string) =>
    toast(message, {
      duration: 5500,
      className: 'ui-toast',
      icon: '⚠️',
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }),
  error: (message: string) => {
    const { short, long } = trimLong(message)
    if (!long)
      return toast.error(short, {
        duration: 5500,
        className: 'ui-toast',
        ariaProps: { role: 'alert', 'aria-live': 'assertive' },
      })
    return toast.custom(
      (t) => (
        <div
          role="alert"
          aria-live="assertive"
          className={[
            'ui-toast flex w-full min-h-[56px] max-w-lg flex-col gap-2 rounded-[17px] border p-4 shadow-lg',
            t.visible ? 'ui-toast-motion motion-safe:animate-[ui-toast-in-desktop_0.2s_ease-out_both]' : 'opacity-0',
          ].join(' ')}
          style={{
            background: 'var(--ui-toast-bg)',
            borderColor: 'var(--ui-toast-border)',
            boxShadow: 'var(--ui-toast-shadow)',
          }}
        >
          <div className="text-[length:var(--text-button-size)] font-semibold" style={{ color: 'var(--ui-text-danger)' }}>
            发生错误
          </div>
          <div className="text-[length:var(--text-small-size)] leading-[1.45] break-words" style={{ color: 'var(--ui-toast-desc)' }}>
            {short}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-[color:var(--ui-toast-border)] bg-transparent px-3 py-1.5 text-[length:var(--text-caption-size)] font-medium text-[color:var(--ui-modal-title)] transition-[opacity,transform] hover:bg-[color:var(--ui-report-inline-bg)]"
              onClick={async () => {
                await copyTextToClipboard(long)
                toast.success('已复制错误详情')
              }}
            >
              复制详情
            </button>
            <button
              type="button"
              className="rounded-lg border border-[color:var(--ui-toast-border)] bg-transparent px-3 py-1.5 text-[length:var(--text-caption-size)] font-medium text-[color:var(--ui-modal-title)] transition-[opacity,transform] hover:bg-[color:var(--ui-report-inline-bg)]"
              onClick={() => toast.dismiss(t.id)}
            >
              关闭
            </button>
          </div>
        </div>
      ),
      { duration: 8000 },
    )
  },
}
